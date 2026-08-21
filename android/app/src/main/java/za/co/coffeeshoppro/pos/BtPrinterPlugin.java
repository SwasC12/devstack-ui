package za.co.coffeeshoppro.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

// Bluetooth Classic (SPP) receipt printing for ESC/POS thermal printers - the
// protocol used by Epson TM series (in ESC/POS mode) and virtually all cheap
// 58/80mm generic printers. The printer is paired once in Android Settings;
// this plugin lists the bonded devices, and prints a base64 ESC/POS payload the
// JS layer builds. Everything is best-effort and never crashes the app.
//
// NOTE: written without a physical printer to test against - the SPP/RFCOMM +
// ESC/POS path is the well-established standard, but expect a small tweak pass
// once real hardware is connected.
@CapacitorPlugin(name = "BtPrinter")
public class BtPrinterPlugin extends Plugin {

    // Standard Serial Port Profile UUID - what SPP thermal printers advertise.
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int PERM_REQUEST = 7311;

    private boolean hasConnectPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true; // pre-Android 12: manifest perms suffice
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void requestConnectPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getActivity().requestPermissions(new String[]{ Manifest.permission.BLUETOOTH_CONNECT }, PERM_REQUEST);
        }
    }

    // List paired (bonded) Bluetooth devices so the user can pick their printer.
    @PluginMethod
    public void listDevices(PluginCall call) {
        if (!hasConnectPermission()) {
            requestConnectPermission();
            call.reject("BLUETOOTH_PERMISSION", "Bluetooth permission needed - allow it and try again.");
            return;
        }
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) { call.reject("NO_BLUETOOTH", "This device has no Bluetooth."); return; }
            if (!adapter.isEnabled()) { call.reject("BT_OFF", "Bluetooth is turned off."); return; }

            JSArray devices = new JSArray();
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            for (BluetoothDevice d : bonded) {
                JSObject o = new JSObject();
                o.put("name", d.getName() != null ? d.getName() : d.getAddress());
                o.put("address", d.getAddress());
                devices.put(o);
            }
            JSObject ret = new JSObject();
            ret.put("devices", devices);
            call.resolve(ret);
        } catch (SecurityException e) {
            requestConnectPermission();
            call.reject("BLUETOOTH_PERMISSION", "Bluetooth permission needed - allow it and try again.");
        } catch (Exception e) {
            call.reject("LIST_FAILED", e.getMessage());
        }
    }

    // Print a base64-encoded ESC/POS byte payload to the given printer address.
    // Runs off the main thread; opens an RFCOMM socket, writes, and closes.
    @PluginMethod
    public void print(PluginCall call) {
        String address = call.getString("address");
        String base64 = call.getString("data");
        if (address == null || address.isEmpty()) { call.reject("NO_ADDRESS", "No printer selected."); return; }
        if (base64 == null || base64.isEmpty()) { call.reject("NO_DATA", "Nothing to print."); return; }
        if (!hasConnectPermission()) {
            requestConnectPermission();
            call.reject("BLUETOOTH_PERMISSION", "Bluetooth permission needed - allow it and try again.");
            return;
        }

        final byte[] payload;
        try { payload = Base64.decode(base64, Base64.DEFAULT); }
        catch (Exception e) { call.reject("BAD_DATA", "Invalid print data."); return; }

        new Thread(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) { call.reject("NO_BLUETOOTH", "This device has no Bluetooth."); return; }
                if (!adapter.isEnabled()) { call.reject("BT_OFF", "Bluetooth is turned off."); return; }

                BluetoothDevice device = adapter.getRemoteDevice(address);
                adapter.cancelDiscovery(); // discovery slows/blocks a connect
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
                OutputStream out = socket.getOutputStream();
                // Write in chunks - some printers choke on one large write.
                final int chunk = 512;
                for (int i = 0; i < payload.length; i += chunk) {
                    int len = Math.min(chunk, payload.length - i);
                    out.write(payload, i, len);
                    out.flush();
                    try { Thread.sleep(20); } catch (InterruptedException ignored) {}
                }
                out.flush();
                try { Thread.sleep(150); } catch (InterruptedException ignored) {} // let the buffer drain before closing
                call.resolve();
            } catch (SecurityException e) {
                call.reject("BLUETOOTH_PERMISSION", "Bluetooth permission needed - allow it and try again.");
            } catch (Exception e) {
                call.reject("PRINT_FAILED", e.getMessage() != null ? e.getMessage() : "Could not reach the printer.");
            } finally {
                if (socket != null) { try { socket.close(); } catch (Exception ignored) {} }
            }
        }).start();
    }
}

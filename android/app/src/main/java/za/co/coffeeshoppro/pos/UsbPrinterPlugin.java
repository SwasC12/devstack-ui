package za.co.coffeeshoppro.pos;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// USB ESC/POS receipt printing for thermal printers connected over USB (via an
// OTG cable / hub). The printer is matched by vendorId + productId so it survives
// replugs. Android needs a per-device runtime USB permission, requested on demand
// with a system dialog. Everything is best-effort and never crashes the app.
//
// NOTE: written without a physical USB printer to test against — the USB-host
// bulk-transfer + ESC/POS path is the standard approach, but expect a small tweak
// pass once real hardware is connected.
@CapacitorPlugin(name = "UsbPrinter")
public class UsbPrinterPlugin extends Plugin {

    private static final String ACTION_USB_PERMISSION = "za.co.coffeeshoppro.pos.USB_PERMISSION";

    private UsbManager usb() { return (UsbManager) getContext().getSystemService(Context.USB_SERVICE); }

    // True if the device exposes a bulk OUT endpoint we can write to (printer-ish).
    private boolean isPrinterLike(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface intf = d.getInterface(i);
            if (intf.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return true;
            for (int e = 0; e < intf.getEndpointCount(); e++) {
                UsbEndpoint ep = intf.getEndpoint(e);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK
                        && ep.getDirection() == UsbConstants.USB_DIR_OUT) return true;
            }
        }
        return false;
    }

    // List attached USB devices that look like printers.
    @PluginMethod
    public void listDevices(PluginCall call) {
        try {
            UsbManager m = usb();
            if (m == null) { call.reject("NO_USB", "USB is not available on this device."); return; }
            JSArray devices = new JSArray();
            for (UsbDevice d : m.getDeviceList().values()) {
                if (!isPrinterLike(d)) continue;
                JSObject o = new JSObject();
                String name = d.getProductName();
                if (name == null || name.isEmpty()) name = "USB printer " + d.getVendorId() + ":" + d.getProductId();
                o.put("name", name);
                o.put("vendorId", d.getVendorId());
                o.put("productId", d.getProductId());
                o.put("hasPermission", m.hasPermission(d));
                devices.put(o);
            }
            JSObject ret = new JSObject();
            ret.put("devices", devices);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("LIST_FAILED", e.getMessage());
        }
    }

    // Print a base64 ESC/POS payload to the printer matched by vendorId+productId.
    @PluginMethod
    public void print(PluginCall call) {
        Integer vid = call.getInt("vendorId");
        Integer pid = call.getInt("productId");
        String base64 = call.getString("data");
        if (vid == null || pid == null) { call.reject("NO_DEVICE", "No printer selected."); return; }
        if (base64 == null || base64.isEmpty()) { call.reject("NO_DATA", "Nothing to print."); return; }

        UsbManager m = usb();
        if (m == null) { call.reject("NO_USB", "USB is not available on this device."); return; }

        UsbDevice device = null;
        for (UsbDevice d : m.getDeviceList().values()) {
            if (d.getVendorId() == vid && d.getProductId() == pid) { device = d; break; }
        }
        if (device == null) { call.reject("NOT_CONNECTED", "That USB printer isn't connected."); return; }

        final byte[] payload;
        try { payload = Base64.decode(base64, Base64.DEFAULT); }
        catch (Exception e) { call.reject("BAD_DATA", "Invalid print data."); return; }

        if (m.hasPermission(device)) {
            writeToDevice(device, payload, call);
        } else {
            requestPermissionThenPrint(device, payload, call);
        }
    }

    // Ask the system for permission to this device, then print when granted.
    private void requestPermissionThenPrint(final UsbDevice device, final byte[] payload, final PluginCall call) {
        final UsbManager m = usb();
        final Context ctx = getContext();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent intent) {
                if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
                try { ctx.unregisterReceiver(this); } catch (Exception ignored) {}
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (granted) writeToDevice(device, payload, call);
                else call.reject("PERMISSION_DENIED", "USB permission denied for the printer.");
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        ContextCompat.registerReceiver(ctx, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);

        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, new Intent(ACTION_USB_PERMISSION).setPackage(ctx.getPackageName()), flags);
        m.requestPermission(device, pi);
    }

    // Open the printer, claim its interface, and write the payload to the bulk OUT
    // endpoint in chunks. Runs off the main thread.
    private void writeToDevice(final UsbDevice device, final byte[] payload, final PluginCall call) {
        new Thread(() -> {
            UsbDeviceConnection conn = null;
            UsbInterface claimed = null;
            try {
                UsbInterface intf = null;
                UsbEndpoint out = null;
                // Prefer a real printer-class interface; otherwise any bulk-OUT one.
                for (int i = 0; i < device.getInterfaceCount() && out == null; i++) {
                    UsbInterface ui = device.getInterface(i);
                    for (int e = 0; e < ui.getEndpointCount(); e++) {
                        UsbEndpoint ep = ui.getEndpoint(e);
                        if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK
                                && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                            intf = ui; out = ep;
                            if (ui.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) break;
                        }
                    }
                }
                if (intf == null || out == null) { call.reject("NO_ENDPOINT", "No writable endpoint on that printer."); return; }

                conn = usb().openDevice(device);
                if (conn == null) { call.reject("OPEN_FAILED", "Couldn't open the USB printer."); return; }
                if (!conn.claimInterface(intf, true)) { call.reject("CLAIM_FAILED", "Couldn't claim the printer interface."); return; }
                claimed = intf;

                final int chunk = 4096;
                for (int i = 0; i < payload.length; i += chunk) {
                    int len = Math.min(chunk, payload.length - i);
                    byte[] slice = new byte[len];
                    System.arraycopy(payload, i, slice, 0, len);
                    int sent = conn.bulkTransfer(out, slice, len, 5000);
                    if (sent < 0) { call.reject("WRITE_FAILED", "The printer didn't accept the data."); return; }
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("PRINT_FAILED", e.getMessage() != null ? e.getMessage() : "Could not print.");
            } finally {
                try { if (conn != null && claimed != null) conn.releaseInterface(claimed); } catch (Exception ignored) {}
                try { if (conn != null) conn.close(); } catch (Exception ignored) {}
            }
        }).start();
    }
}

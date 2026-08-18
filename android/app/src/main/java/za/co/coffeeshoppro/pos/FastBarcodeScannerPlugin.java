package za.co.coffeeshoppro.pos;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.activity.result.ActivityResult;

// Fast native barcode scanner exposed to JS: launches FastBarcodeActivity
// (CameraX + ML Kit) and returns the decoded value. Registered in
// MainActivity BEFORE the bridge is built (see the InstallApk lesson).
@CapacitorPlugin(name = "FastBarcodeScanner")
public class FastBarcodeScannerPlugin extends Plugin {

    private static final int SCAN_REQUEST = 9001;

    @PluginMethod
    public void scan(PluginCall call) {
        Intent intent = new Intent(getActivity(), FastBarcodeActivity.class);
        startActivityForResult(call, intent, "scanResult");
    }

    @ActivityCallback
    private void scanResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == android.app.Activity.RESULT_OK
                && result.getData() != null) {
            String value = result.getData().getStringExtra(FastBarcodeActivity.EXTRA_RESULT);
            JSObject ret = new JSObject();
            ret.put("ScanResult", value != null ? value : "");
            call.resolve(ret);
        } else {
            call.reject("cancelled", "SCAN_CANCELLED");
        }
    }
}

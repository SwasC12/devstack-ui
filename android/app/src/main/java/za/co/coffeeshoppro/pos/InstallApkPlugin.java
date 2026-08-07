package za.co.coffeeshoppro.pos;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

// In-app updater: hands a downloaded APK to Android's package installer.
// The APK lives in the app cache; FileProvider exposes it as a content URI
// (the manifest already declares the provider + cache paths). Requires the
// REQUEST_INSTALL_PACKAGES permission for Android 8+.
@CapacitorPlugin(name = "InstallApk")
public class InstallApkPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath is required");
            return;
        }
        try {
            String path = filePath;
            if (path.startsWith("file://")) {
                path = Uri.parse(path).getPath();
            }
            File file = new File(path);
            if (!file.exists()) {
                call.reject("APK file not found: " + path);
                return;
            }

            Uri apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the installer: " + e.getMessage());
        }
    }
}

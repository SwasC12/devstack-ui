package za.co.coffeeshoppro.pos;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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
//
// Failure codes surfaced to JS:
//   INSTALL_BLOCKED - "install unknown apps" is disabled for this app; the JS
//                     side should point the user at openInstallSettings().
//   NO_INSTALLER    - no activity can handle APK installs (rare).
//   APK_NOT_FOUND   - the downloaded file is missing/corrupt path.
@CapacitorPlugin(name = "InstallApk")
public class InstallApkPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath is required", "BAD_INPUT");
            return;
        }

        // Android 8+: installing APKs from an app requires the user to allow
        // "install unknown apps" for this app. Without it the installer either
        // throws or silently refuses, so fail fast with a clear code instead.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Unknown-source installs are disabled for this app.", "INSTALL_BLOCKED");
            return;
        }

        try {
            String path = filePath;
            if (path.startsWith("file://")) {
                path = Uri.parse(path).getPath();
            }
            File file = new File(path);
            if (!file.exists()) {
                call.reject("APK file not found: " + path, "APK_NOT_FOUND");
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
        } catch (android.content.ActivityNotFoundException e) {
            call.reject("No activity can install APKs on this device.", "NO_INSTALLER");
        } catch (Exception e) {
            call.reject("Could not open the installer: " + e.getMessage(), "INSTALL_FAILED", e);
        }
    }

    // Opens the system screen where the user allows this app to install
    // unknown apps (Settings > Install unknown apps > CoffeeShop Pro).
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } else {
                call.resolve(); // pre-O devices don't need the toggle
            }
        } catch (Exception e) {
            call.reject("Could not open install settings: " + e.getMessage(), "SETTINGS_FAILED", e);
        }
    }
}

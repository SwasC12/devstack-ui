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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

// In-app updater: hands a downloaded APK to Android's package installer.
// The APK lives in the app cache; FileProvider exposes it as a content URI
// (the manifest already declares the provider + cache paths). Requires the
// REQUEST_INSTALL_PACKAGES permission for Android 8+.
//
// The file is located three ways, in order: an explicit file:// path from JS
// (authoritative - the Capacitor Filesystem plugin that wrote the file also
// produced it), a native directory+filename resolution, and finally a copy
// into the app cache (which is always a FileProvider root) if the file was
// found somewhere else. Failure codes surfaced to JS:
//   INSTALL_BLOCKED - "install unknown apps" is disabled for this app; the JS
//                     side should point the user at openInstallSettings().
//   NO_INSTALLER    - no activity can handle APK installs (rare).
//   APK_NOT_FOUND   - the downloaded file is missing.
@CapacitorPlugin(name = "InstallApk")
public class InstallApkPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String filePath = call.getString("filePath");
        String fileName = call.getString("fileName");
        String directory = call.getString("directory");

        // Android 8+: installing APKs from an app requires the user to allow
        // "install unknown apps" for this app. Without it the installer either
        // throws or silently refuses, so fail fast with a clear code instead.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Unknown-source installs are disabled for this app.", "INSTALL_BLOCKED");
            return;
        }

        try {
            File file = resolveApk(filePath, fileName, directory);
            if (file == null) {
                call.reject("APK file not found in app storage.", "APK_NOT_FOUND");
                return;
            }

            // FileProvider only serves paths under its configured roots (the
            // app cache). If the APK lives anywhere else, copy it into the
            // cache first so the install never depends on directory mapping.
            File cacheDir = getContext().getCacheDir();
            if (!isUnder(file, cacheDir)) {
                File copy = new File(cacheDir, "coffeeshoppro-update.apk");
                copyFile(file, copy);
                file = copy;
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

    private File resolveApk(String filePath, String fileName, String directory) {
        // 1) Explicit path from JS (the same plugin that wrote the file).
        if (filePath != null && !filePath.isEmpty()) {
            try {
                String path = filePath;
                if (path.startsWith("file://")) {
                    path = Uri.parse(path).getPath();
                }
                File f = new File(path);
                if (f.exists()) return f;
            } catch (Exception ignored) { }
        }
        // 2) Native directory resolution as a fallback.
        if (fileName != null && !fileName.isEmpty()) {
            File base;
            String dir = directory == null ? "cache" : directory;
            switch (dir) {
                case "data": base = getContext().getFilesDir(); break;
                case "documents": base = new File(getContext().getFilesDir(), "Documents"); break;
                case "external": base = getContext().getExternalFilesDir(null); break;
                case "cache":
                default: base = getContext().getCacheDir(); break;
            }
            File f = new File(base, fileName);
            if (f.exists()) return f;
        }
        return null;
    }

    private boolean isUnder(File file, File dir) {
        try {
            return file.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator);
        } catch (Exception e) {
            return false;
        }
    }

    private void copyFile(File from, File to) throws IOException {
        try (InputStream in = new FileInputStream(from);
             OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
        }
    }
}

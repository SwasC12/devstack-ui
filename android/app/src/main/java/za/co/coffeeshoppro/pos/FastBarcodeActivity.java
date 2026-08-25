package za.co.coffeeshoppro.pos;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.media.Image;
import android.os.Bundle;
import android.util.Log;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.camera.core.SurfaceOrientedMeteringPointFactory;
import androidx.core.content.ContextCompat;

import java.util.concurrent.TimeUnit;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Fast, native barcode scanner: CameraX preview + ML Kit real-time decoding
// (bundled model - no Google Play Services needed). Returns the first decoded
// value via setResult() and finishes; cancels on the button or back.
//
// Extends androidx.activity.ComponentActivity: it IS a LifecycleOwner out of
// the box (so bindToLifecycle() works reliably) and, unlike AppCompatActivity,
// does NOT require a Theme.AppCompat. It runs under ScannerTheme - a plain,
// opaque, fullscreen black theme with NO splash background, so the camera is
// the only thing on screen (the previous splash theme leaked the app logo,
// which is what showed as "a black screen with a broken logo").
public class FastBarcodeActivity extends ComponentActivity {

    public static final String EXTRA_RESULT = "scan_result";
    public static final String EXTRA_MODE = "scan_mode"; // "qr" or "product"
    private static final int PERMISSION_REQUEST = 100;

    private PreviewView previewView;
    private TextView statusText;
    private ExecutorService analysisExecutor;
    private BarcodeScanner mlScanner;
    private volatile boolean finished = false;
    private static final String TAG = "FastBarcode";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // --- UI: full-bleed camera preview with a scan frame and controls on top.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        // COMPATIBLE = TextureView-backed: composites inside the view hierarchy,
        // which is far more predictable than the default SurfaceView here.
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ScanFrameView frame = new ScanFrameView(this);
        root.addView(frame, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        statusText = new TextView(this);
        statusText.setText("Point the camera at the barcode");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(16);
        statusText.setGravity(Gravity.CENTER);
        statusText.setShadowLayer(6, 0, 0, Color.BLACK);
        FrameLayout.LayoutParams statusLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        statusLp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        statusLp.topMargin = 48;
        root.addView(statusText, statusLp);

        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setTextSize(16);
        cancel.setOnClickListener(v -> finish());
        FrameLayout.LayoutParams cancelLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cancelLp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        cancelLp.bottomMargin = 56;
        root.addView(cancel, cancelLp);

        setContentView(root);

        analysisExecutor = Executors.newSingleThreadExecutor();
        try {
            // Two separate scanners, chosen by the launch mode:
            //   "qr"      → customer loyalty QR only (FORMAT_QR_CODE)
            //   "product" → product barcodes (EAN-13 + legacy CODE-128)
            // Restricting each to its own symbology keeps them distinct and
            // makes ML Kit faster/less ambiguous (a product scan never grabs a
            // stray QR, and vice-versa).
            boolean qrMode = "qr".equals(getIntent().getStringExtra(EXTRA_MODE));
            BarcodeScannerOptions options = qrMode
                ? new BarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .build()
                : new BarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_CODE_128)
                    .build();
            mlScanner = BarcodeScanning.getClient(options);
        } catch (Throwable t) {
            Toast.makeText(this, "Scanner unavailable: " + t.getMessage(), Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, PERMISSION_REQUEST);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera();
            } else {
                Toast.makeText(this, "Camera permission is needed to scan barcodes", Toast.LENGTH_LONG).show();
                finish();
            }
        }
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                ProcessCameraProvider provider = future.get();

                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                // Higher analysis resolution: a dense CODE-128 label needs enough
                // pixels across the bars for ML Kit to resolve them. 1280x720 was
                // too coarse for a small printed label.
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setTargetResolution(new Size(1920, 1080))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                analysis.setAnalyzer(analysisExecutor, this::analyze);

                provider.unbindAll();
                Camera camera = provider.bindToLifecycle(
                    this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);

                // Drive continuous autofocus on the centre of the frame. Tablet
                // cameras often sit unfocused at close label distance, so ML Kit
                // only ever sees a blur - which decodes to nothing, silently.
                try {
                    MeteringPoint center = new SurfaceOrientedMeteringPointFactory(1f, 1f)
                        .createPoint(0.5f, 0.5f);
                    FocusMeteringAction af = new FocusMeteringAction.Builder(center, FocusMeteringAction.FLAG_AF)
                        .setAutoCancelDuration(2, TimeUnit.SECONDS)
                        .build();
                    camera.getCameraControl().startFocusAndMetering(af);
                } catch (Throwable t) {
                    Log.w(TAG, "focus/metering unavailable: " + t.getMessage());
                }
            } catch (Throwable e) {
                Toast.makeText(this, "Could not start the camera: " + e.getMessage(), Toast.LENGTH_LONG).show();
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @ExperimentalGetImage
    private void analyze(@NonNull ImageProxy imageProxy) {
        if (finished) { imageProxy.close(); return; }
        Image mediaImage = imageProxy.getImage();
        // getImage() is null on the odd frame (camera warm-up, format churn).
        // fromMediaImage(null, ...) throws, and because we use
        // STRATEGY_KEEP_ONLY_LATEST a single un-closed ImageProxy stalls the
        // whole real-time pipeline - the preview keeps rendering but no further
        // frames arrive, so nothing decodes. Skip the frame instead.
        if (mediaImage == null) { imageProxy.close(); return; }
        int rot = imageProxy.getImageInfo().getRotationDegrees();
        InputImage image = InputImage.fromMediaImage(mediaImage, rot);
        mlScanner.process(image)
            .addOnSuccessListener(barcodes -> {
                for (Barcode barcode : barcodes) {
                    String value = barcode.getRawValue();
                    if (value != null && !value.isEmpty()) {
                        finished = true;
                        runOnUiThread(() -> {
                            setResult(RESULT_OK, new Intent().putExtra(EXTRA_RESULT, value));
                            finish();
                        });
                        return;
                    }
                }
            })
            .addOnFailureListener(e -> Log.e(TAG, "ML Kit process() failed: " + e.getMessage()))
            // Always close after processing - exactly one close per frame keeps
            // frames flowing so decoding stays real-time/instant.
            .addOnCompleteListener(task -> imageProxy.close());
    }

    @Override
    protected void onDestroy() {
        finished = true;
        if (analysisExecutor != null) analysisExecutor.shutdown();
        if (mlScanner != null) mlScanner.close();
        super.onDestroy();
    }

    // Scan-frame overlay: dims outside a central window and draws corner marks.
    static class ScanFrameView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        public ScanFrameView(android.content.Context context) { super(context); }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float w = getWidth(), h = getHeight();
            float left = w * 0.20f, right = w * 0.80f;
            float top = h * 0.30f, bottom = h * 0.70f;

            paint.setStyle(Paint.Style.FILL);
            paint.setColor(Color.parseColor("#66000000"));
            canvas.drawRect(0, 0, w, top, paint);
            canvas.drawRect(0, bottom, w, h, paint);
            canvas.drawRect(0, top, left, bottom, paint);
            canvas.drawRect(right, top, w, bottom, paint);

            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(Color.parseColor("#c88738"));
            paint.setStrokeWidth(8);
            float cx = (right - left) * 0.22f, cy = (bottom - top) * 0.22f;
            canvas.drawLine(left, top, left + cx, top, paint);
            canvas.drawLine(left, top, left, top + cy, paint);
            canvas.drawLine(right, top, right - cx, top, paint);
            canvas.drawLine(right, top, right, top + cy, paint);
            canvas.drawLine(left, bottom, left + cx, bottom, paint);
            canvas.drawLine(left, bottom, left, bottom - cy, paint);
            canvas.drawLine(right, bottom, right - cx, bottom, paint);
            canvas.drawLine(right, bottom, right, bottom - cy, paint);
        }
    }
}

package za.co.coffeeshoppro.pos;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Fast, native barcode scanner: CameraX preview + ML Kit real-time decoding
// (bundled model - no Google Play Services needed). Returns the first decoded
// value via setResult(); cancels on the button or back. This replaces the
// slow third-party scanner plugin entirely. NOTE: extends plain Activity -
// AppCompatActivity would require a Theme.AppCompat theme, and the app's
// theme isn't one (that was a crash).
public class FastBarcodeActivity extends Activity {

    public static final String EXTRA_RESULT = "scan_result";
    private static final int[] FORMATS = {
        Barcode.FORMAT_CODE_128, Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
        Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E, Barcode.FORMAT_QR_CODE
    };

    private PreviewView previewView;
    private TextView statusText;
    private ExecutorService analysisExecutor;
    private BarcodeScanner mlScanner;
    private boolean finished = false;

    private final ActivityResultLauncher<String> permissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted) startCamera();
            else {
                Toast.makeText(this, "Camera permission is needed to scan barcodes", Toast.LENGTH_LONG).show();
                finish();
            }
        });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen dark scanner UI with a scan frame.
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#111111"));

        previewView = new PreviewView(this);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        ScanFrameView frame = new ScanFrameView(this);
        root.addView(frame, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        statusText = new TextView(this);
        statusText.setText("Point the camera at the barcode");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(15);
        statusText.setGravity(Gravity.CENTER);
        root.addView(statusText, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 90));

        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setTextSize(16);
        cancel.setOnClickListener(v -> finish());
        root.addView(cancel, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 110));

        setContentView(root);

        analysisExecutor = Executors.newSingleThreadExecutor();
        try {
            BarcodeScannerOptions options = new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(FORMATS[0], FORMATS[1], FORMATS[2], FORMATS[3], FORMATS[4], FORMATS[5])
                .build();
            mlScanner = BarcodeScanning.getClient(options);
        } catch (Throwable t) {
            // Scanner init failed (e.g. no ML Kit model) - never crash the app.
            Toast.makeText(this, "Scanner unavailable: " + t.getMessage(), Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            permissionLauncher.launch(Manifest.permission.CAMERA);
        }
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future =
            ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                ProcessCameraProvider provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                analysis.setAnalyzer(analysisExecutor, this::analyze);

                provider.unbindAll();
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA,
                    preview, analysis);
            } catch (ExecutionException | InterruptedException e) {
                runOnUiThread(() -> {
                    Toast.makeText(this, "Could not start the camera", Toast.LENGTH_LONG).show();
                    finish();
                });
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void analyze(@NonNull ImageProxy imageProxy) {
        if (finished) { imageProxy.close(); return; }
        InputImage image = InputImage.fromMediaImage(imageProxy.getImage(), imageProxy.getImageInfo().getRotationDegrees());
        mlScanner.process(image)
            .addOnSuccessListener(barcodes -> {
                for (Barcode barcode : barcodes) {
                    if (barcode.getRawValue() != null && !barcode.getRawValue().isEmpty()) {
                        finished = true;
                        String value = barcode.getRawValue();
                        imageProxy.close();
                        runOnUiThread(() -> {
                            setResult(RESULT_OK, new android.content.Intent().putExtra(EXTRA_RESULT, value));
                            finish();
                        });
                        return;
                    }
                }
                imageProxy.close();
            })
            .addOnFailureListener(e -> imageProxy.close());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        finished = true;
        if (analysisExecutor != null) analysisExecutor.shutdown();
        if (mlScanner != null) mlScanner.close();
    }

    // Simple scan-frame overlay (horizontal line + corners drawn over the preview).
    static class ScanFrameView extends View {
        private final Paint paint = new Paint();
        public ScanFrameView(android.content.Context context) { super(context); }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float w = getWidth(), h = getHeight();
            float left = w * 0.12f, right = w * 0.88f;
            float top = h * 0.28f, bottom = h * 0.72f;

            paint.setColor(Color.parseColor("#22000000"));
            canvas.drawRect(0, 0, w, top, paint);
            canvas.drawRect(0, bottom, w, h, paint);
            canvas.drawRect(0, top, left, bottom, paint);
            canvas.drawRect(right, top, w, bottom, paint);

            paint.setColor(Color.parseColor("#c88738"));
            paint.setStrokeWidth(6);
            canvas.drawLine(left, top, left + (right - left) * 0.25f, top, paint);
            canvas.drawLine(left, top, left, top + (bottom - top) * 0.25f, paint);
            canvas.drawLine(right, top, right - (right - left) * 0.25f, top, paint);
            canvas.drawLine(right, top, right, top + (bottom - top) * 0.25f, paint);
            canvas.drawLine(left, bottom, left + (right - left) * 0.25f, bottom, paint);
            canvas.drawLine(left, bottom, left, bottom - (bottom - top) * 0.25f, paint);
            canvas.drawLine(right, bottom, right - (right - left) * 0.25f, bottom, paint);
            canvas.drawLine(right, bottom, right, bottom - (bottom - top) * 0.25f, paint);
        }
    }

    // Minimal vertical linear layout helper (avoids the appcompat layout XML).
    static class LinearLayout extends android.widget.LinearLayout {
        public LinearLayout(android.content.Context context) { super(context); }
    }
}

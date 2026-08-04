package za.co.coffeeshoppro.pos;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The API login sets the refresh cookie as SameSite=None; Secure, and
        // the app origin (https://localhost in the WebView) is a DIFFERENT site.
        // WebView drops cross-site cookies unless third-party cookies are
        // explicitly accepted - without this every app start needs a fresh login.
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(this.bridge.getWebView(), true);
    }
}

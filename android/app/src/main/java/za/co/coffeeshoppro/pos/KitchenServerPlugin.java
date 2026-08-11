package za.co.coffeeshoppro.pos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import fi.iki.elonen.NanoHTTPD;

// Kitchen display webhook receiver: a tiny HTTP server on the kitchen tablet
// (port 8123). The POS fires GET /order?id=N over the shop's WiFi the moment
// a sale completes, and the plugin emits an "order" event so the Kitchen
// screen refreshes instantly. Zero server traffic, zero FCM quota - the
// kitchen only falls back to its slow poll when this can't be reached.
@CapacitorPlugin(name = "KitchenServer")
public class KitchenServerPlugin extends Plugin {

    private static final int PORT = 8123;

    private NanoHTTPD server;

    @PluginMethod
    public void start(PluginCall call) {
        try {
            if (server != null) { call.resolve(); return; }
            server = new NanoHTTPD(PORT) {
                @Override
                public Response serve(IHTTPSession session) {
                    // Discovery: the POS probes /ping and only accepts this marker.
                    if ("/ping".equals(session.getUri()) && Method.GET.equals(session.getMethod())) {
                        return newFixedLengthResponse(Response.Status.OK, "text/plain", "coffeeshoppro-kitchen");
                    }
                    if ("/order".equals(session.getUri()) && Method.GET.equals(session.getMethod())) {
                        String id = session.getParms().get("id");
                        try {
                            notifyListeners("order", new JSObject().put("id", id == null ? "" : id), false);
                        } catch (Exception ignored) { }
                        return newFixedLengthResponse(Response.Status.OK, "text/plain", "ok");
                    }
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "not found");
                }
            };
            server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start kitchen server: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            if (server != null) { server.stop(); server = null; }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not stop kitchen server: " + e.getMessage());
        }
    }
}

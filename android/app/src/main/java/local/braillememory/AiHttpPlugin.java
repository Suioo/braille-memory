package local.braillememory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AI 校对的流式请求（SSE）：边收边把文字片段推给网页（事件 "chunk"），推理模型长时间思考时连接不断、网页能显示进度。
 * 只接受 https，或本机 / 局域网的 http（网页侧已校验，这里再校验协议）。读超时 = 多久没收到数据（120 秒）。
 * cancel(id) 断开对应的连接。CapacitorHttp 不支持流式，所以单独做这个小插件。
 */
@CapacitorPlugin(name = "AiHttp")
public class AiHttpPlugin extends Plugin {
    private final Map<String, HttpURLConnection> live = new ConcurrentHashMap<>();

    @PluginMethod
    public void stream(final PluginCall call) {
        final String id = call.getString("id", "");
        final String url = call.getString("url", "");
        final String body = call.getString("body", "");
        final JSObject headers = call.getObject("headers", new JSObject());
        if (id == null || !id.matches("[a-z0-9]{4,32}") || url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("reason", "bad");
            call.resolve(r);
            return;
        }
        new Thread(() -> {
            JSObject r = new JSObject();
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                live.put(id, c);
                c.setRequestMethod("POST");
                c.setConnectTimeout(30000);
                c.setReadTimeout(120000);
                c.setInstanceFollowRedirects(false);
                c.setDoOutput(true);
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    String v = headers.getString(k);
                    if (v != null && k.matches("[A-Za-z0-9-]{1,40}") && v.length() <= 600) c.setRequestProperty(k, v);
                }
                byte[] out = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = c.getOutputStream()) { os.write(out); }
                int status = c.getResponseCode();
                boolean ok = status >= 200 && status < 300;
                InputStream in = ok ? c.getInputStream() : c.getErrorStream();
                StringBuilder err = new StringBuilder();
                if (in != null) {
                    try (Reader rd = new InputStreamReader(in, StandardCharsets.UTF_8)) {
                        char[] buf = new char[4096];
                        int n;
                        while ((n = rd.read(buf)) > 0) {
                            String s = new String(buf, 0, n);
                            if (ok) {
                                JSObject ev = new JSObject();
                                ev.put("id", id);
                                ev.put("text", s);
                                notifyListeners("chunk", ev);
                            } else if (err.length() < 20000) {
                                err.append(s);
                            }
                        }
                    }
                }
                r.put("ok", ok);
                r.put("status", status);
                r.put("text", ok ? "" : err.toString());
            } catch (java.net.SocketTimeoutException e) {
                r.put("ok", false);
                r.put("reason", "timeout");
            } catch (Exception e) {
                r.put("ok", false);
                r.put("reason", live.containsKey(id) ? "network" : "canceled");
                String m = e.getMessage();
                r.put("detail", m == null ? "" : m.substring(0, Math.min(120, m.length())));
            } finally {
                live.remove(id);
                if (c != null) c.disconnect();
            }
            call.resolve(r);
        }).start();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id", "");
        HttpURLConnection c = id == null ? null : live.remove(id);
        if (c != null) new Thread(c::disconnect).start();
        call.resolve();
    }
}

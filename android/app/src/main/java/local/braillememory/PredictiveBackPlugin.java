package local.braillememory;

import android.os.Build;
import android.window.BackEvent;
import android.window.OnBackAnimationCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 预测性返回（Android 14+）：把系统返回手势的「开始 / 进度 / 取消 / 确认」推给网页，页面跟着手指缩小，松手确认才真正返回。
 * 网页在「不在根页」时调用 setEnabled(true) 注册回调（优先级高于其它返回处理）；回到根页调用 setEnabled(false) 注销，
 * 这时系统接管：播放系统自己的「返回桌面」预览并退出应用。Android 14 以下不支持进度，supported = false，网页走普通的返回键监听。
 */
@CapacitorPlugin(name = "PredictiveBack")
public class PredictiveBackPlugin extends Plugin {
    private Object callback;

    @PluginMethod
    public void setEnabled(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        JSObject ret = new JSObject();
        ret.put("supported", Build.VERSION.SDK_INT >= 34);
        if (Build.VERSION.SDK_INT < 34) {
            call.resolve(ret);
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                apply34(enabled);
            } catch (Throwable ignored) {
                // 注册失败：网页仍有普通的返回键监听作为兜底
            }
            call.resolve(ret);
        });
    }

    @RequiresApi(34)
    private void apply34(boolean enabled) {
        OnBackInvokedDispatcher dispatcher = getActivity().getOnBackInvokedDispatcher();
        if (enabled && callback == null) {
            Cb cb = new Cb();
            dispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, cb);
            callback = cb;
        } else if (!enabled && callback != null) {
            dispatcher.unregisterOnBackInvokedCallback((OnBackAnimationCallback) callback);
            callback = null;
        }
    }

    private JSObject data(BackEvent e) {
        JSObject o = new JSObject();
        o.put("progress", e.getProgress());
        o.put("edge", e.getSwipeEdge());
        o.put("x", e.getTouchX());
        o.put("y", e.getTouchY());
        return o;
    }

    @RequiresApi(34)
    private class Cb implements OnBackAnimationCallback {
        @Override public void onBackStarted(BackEvent e) { notifyListeners("backStarted", data(e)); }
        @Override public void onBackProgressed(BackEvent e) { notifyListeners("backProgress", data(e)); }
        @Override public void onBackCancelled() { notifyListeners("backCancelled", new JSObject()); }
        @Override public void onBackInvoked() { notifyListeners("backInvoked", new JSObject()); }
    }
}

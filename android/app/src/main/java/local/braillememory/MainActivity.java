package local.braillememory;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 本地插件：游戏手柄震动（必须在 super.onCreate 之前注册）
        registerPlugin(GamepadHapticsPlugin.class);
        registerPlugin(PredictiveBackPlugin.class); // 预测性返回（Android 14+ 的返回手势）
        registerPlugin(AiHttpPlugin.class); // AI 校对的流式请求（可选功能）
        super.onCreate(savedInstanceState);
    }

    // 记下最后一次有输入的手柄（手柄震动只震它）；手柄的按键 / 摇杆交给插件推给网页做操控（网页开启后由插件消耗，系统返回键等不受影响）
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        GamepadHapticsPlugin.noteInput(event.getDeviceId(), event.getSource());
        if (GamepadHapticsPlugin.handleKey(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        GamepadHapticsPlugin.noteInput(event.getDeviceId(), event.getSource());
        if (GamepadHapticsPlugin.handleMotion(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }
}

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
        super.onCreate(savedInstanceState);
    }

    // 记下最后一次有输入的手柄（按键 / 摇杆），手柄震动只震它
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        GamepadHapticsPlugin.noteInput(event.getDeviceId(), event.getSource());
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        GamepadHapticsPlugin.noteInput(event.getDeviceId(), event.getSource());
        return super.dispatchGenericMotionEvent(event);
    }
}

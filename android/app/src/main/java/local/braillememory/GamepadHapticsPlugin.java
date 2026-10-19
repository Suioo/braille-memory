package local.braillememory;

import android.content.Context;
import android.hardware.input.InputManager;
import android.os.Build;
import android.os.CombinedVibration;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.InputDevice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 游戏手柄震动（本地 Capacitor 插件，无第三方依赖）。
 *
 * 为什么不用 WebView 的 Gamepad API：WebView（AwContents）只把按键事件转给手柄列表，摇杆事件走的是 EventForwarder，
 * 并不进入 GamepadList，Gamepad API 在 WebView 里不可靠；这里直接用 InputDevice 的震动接口。
 *
 * 马达选择沿用 Chromium 在安卓上的约定（device/gamepad/android/.../GamepadDevice.java）：
 *   Android 12+（API 31）：InputDevice.getVibratorManager()，两个及以上振子时 id[0] = 强马达、id[1] = 弱马达；只有一个振子时强弱合并。
 *   更早的系统：InputDevice.getVibrator()，只有一个振子，强弱取较大者。
 * 「最后一次有输入的手柄」由 MainActivity 把按键 / 摇杆事件的 deviceId 报进来（noteInput）。
 *
 * JS 方法：
 *   getState()                           → { devices: [{ id, name, vendorId, productId, motors }], activeId }
 *   vibrate({ strong, weak, duration })  → 在「最后有输入」的手柄（没有就取第一个能震的）上震一次，强弱 0..1，duration 毫秒（≤ 5000）
 *   stop()                               → 停止震动
 * 事件：changed（手柄接入 / 拔出 / 最后输入的手柄变了），JS 收到后重新 getState()。
 */
@CapacitorPlugin(name = "GamepadHaptics")
public class GamepadHapticsPlugin extends Plugin {
    private static final int MAX_DURATION_MS = 5000;
    private static final int MAX_AMPLITUDE = 255;

    private static volatile int lastActiveId = -1;
    private static volatile GamepadHapticsPlugin instance;

    private InputManager inputManager;
    private InputManager.InputDeviceListener listener;

    @Override
    public void load() {
        instance = this;
        inputManager = (InputManager) getContext().getSystemService(Context.INPUT_SERVICE);
        if (inputManager == null) return;
        listener = new InputManager.InputDeviceListener() {
            @Override public void onInputDeviceAdded(int deviceId) { fireChanged(); }
            @Override public void onInputDeviceRemoved(int deviceId) {
                if (deviceId == lastActiveId) lastActiveId = -1;
                fireChanged();
            }
            @Override public void onInputDeviceChanged(int deviceId) { fireChanged(); }
        };
        inputManager.registerInputDeviceListener(listener, new Handler(Looper.getMainLooper()));
    }

    @Override
    protected void handleOnDestroy() {
        if (inputManager != null && listener != null) inputManager.unregisterInputDeviceListener(listener);
        if (instance == this) instance = null;
    }

    private void fireChanged() {
        notifyListeners("changed", new JSObject());
    }

    /** MainActivity 在收到手柄的按键 / 摇杆事件时调用：记下最后一次有输入的设备。 */
    static void noteInput(int deviceId, int source) {
        if ((source & InputDevice.SOURCE_GAMEPAD) != InputDevice.SOURCE_GAMEPAD
                && (source & InputDevice.SOURCE_JOYSTICK) != InputDevice.SOURCE_JOYSTICK) {
            return;
        }
        if (deviceId == lastActiveId) return;
        lastActiveId = deviceId;
        GamepadHapticsPlugin p = instance;
        if (p != null) p.fireChanged();
    }

    private static boolean isGamepad(InputDevice d) {
        if (d == null || d.isVirtual()) return false;
        int s = d.getSources();
        return (s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    /** 这个设备有几个可用的振子（0 = 不能震）。 */
    private static int motorsOf(InputDevice d) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = d.getVibratorManager();
                return vm == null ? 0 : vm.getVibratorIds().length;
            }
            Vibrator v = d.getVibrator();
            return v != null && v.hasVibrator() ? 1 : 0;
        } catch (RuntimeException e) {
            return 0;
        }
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSArray devices = new JSArray();
        int[] ids = InputDevice.getDeviceIds();
        for (int id : ids) {
            InputDevice d = InputDevice.getDevice(id);
            if (!isGamepad(d)) continue;
            JSObject o = new JSObject();
            o.put("id", id);
            o.put("name", d.getName());
            o.put("vendorId", d.getVendorId());
            o.put("productId", d.getProductId());
            o.put("motors", motorsOf(d));
            devices.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("devices", devices);
        ret.put("activeId", lastActiveId);
        call.resolve(ret);
    }

    /** 要震的设备：最后有输入且能震的；没有就第一个能震的手柄。 */
    private InputDevice target() {
        InputDevice last = lastActiveId >= 0 ? InputDevice.getDevice(lastActiveId) : null;
        if (isGamepad(last) && motorsOf(last) > 0) return last;
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (isGamepad(d) && motorsOf(d) > 0) return d;
        }
        return null;
    }

    private static int amp(double m) {
        double c = Math.max(0.0, Math.min(1.0, m));
        return (int) Math.round(c * MAX_AMPLITUDE);
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        try {
            InputDevice d = target();
            if (d == null) { call.resolve(); return; }
            double strong = call.getDouble("strong", 0.0);
            double weak = call.getDouble("weak", 0.0);
            int duration = Math.max(1, Math.min(MAX_DURATION_MS, call.getInt("duration", 50)));
            int s = amp(strong);
            int w = amp(weak);
            if (s == 0 && w == 0) { cancel(d); call.resolve(); return; }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = d.getVibratorManager();
                int[] ids = vm.getVibratorIds();
                if (ids.length >= 2) {
                    CombinedVibration.ParallelCombination combo = CombinedVibration.startParallel();
                    if (s > 0) combo.addVibrator(ids[0], VibrationEffect.createOneShot(duration, s));
                    if (w > 0) combo.addVibrator(ids[1], VibrationEffect.createOneShot(duration, w));
                    vm.vibrate(combo.combine());
                } else if (ids.length == 1) {
                    vm.vibrate(CombinedVibration.createParallel(VibrationEffect.createOneShot(duration, Math.max(s, w))));
                }
            } else {
                Vibrator v = d.getVibrator();
                int a = Math.max(s, w);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && v.hasAmplitudeControl()) {
                    v.vibrate(VibrationEffect.createOneShot(duration, a));
                } else {
                    v.vibrate(duration);
                }
            }
        } catch (RuntimeException e) {
            // 手柄中途拔出、系统拒绝等：静默跳过，不影响答题
        }
        call.resolve();
    }

    private static void cancel(InputDevice d) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) d.getVibratorManager().cancel();
            else d.getVibrator().cancel();
        } catch (RuntimeException e) {
            // 忽略
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (isGamepad(d) && motorsOf(d) > 0) cancel(d);
        }
        call.resolve();
    }
}

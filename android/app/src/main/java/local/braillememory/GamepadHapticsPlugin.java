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
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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
 *
 * 手柄操控（2.8.0）：WebView 对手柄的按键会合成方向键 / Enter、摇杆则完全不进网页，所以这里把手柄的按键和摇杆事件截下来，
 * 整理成与 Gamepad API「standard」布局一致的位掩码，用 'pad' 事件推给网页：
 *   setInput({ enabled })  → 网页准备好接收后调用；开启后手柄事件由本插件消耗（不再让 WebView 合成方向键 / Enter，避免重复触发），
 *                            关闭或网页没调用时保持 WebView 的默认行为。
 *   事件 pad：{ id, name, b, lx, ly, rx, ry }  b 的第 i 位 = standard 布局第 i 个键（0=A 下方键 1=B 右边键 2=X 左边键 3=Y 上方键
 *                            4=LB 5=RB 6=LT 7=RT 8=View 9=Start 10=左摇杆按下 11=右摇杆按下 12–15=十字键上下左右 16=Home）；
 *                            摇杆 -1..1（量化到 0.1，变化才推送）。设备拔出：{ id, gone: true }。
 * 安卓的 KEYCODE_BUTTON_A/B/X/Y 本来就按位置命名（A = 下方键），所以 Xbox / PlayStation / Switch 在这里已经是同一个布局。
 */
@CapacitorPlugin(name = "GamepadHaptics")
public class GamepadHapticsPlugin extends Plugin {
    private static final int MAX_DURATION_MS = 5000;
    private static final int MAX_AMPLITUDE = 255;

    private static volatile int lastActiveId = -1;
    private static volatile GamepadHapticsPlugin instance;
    private static volatile boolean inputEnabled = false;

    /** 一个手柄当前的输入状态（只在主线程访问）。 */
    private static final class Pad {
        int keys;       // 按键事件得到的位
        int hat;        // 十字键（HAT 轴）得到的位
        int trig;       // 扳机（轴）得到的位
        float lx, ly, rx, ry;
        int sent = -1;  // 上次推送的位掩码与量化后的摇杆，用于去重
        int sentAxes = Integer.MIN_VALUE;
        String name;
    }
    private static final Map<Integer, Pad> pads = new ConcurrentHashMap<>(); // setInput 在插件线程、其余在主线程

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
                if (pads.remove(deviceId) != null) {
                    JSObject o = new JSObject();
                    o.put("id", deviceId);
                    o.put("gone", true);
                    notifyListeners("pad", o);
                }
                fireChanged();
            }
            @Override public void onInputDeviceChanged(int deviceId) { fireChanged(); }
        };
        inputManager.registerInputDeviceListener(listener, new Handler(Looper.getMainLooper()));
    }

    @Override
    protected void handleOnPause() {
        pads.clear(); // 切到后台后松开的键收不到事件，别让它一直「按着」
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

    private static boolean isPadSource(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    /** KeyEvent 的键码 → standard 布局的位；不是手柄键（例如系统返回键）返回 -1。 */
    private static int bitOf(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BUTTON_A: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_Y: return 3;
            case KeyEvent.KEYCODE_BUTTON_L1: return 4;
            case KeyEvent.KEYCODE_BUTTON_R1: return 5;
            case KeyEvent.KEYCODE_BUTTON_L2: return 6;
            case KeyEvent.KEYCODE_BUTTON_R2: return 7;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return 8;
            case KeyEvent.KEYCODE_BUTTON_START: return 9;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 10;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 11;
            case KeyEvent.KEYCODE_DPAD_UP: return 12;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 13;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 14;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 15;
            case KeyEvent.KEYCODE_BUTTON_MODE: return 16;
            default: return -1;
        }
    }

    private static Pad padOf(int deviceId) {
        Pad p = pads.get(deviceId);
        if (p == null) {
            p = new Pad();
            InputDevice d = InputDevice.getDevice(deviceId);
            p.name = d == null ? "" : d.getName();
            pads.put(deviceId, p);
        }
        return p;
    }

    private static float quant(float v) {
        return Math.round(Math.max(-1f, Math.min(1f, v)) * 10f) / 10f;
    }

    /** 有变化才推给网页：按键位掩码 + 量化后的摇杆。 */
    private static void emit(int deviceId, Pad p) {
        GamepadHapticsPlugin plugin = instance;
        if (plugin == null) return;
        int mask = p.keys | p.hat | p.trig;
        int axes = (Math.round(p.lx * 10) + 10) + 21 * ((Math.round(p.ly * 10) + 10) + 21 * ((Math.round(p.rx * 10) + 10) + 21 * (Math.round(p.ry * 10) + 10)));
        if (mask == p.sent && axes == p.sentAxes) return;
        p.sent = mask;
        p.sentAxes = axes;
        JSObject o = new JSObject();
        o.put("id", deviceId);
        o.put("name", p.name);
        o.put("b", mask);
        o.put("lx", p.lx);
        o.put("ly", p.ly);
        o.put("rx", p.rx);
        o.put("ry", p.ry);
        plugin.notifyListeners("pad", o);
    }

    /** MainActivity.dispatchKeyEvent 调用：手柄键被本插件消耗时返回 true。 */
    static boolean handleKey(KeyEvent event) {
        if (!inputEnabled || instance == null || !isPadSource(event.getSource())) return false;
        int bit = bitOf(event.getKeyCode());
        if (bit < 0) return false;
        int id = event.getDeviceId();
        Pad p = padOf(id);
        int action = event.getAction();
        if (action == KeyEvent.ACTION_DOWN) {
            if (event.getRepeatCount() == 0) p.keys |= (1 << bit); // 系统的长按重复不算（连发由网页按方向自己算）
        } else if (action == KeyEvent.ACTION_UP) {
            p.keys &= ~(1 << bit);
        }
        emit(id, p);
        return true;
    }

    private static float axis(MotionEvent e, int a) {
        float v = e.getAxisValue(a);
        return Float.isNaN(v) ? 0f : v;
    }

    /** MainActivity.dispatchGenericMotionEvent 调用：摇杆 / 十字键（HAT）/ 扳机轴。 */
    static boolean handleMotion(MotionEvent event) {
        if (!inputEnabled || instance == null || !isPadSource(event.getSource())
                || event.getAction() != MotionEvent.ACTION_MOVE) return false;
        int id = event.getDeviceId();
        Pad p = padOf(id);
        p.lx = quant(axis(event, MotionEvent.AXIS_X));
        p.ly = quant(axis(event, MotionEvent.AXIS_Y));
        float z = axis(event, MotionEvent.AXIS_Z);
        float rz = axis(event, MotionEvent.AXIS_RZ);
        float rx = axis(event, MotionEvent.AXIS_RX);
        float ry = axis(event, MotionEvent.AXIS_RY);
        // 右摇杆在不同手柄上是 Z / RZ 或 RX / RY：取偏得更多的那一组
        boolean useZ = Math.abs(z) + Math.abs(rz) >= Math.abs(rx) + Math.abs(ry);
        p.rx = quant(useZ ? z : rx);
        p.ry = quant(useZ ? rz : ry);
        float hx = axis(event, MotionEvent.AXIS_HAT_X);
        float hy = axis(event, MotionEvent.AXIS_HAT_Y);
        p.hat = (hy < -0.5f ? 1 << 12 : 0) | (hy > 0.5f ? 1 << 13 : 0) | (hx < -0.5f ? 1 << 14 : 0) | (hx > 0.5f ? 1 << 15 : 0);
        float lt = Math.max(axis(event, MotionEvent.AXIS_LTRIGGER), axis(event, MotionEvent.AXIS_BRAKE));
        float rt = Math.max(axis(event, MotionEvent.AXIS_RTRIGGER), axis(event, MotionEvent.AXIS_GAS));
        p.trig = (lt > 0.5f ? 1 << 6 : 0) | (rt > 0.5f ? 1 << 7 : 0);
        emit(id, p);
        return true;
    }

    @PluginMethod
    public void setInput(PluginCall call) {
        inputEnabled = call.getBoolean("enabled", false);
        if (!inputEnabled) pads.clear();
        call.resolve();
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

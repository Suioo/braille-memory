'use strict';
/**
 * 构建 Android APK：
 *   node tools/android-build.js            调试版 → dist/盲文记忆-debug.apk
 *   node tools/android-build.js --release  正式签名版 → dist/盲文记忆-<版本号>.apk（npm run android:release）
 *   正式版需要 android/keystore.properties（见 keystore.properties.example）；打包后用 apksigner 验证签名，
 *   验证不通过则不复制到 dist。密码只由 Gradle 读取，本脚本不读取、不打印。
 * - 只在子进程里设置 JAVA_HOME / ANDROID_HOME / ANDROID_SDK_ROOT（不改系统或用户环境变量）；
 *   android/local.properties 写 sdk.dir。
 * - gradlew assembleDebug --info，完整日志写 dist/android-build.log（便于核对下载）。
 * - 复制 APK 到 dist/盲文记忆-debug.apk，并用 build-tools 36.0.0 的 aapt2 dump badging 输出包信息。
 * 路径可用环境变量 BM_JDK / BM_SDK 覆盖。
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const JDK = process.env.BM_JDK || 'D:\\android-dev\\jdk-21';
const SDK = process.env.BM_SDK || 'D:\\android-dev\\sdk';
const ANDROID = path.join(ROOT, 'android');
const DIST = path.join(ROOT, 'dist');
const RELEASE = process.argv.includes('--release');
const BUILD_TOOLS = path.join(SDK, 'build-tools', '36.0.0');

const die = (msg) => { console.error(msg); process.exit(1); };
let version = '';
if (RELEASE) {
  version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const gradle = fs.readFileSync(path.join(ANDROID, 'app', 'build.gradle'), 'utf8');
  const m = /versionName\s+"([^"]+)"/.exec(gradle);
  if (!m || m[1] !== version) die('版本号不一致：package.json=' + version + '，build.gradle versionName=' + (m ? m[1] : '?') + '。请先改成一致。');
  if (!fs.existsSync(path.join(ANDROID, 'keystore.properties'))) die('缺少 android/keystore.properties（模板：android/keystore.properties.example）。');
}

fs.writeFileSync(path.join(ANDROID, 'local.properties'), 'sdk.dir=' + SDK.replace(/\\/g, '\\\\').replace(/:/g, '\\:') + '\n', 'utf8');
fs.mkdirSync(DIST, { recursive: true });

const env = Object.assign({}, process.env, {
  JAVA_HOME: JDK,
  ANDROID_HOME: SDK,
  ANDROID_SDK_ROOT: SDK,
  PATH: path.join(JDK, 'bin') + path.delimiter + process.env.PATH,
});
const sha256 = (f) => require('node:crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** 用 apksigner 验证正式版签名（在原始 ASCII 路径上验证）；失败则退出，不复制到 dist。 */
function verifyRelease(apkPath) {
  const v = spawnSync('cmd.exe', ['/c', path.join(BUILD_TOOLS, 'apksigner.bat'), 'verify', '--verbose', '--print-certs', apkPath], { env, encoding: 'utf8', timeout: 120000 });
  const text = (v.stdout || '') + (v.stderr || '');
  fs.writeFileSync(path.join(DIST, 'android-verify.txt'), text, 'utf8');
  console.log(text.trim());
  if (v.status !== 0 || !/Verifies/.test(text)) die('apksigner 验证失败（退出码 ' + v.status + '），未复制到 dist。详见 dist/android-verify.txt');
  if (/Android Debug/i.test(text)) die('APK 仍是调试证书签名，未复制到 dist。');
}

const log = path.join(DIST, 'android-build.log');
const r = spawnSync('cmd.exe', ['/c', path.join(ANDROID, 'gradlew.bat'), RELEASE ? 'assembleRelease' : 'assembleDebug', '--info', '--console=plain'], {
  cwd: ANDROID, env, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512, timeout: 3600000,
});
fs.writeFileSync(log, (r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || ''), 'utf8');
const all = (r.stdout || '') + (r.stderr || '');
const downloads = [...new Set(all.split(/\r?\n/).filter((l) => /^Download(ing)? https?:\/\//.test(l.trim()) || /Downloading https?:\/\//.test(l)).map((l) => l.trim()))];
fs.writeFileSync(path.join(DIST, 'android-downloads.txt'), downloads.join('\n') + '\n', 'utf8');
console.log('gradle exit=' + r.status + ', log ' + log + ', download lines ' + downloads.length);
if (r.status !== 0) {
  console.log(all.split(/\r?\n/).filter((l) => /FAILURE|What went wrong|error:|> /.test(l)).slice(0, 40).join('\n'));
  process.exit(1);
}
const variant = RELEASE ? 'release' : 'debug';
const apk = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', variant, 'app-' + variant + '.apk');
if (RELEASE) verifyRelease(apk);
const out = path.join(DIST, RELEASE ? '盲文记忆-' + version + '.apk' : '盲文记忆-debug.apk');
fs.copyFileSync(apk, out);
if (RELEASE && sha256(apk) !== sha256(out)) die('复制后的 APK 与构建产物不一致。');
console.log('apk ' + out + ' ' + fs.statSync(out).size + ' bytes');
const aapt2 = path.join(SDK, 'build-tools', '36.0.0', 'aapt2.exe');
const b = spawnSync(aapt2, ['dump', 'badging', out], { encoding: 'utf8' });
const lines = (b.stdout || '').split(/\r?\n/).filter((l) => /^(package|sdkVersion|targetSdkVersion|minSdkVersion|application-label|application-icon|application:|launchable-activity|native-code|uses-permission)/.test(l));
console.log(lines.join('\n'));
fs.writeFileSync(path.join(DIST, 'android-badging.txt'), b.stdout || b.stderr || '', 'utf8');

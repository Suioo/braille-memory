'use strict';
/**
 * 构建 Android 调试版 APK：
 *   node tools/android-build.js
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

fs.writeFileSync(path.join(ANDROID, 'local.properties'), 'sdk.dir=' + SDK.replace(/\\/g, '\\\\').replace(/:/g, '\\:') + '\n', 'utf8');
fs.mkdirSync(DIST, { recursive: true });

const env = Object.assign({}, process.env, {
  JAVA_HOME: JDK,
  ANDROID_HOME: SDK,
  ANDROID_SDK_ROOT: SDK,
  PATH: path.join(JDK, 'bin') + path.delimiter + process.env.PATH,
});
const log = path.join(DIST, 'android-build.log');
const r = spawnSync('cmd.exe', ['/c', path.join(ANDROID, 'gradlew.bat'), 'assembleDebug', '--info', '--console=plain'], {
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
const apk = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const out = path.join(DIST, '盲文记忆-debug.apk');
fs.copyFileSync(apk, out);
console.log('apk ' + out + ' ' + fs.statSync(out).size + ' bytes');
const aapt2 = path.join(SDK, 'build-tools', '36.0.0', 'aapt2.exe');
const b = spawnSync(aapt2, ['dump', 'badging', out], { encoding: 'utf8' });
const lines = (b.stdout || '').split(/\r?\n/).filter((l) => /^(package|sdkVersion|targetSdkVersion|minSdkVersion|application-label|application-icon|application:|launchable-activity|native-code|uses-permission)/.test(l));
console.log(lines.join('\n'));
fs.writeFileSync(path.join(DIST, 'android-badging.txt'), b.stdout || b.stderr || '', 'utf8');

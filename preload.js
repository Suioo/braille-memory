'use strict';
/**
 * 预加载脚本（contextIsolation + sandbox）。只暴露最小 API 给页面：window.bm
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bm', {
  /** 启动数据：{shot, table:{ok,rows,errors}, config, progress, storeStatus, themeSource} */
  boot: () => ipcRenderer.invoke('boot:get'),
  /** 保存进度（主进程原子写入）；返回是否成功 */
  saveProgress: (data) => ipcRenderer.invoke('progress:save', data),
  /** 保存自定义文本库（主进程原子写入 texts.json）；返回是否成功 */
  saveTexts: (data) => ipcRenderer.invoke('texts:save', data),
  /** 选 .txt 文件：{ok, bytes} | {ok:false, canceled?, reason?} */
  pickText: () => ipcRenderer.invoke('texts:pick'),
  /** 导出记录：保存对话框 + 写文件；返回 {ok, canceled?} */
  exportRecord: (text, name) => ipcRenderer.invoke('backup:export', text, name),
  /** 导入记录：打开对话框 + 读文件；返回 {ok, text} | {ok:false, canceled?, reason?} */
  pickRecord: () => ipcRenderer.invoke('backup:import'),
  /** 导入前的备份（供撤销）：保存 / 读取 / 清除 */
  saveBackup: (data) => ipcRenderer.invoke('backup:save', data),
  loadBackup: () => ipcRenderer.invoke('backup:load'),
  clearBackup: () => ipcRenderer.invoke('backup:clear'),
  /** 设置主题来源：'system' | 'light' | 'dark' */
  setTheme: (source) => ipcRenderer.invoke('theme:set', source),
  /** 截图：页面已稳定 */
  shotReady: (name) => ipcRenderer.send('shot:ready', name),
  /** 批量截图：告诉主进程有哪些页面 */
  shotPages: (pages) => ipcRenderer.send('shot:pages', pages),
  /** 批量截图：主进程要求显示某页面 */
  onShotShow: (cb) => ipcRenderer.on('shot:show', (_e, page) => cb(page)),
});

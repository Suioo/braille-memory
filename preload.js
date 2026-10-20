'use strict';
/**
 * 预加载脚本（contextIsolation + sandbox）。只暴露最小 API 给页面：window.bm
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bm', {
  /** 启动数据：{shot, table:{ok,rows,errors}, config, progress, storeStatus, themeSource} */
  boot: () => ipcRenderer.invoke('boot:get'),
  /** 启动画面用：同步取已保存的外观设置与是否截图 / e2e 模式（不等数据加载） */
  earlyBoot: () => ipcRenderer.sendSync('boot:early'),
  /** 保存进度（主进程原子写入）；返回是否成功 */
  saveProgress: (data) => ipcRenderer.invoke('progress:save', data),
  /** 保存自定义文本库（主进程原子写入 texts.json）；返回是否成功 */
  saveTexts: (data) => ipcRenderer.invoke('texts:save', data),
  /** 用系统浏览器打开「关于」里的项目地址（主进程白名单校验）；返回是否成功 */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
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
  /** AI 校对（可选）：读取 / 保存接口配置（Key 由主进程加密保存）；发请求（主进程校验地址后发出） */
  aiGetConfig: () => ipcRenderer.invoke('ai:config:get'),
  aiSetConfig: (cfg) => ipcRenderer.invoke('ai:config:set', cfg),
  aiRequest: (req) => ipcRenderer.invoke('ai:request', req),
  /** 流式请求：onChunk(文字片段) 边收边回调；返回 {ok, status, text(出错时的响应体), reason?}。cancel 用返回的 id 调 aiCancel */
  aiStream: (req, onChunk, onId) => {
    const id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    const fn = (_e, sid, text) => { if (sid === id) onChunk(text); };
    ipcRenderer.on('ai:chunk', fn);
    if (onId) onId(id);
    return ipcRenderer.invoke('ai:stream', id, req).finally(() => ipcRenderer.removeListener('ai:chunk', fn));
  },
  aiCancel: (id) => ipcRenderer.send('ai:cancel', id),
  /** 设置主题来源：'system' | 'light' | 'dark' */
  setTheme: (source) => ipcRenderer.invoke('theme:set', source),
  /** 截图：页面已稳定 */
  shotReady: (name) => ipcRenderer.send('shot:ready', name),
  /** 批量截图：告诉主进程有哪些页面 */
  shotPages: (pages) => ipcRenderer.send('shot:pages', pages),
  /** 批量截图：主进程要求显示某页面 */
  onShotShow: (cb) => ipcRenderer.on('shot:show', (_e, page) => cb(page)),
});

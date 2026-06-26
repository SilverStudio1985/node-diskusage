'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');

// 在主进程加载 native 模块；同时通过 IPC 暴露给 renderer。
const diskusage = require('@iislove/diskusage');

// 实际加载的 .node 路径（首个 .node 即我们的 binding）
const loadedNativePath = (() => {
  for (const k of Object.keys(require.cache)) {
    if (k.endsWith('.node')) return k;
  }
  return null;
})();

// 推断 binding 是来自 prebuilds/ 还是本地 build/
function detectBindingSource(p) {
  if (!p) return { kind: 'unknown', label: '未知', detail: '' };
  const lower = p.replace(/\\/g, '/').toLowerCase();
  if (lower.includes('/prebuilds/')) {
    const m = lower.match(/\/prebuilds\/([^/]+)\//);
    return {
      kind: 'prebuild',
      label: '预编译（prebuild）',
      detail: m ? m[1] : '',
    };
  }
  if (lower.includes('/build/release/') || lower.includes('/build/debug/')) {
    return { kind: 'local-build', label: '本地编译（node-gyp）', detail: '' };
  }
  return { kind: 'other', label: '其他来源', detail: '' };
}

const bindingSource = detectBindingSource(loadedNativePath);

function defaultPath() {
  switch (os.platform()) {
    case 'win32':  return 'C:\\';
    case 'darwin': return '/';
    default:       return '/';
  }
}

// 把 usage 里的 bigint 也转字符串，方便 renderer 一致展示
function serializeUsage(u) {
  if (!u) return null;
  return {
    available: typeof u.available === 'bigint' ? u.available.toString() : u.available,
    free:      typeof u.free === 'bigint'      ? u.free.toString()      : u.free,
    total:     typeof u.total === 'bigint'     ? u.total.toString()     : u.total,
  };
}

ipcMain.handle('disk:check', async (_event, p) => {
  const target = p && typeof p === 'string' ? p : defaultPath();
  const n = await diskusage.check(target);
  const b = await diskusage.checkBig(target);
  return {
    target,
    number: n,
    bigint: serializeUsage(b),
    binding: {
      path:   loadedNativePath,
      kind:   bindingSource.kind,
      label:  bindingSource.label,
      detail: bindingSource.detail,
    },
    runtime: {
      node:     process.versions.node,
      napi:     process.versions.napi,
      electron: process.versions.electron,
      chrome:   process.versions.chrome,
      platform: process.platform,
      arch:     process.arch,
    },
  };
});

ipcMain.handle('disk:listVolumes', async (_event, opts) => {
  const big      = !!(opts && opts.big);
  const physical = !!(opts && opts.physical);

  let list;
  if (physical) {
    list = big ? await diskusage.listPhysicalDisksBig()
               : await diskusage.listPhysicalDisks();
  } else {
    list = big ? await diskusage.listVolumesBig()
               : await diskusage.listVolumes();
  }

  // BigInt 不能直接走 IPC 的 JSON 序列化，统一转字符串
  return list.map(v => ({
    mountpoint:  v.mountpoint,
    mountpoints: v.mountpoints || [v.mountpoint],
    name:        v.name,
    fs:          v.fs,
    type:        v.type,
    device:      v.device || '',
    ok:          v.ok,
    error:       v.error,
    usage:       v.ok ? {
      available: big ? v.usage.available.toString() : v.usage.available,
      free:      big ? v.usage.free.toString()      : v.usage.free,
      total:     big ? v.usage.total.toString()     : v.usage.total,
    } : null,
    valueKind: big ? 'bigint-string' : 'number',
  }));
});

function createWindow() {
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  // 启动日志：明确告知加载到的是 prebuild 还是本地 build
  console.log(`[main] native binding: ${bindingSource.label}` +
    (bindingSource.detail ? ` [${bindingSource.detail}]` : ''));
  console.log('[main] native path:', loadedNativePath);

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

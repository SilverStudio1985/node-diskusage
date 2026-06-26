'use strict';

/**
 * Node.js 真机抽样验证脚本
 *
 * 使用方式：
 *   1) 在本仓库根目录：npm install && npm run rebuild
 *      （或者用安装好的 prebuild 包：cd demo/node && npm install ../..）
 *   2) node demo/node/run.js
 *      node demo/node/run.js D:\ E:\ /Users/me /Volumes/Data
 *
 * 行为：
 *   - 没传参数时，自动按平台选一个常见路径
 *   - 同时调用 Number / BigInt / Promise / Callback 四种入口
 *   - 打印 napi_build_version、模块路径，便于排查 prebuild 是否命中
 */

const os = require('node:os');
const path = require('node:path');
const process = require('node:process');

// 允许直接从仓库根目录运行（require 上两层）
const diskusage = require(path.join(__dirname, '..', '..'));

function defaultPaths() {
  switch (os.platform()) {
    case 'win32':  return ['C:\\'];
    case 'darwin': return ['/', '/System/Volumes/Data'];
    default:       return ['/'];
  }
}

function fmtBytes(n) {
  const v = typeof n === 'bigint' ? Number(n) : n;
  if (!Number.isFinite(v)) return String(n);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0, x = v;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(2)} ${units[i]}`;
}

function printBindingMeta() {
  try {
    // 找到实际加载的 .node 文件路径
    const required = Object.keys(require.cache).filter(k => k.endsWith('.node'));
    console.log('---- 加载的 native 模块 ----');
    required.forEach(p => console.log('  ' + p));
  } catch (_) { /* ignore */ }
  console.log('---- 运行环境 ----');
  console.log('  process.versions.node     =', process.versions.node);
  console.log('  process.versions.napi     =', process.versions.napi);
  console.log('  process.versions.electron =', process.versions.electron || '(not electron)');
  console.log('  process.platform/arch     =', process.platform, process.arch);
  console.log('');
}

async function probe(p) {
  console.log(`=========== ${p} ===========`);

  // 1) checkSync (Number)
  const n = diskusage.checkSync(p);
  console.log('checkSync     :', {
    available: `${n.available} (${fmtBytes(n.available)})`,
    free:      `${n.free} (${fmtBytes(n.free)})`,
    total:     `${n.total} (${fmtBytes(n.total)})`,
  });

  // 2) checkSyncBig (BigInt)
  const b = diskusage.checkSyncBig(p);
  console.log('checkSyncBig  :', {
    available: `${b.available}n (${fmtBytes(b.available)})`,
    free:      `${b.free}n (${fmtBytes(b.free)})`,
    total:     `${b.total}n (${fmtBytes(b.total)})`,
  });

  // 3) Promise
  const pn = await diskusage.check(p);
  console.log('check(Promise):', { total: pn.total, free: pn.free });

  // 4) Callback（向后兼容）
  await new Promise((resolve, reject) => {
    diskusage.check(p, (err, info) => {
      if (err) return reject(err);
      console.log('check(cb)     :', { total: info.total, free: info.free });
      resolve();
    });
  });

  // 5) BigInt Promise
  const pb = await diskusage.checkBig(p);
  console.log('checkBig(Prom):', { total: pb.total, free: pb.free });

  console.log('');
}

(async () => {
  printBindingMeta();

  // 0) 列出全部磁盘/卷
  console.log('=========== listVolumes() ===========');
  const vols = await diskusage.listVolumes();
  for (const v of vols) {
    if (v.ok) {
      console.log(
        `[${v.type.padEnd(9)}] ${v.mountpoint.padEnd(28)} ` +
        `${(v.name || '').padEnd(18)} ${v.fs.padEnd(10)} ` +
        `total=${fmtBytes(v.usage.total).padStart(10)}  ` +
        `free=${fmtBytes(v.usage.free).padStart(10)}  ` +
        `avail=${fmtBytes(v.usage.available).padStart(10)}  ` +
        `device=${v.device}`
      );
    } else {
      console.log(`[${v.type.padEnd(9)}] ${v.mountpoint}  (skipped: ${v.error})`);
    }
  }
  console.log('');

  // 0.5) 物理盘视角（macOS APFS / Linux 多分区在同盘 时去重）
  console.log('=========== listPhysicalDisks() ===========');
  const phys = await diskusage.listPhysicalDisks();
  for (const v of phys) {
    if (!v.ok) continue;
    const mounts = v.mountpoints.length > 1
      ? `  挂载点x${v.mountpoints.length}: ${v.mountpoints.join(', ')}`
      : '';
    console.log(
      `[${v.type.padEnd(9)}] ${v.mountpoint.padEnd(28)} ` +
      `${v.fs.padEnd(10)} ` +
      `total=${fmtBytes(v.usage.total).padStart(10)}  ` +
      `device=${v.device}${mounts}`
    );
  }
  console.log('');

  const paths = process.argv.slice(2).length ? process.argv.slice(2) : defaultPaths();
  for (const p of paths) {
    try { await probe(p); }
    catch (e) {
      console.error(`[ERROR] ${p}:`, e.message);
    }
  }
})();

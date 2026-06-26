'use strict';

// node-gyp-build looks up the right prebuilt .node file for current
// platform/arch/runtime (Node or Electron), or falls back to local build.
const binding = require('node-gyp-build')(__dirname + '/..');

/**
 * @typedef {Object} DiskUsage
 * @property {number} available  Bytes available to the current user
 * @property {number} free       Bytes physically free
 * @property {number} total      Total bytes (free + used)
 */

/**
 * @typedef {Object} DiskUsageBig
 * @property {bigint} available  Bytes available to the current user
 * @property {bigint} free       Bytes physically free
 * @property {bigint} total      Total bytes (free + used)
 */

function ensurePath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new TypeError('path must be a non-empty string');
  }
}

/**
 * 同步查询磁盘使用情况（Number 版本，安全到 8 PB）。
 * @param {string} path
 * @returns {DiskUsage}
 */
function checkSync(path) {
  ensurePath(path);
  return binding.checkSync(path);
}

/**
 * 同步查询磁盘使用情况（BigInt 版本，无精度损失）。
 * @param {string} path
 * @returns {DiskUsageBig}
 */
function checkSyncBig(path) {
  ensurePath(path);
  return binding.checkSyncBig(path);
}

/**
 * 异步查询磁盘使用情况（Number 版本）。
 * 同时支持 Promise 与 Node 回调风格（兼容旧 API）。
 * @param {string} path
 * @param {(err: Error|null, info?: DiskUsage) => void} [callback]
 * @returns {Promise<DiskUsage>|void}
 */
function check(path, callback) {
  if (typeof callback === 'function') {
    try { ensurePath(path); } catch (e) { return callback(e); }
    binding.checkAsync(path).then(
      (info) => callback(null, info),
      (err) => callback(err)
    );
    return;
  }
  try { ensurePath(path); } catch (e) { return Promise.reject(e); }
  return binding.checkAsync(path);
}

/**
 * 异步查询磁盘使用情况（BigInt 版本）。
 * @param {string} path
 * @param {(err: Error|null, info?: DiskUsageBig) => void} [callback]
 * @returns {Promise<DiskUsageBig>|void}
 */
function checkBig(path, callback) {
  if (typeof callback === 'function') {
    try { ensurePath(path); } catch (e) { return callback(e); }
    binding.checkAsyncBig(path).then(
      (info) => callback(null, info),
      (err) => callback(err)
    );
    return;
  }
  try { ensurePath(path); } catch (e) { return Promise.reject(e); }
  return binding.checkAsyncBig(path);
}

/**
 * @typedef {Object} Volume
 * @property {string} mountpoint  Windows: "C:\\"；*nix: 挂载点路径
 * @property {string} name        Windows: 卷标；*nix: 同 mountpoint
 * @property {string} fs          文件系统类型（NTFS/FAT32/APFS/ext4/...）
 * @property {'fixed'|'removable'|'network'|'cdrom'|'ramdisk'|'unknown'} type
 * @property {boolean} ok         是否成功取到 usage（如空光驱为 false）
 * @property {string} [error]     ok=false 时的错误信息
 * @property {DiskUsage|null} usage
 */

/**
 * @typedef {Omit<Volume,'usage'> & { usage: DiskUsageBig|null }} VolumeBig
 */

/**
 * 同步列出所有可见磁盘/卷（Number 版本）。
 *  - Windows: 通过 GetLogicalDriveStrings 列出所有盘符
 *  - macOS:   通过 getmntinfo 列出所有挂载点
 *  - Linux:   读取 /proc/mounts 并过滤伪文件系统
 * @returns {Volume[]}
 */
function listVolumesSync() {
  return binding.listVolumesSync();
}

/**
 * 同步列出所有可见磁盘/卷（BigInt 版本）。
 * @returns {VolumeBig[]}
 */
function listVolumesSyncBig() {
  return binding.listVolumesSyncBig();
}

/**
 * 异步列出所有可见磁盘/卷（Number 版本）。
 * @returns {Promise<Volume[]>}
 */
function listVolumes() {
  return binding.listVolumesAsync();
}

/**
 * 异步列出所有可见磁盘/卷（BigInt 版本）。
 * @returns {Promise<VolumeBig[]>}
 */
function listVolumesBig() {
  return binding.listVolumesAsyncBig();
}

/**
 * 从 device 字段提取"物理盘"的归并 key。
 *  - macOS APFS: /dev/disk3s1s1 → /dev/disk3   （同一 container 共享存储池）
 *  - macOS HFS+: /dev/disk1s1   → /dev/disk1
 *  - Linux:      /dev/sda2      → /dev/sda     ；/dev/nvme0n1p2 → /dev/nvme0n1
 *  - Windows:    Volume GUID（已是物理卷粒度，原样返回）
 *  - 其他:       原样返回（兜底）
 * @param {{device?: string, mountpoint: string}} v
 * @returns {string}
 */
function physicalKey(v) {
  const d = v.device || '';
  if (!d) return v.mountpoint;

  // Windows: \\?\Volume{GUID}\  —— 已经是物理粒度
  if (d.startsWith('\\\\?\\Volume')) return d;

  // macOS APFS / HFS+: /dev/diskNsM[sK] → /dev/diskN
  let m = d.match(/^(\/dev\/disk\d+)/);
  if (m) return m[1];

  // Linux NVMe: /dev/nvme0n1p3 → /dev/nvme0n1
  m = d.match(/^(\/dev\/nvme\d+n\d+)/);
  if (m) return m[1];

  // Linux MMC: /dev/mmcblk0p1 → /dev/mmcblk0
  m = d.match(/^(\/dev\/mmcblk\d+)/);
  if (m) return m[1];

  // Linux 通用块设备: /dev/sda1 → /dev/sda
  m = d.match(/^(\/dev\/[a-zA-Z]+)\d+$/);
  if (m) return m[1];

  // 兜底：device 原值
  return d;
}

/**
 * 在卷列表上做"物理盘"去重。
 * 同一物理盘上的多个挂载点（如 macOS APFS 的 /、/System/Volumes/Data、Preboot 等）
 * 会被合并成一条，选其中 mountpoint 最短的作为代表，并汇总它们的挂载点列表。
 *
 * @template {{mountpoint: string, device?: string, usage: any}} V
 * @param {V[]} volumes
 * @returns {(V & { mountpoints: string[] })[]}
 */
function dedupePhysical(volumes) {
  const groups = new Map();
  for (const v of volumes) {
    const key = physicalKey(v);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  const out = [];
  for (const [, items] of groups) {
    // 选 mountpoint 最短的作为代表（通常是根挂载点）
    items.sort((a, b) => a.mountpoint.length - b.mountpoint.length);
    const rep = items[0];
    out.push({
      ...rep,
      mountpoints: items.map(x => x.mountpoint),
    });
  }
  return out;
}

/**
 * 同步列出"物理盘"视角（Number 版本）。
 * 自动对 macOS APFS 多 Volume 共享存储池的情况做去重。
 * @returns {(Volume & { mountpoints: string[] })[]}
 */
function listPhysicalDisksSync() {
  return dedupePhysical(binding.listVolumesSync());
}

/**
 * 同步列出"物理盘"视角（BigInt 版本）。
 * @returns {(VolumeBig & { mountpoints: string[] })[]}
 */
function listPhysicalDisksSyncBig() {
  return dedupePhysical(binding.listVolumesSyncBig());
}

/**
 * 异步列出"物理盘"视角（Number 版本）。
 * @returns {Promise<(Volume & { mountpoints: string[] })[]>}
 */
async function listPhysicalDisks() {
  const list = await binding.listVolumesAsync();
  return dedupePhysical(list);
}

/**
 * 异步列出"物理盘"视角（BigInt 版本）。
 * @returns {Promise<(VolumeBig & { mountpoints: string[] })[]>}
 */
async function listPhysicalDisksBig() {
  const list = await binding.listVolumesAsyncBig();
  return dedupePhysical(list);
}

module.exports = {
  check, checkSync, checkBig, checkSyncBig,
  listVolumes, listVolumesSync, listVolumesBig, listVolumesSyncBig,
  listPhysicalDisks, listPhysicalDisksSync,
  listPhysicalDisksBig, listPhysicalDisksSyncBig,
};
module.exports.default = module.exports;

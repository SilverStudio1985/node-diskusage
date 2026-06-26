# @iislove/diskusage

跨平台磁盘空间查询模块，基于 **N-API**（Node-API v8）重写，Node 14.21.3+ / Electron 16+ 通用。原生 NAN 版本 [`jduncanator/node-diskusage`](https://github.com/jduncanator/node-diskusage) 的现代化继任版本。

## 特性

- **N-API ABI 稳定**：同一份 `.node` 在 Node 14/18/20/22/24 与 Electron 各版本通用，无需 `electron-rebuild`
- **预编译二进制**：通过 `prebuildify + node-gyp-build` 在以下平台开箱即用：
  - Windows x64 / arm64
  - macOS x64 / **arm64（M1/M2/M3/M4）**
  - Linux x64 / arm64
- **完整 API**：
  - 单路径查询 `check / checkSync` （Number 与 BigInt 两套）
  - 列出所有卷 `listVolumes / listVolumesSync`
  - "物理盘"视角 `listPhysicalDisks`（自动对 macOS APFS、Linux 多分区做去重）
- **零损失精度**：提供 `*Big` 系列接口返回 BigInt
- **TypeScript 完整类型声明**

## 安装

```bash
npm install @iislove/diskusage
```

如果当前平台有预编译二进制则直接拷贝使用；否则会在本地通过 `node-gyp` 编译（需要 C++ 工具链与 Python 3）。

## 使用

```js
const disk = require('@iislove/diskusage');

// 同步 / 异步
const info = disk.checkSync('/');
//   => { available, free, total } (Number)

const info2 = await disk.check('C:\\');

// BigInt 版本（无精度损失，适合 8PB+ 存储）
const big = disk.checkSyncBig('/');
//   => { available, free, total } (BigInt)

// 兼容旧版 callback 风格
disk.check('/', (err, info) => { /* ... */ });
```

### 枚举所有卷

```js
const vols = await disk.listVolumes();
// [
//   { mountpoint: 'C:\\', name: '系统', fs: 'NTFS', type: 'fixed',
//     device: '\\\\?\\Volume{...}\\', ok: true,
//     usage: { available, free, total } },
//   ...
// ]
```

各字段：
- `mountpoint`：Windows 盘符（如 `C:\`）；macOS/Linux 挂载点（如 `/`、`/Volumes/Data`）
- `name`：Windows 卷标；*nix 同 mountpoint
- `fs`：文件系统类型（`NTFS` / `APFS` / `ext4` / `vfat` …）
- `type`：`fixed` / `removable` / `network` / `cdrom` / `ramdisk` / `unknown`
- `device`：底层设备标识。Win 为 Volume GUID 路径；macOS 为 `f_mntfromname`（如 `/dev/disk3s1s1`）；Linux 为 `mnt_fsname`（如 `/dev/sda1`、`/dev/nvme0n1p2`）
- `ok` / `error`：能否取到 usage（例如空光驱为 `false`）
- `usage`：`{ available, free, total }` 或 `null`

### "物理盘"视角（macOS APFS 友好）

macOS APFS 把同一物理盘的 `/`、`/System/Volumes/Data`、`/System/Volumes/Preboot` 等都当作独立 Volume，`listVolumes()` 会返回多条但 `total` 字段相同。如果你只想要"用户视角的物理盘"列表：

```js
const phys = await disk.listPhysicalDisks();
// 返回去重后的列表，每项额外带一个 mountpoints: string[]
// [{
//   mountpoint: '/',
//   mountpoints: ['/', '/System/Volumes/Data', '/System/Volumes/Preboot', ...],
//   device: '/dev/disk3',
//   ...
// }]
```

归并规则（启发式）：
- Windows：Volume GUID 已是物理粒度，原样返回
- macOS：`/dev/disk3s1s1` → `/dev/disk3`
- Linux：`/dev/sda1` → `/dev/sda`，`/dev/nvme0n1p2` → `/dev/nvme0n1`，`/dev/mmcblk0p1` → `/dev/mmcblk0`

## API 总览

| | Number 同步 | Number 异步 | BigInt 同步 | BigInt 异步 |
|---|---|---|---|---|
| 单路径 | `checkSync` | `check` | `checkSyncBig` | `checkBig` |
| 所有卷 | `listVolumesSync` | `listVolumes` | `listVolumesSyncBig` | `listVolumesBig` |
| 物理盘 | `listPhysicalDisksSync` | `listPhysicalDisks` | `listPhysicalDisksSyncBig` | `listPhysicalDisksBig` |

所有异步接口返回 `Promise`；`check` 还兼容 `(path, callback)` 写法。

## 平台细节

- **Windows**：`GetLogicalDriveStringsW` + `GetDriveTypeW` + `GetVolumeNameForVolumeMountPointW` + `GetDiskFreeSpaceExW` + `GetVolumeInformationW`
- **macOS**：`getmntinfo(MNT_NOWAIT)` 得到 `struct statfs[]`
- **Linux**：读 `/proc/mounts`，过滤 proc/sysfs/cgroup/tmpfs 等伪文件系统，再对每个挂载点 `statvfs`

## 与原 `diskusage` 包的差异

- 实现：NAN/C++ → **node-addon-api / N-API v8**
- 预编译：无 → **prebuildify**（包括 macOS arm64）
- 新增 `checkSyncBig / checkBig`（BigInt）
- 新增 `listVolumes / listPhysicalDisks` 及其全部异步/BigInt 变体
- 卷返回值多出 `device` 字段

`check / checkSync` 行为保持向后兼容（同样的 path 输入，同样的 `{ available, free, total }` 输出，同样的 callback/Promise 双重支持）。

## License

[MIT](./LICENSE)

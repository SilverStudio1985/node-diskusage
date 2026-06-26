# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [2.0.0] - Initial release

### 概述

`@iislove/diskusage` 是经典 [`jduncanator/node-diskusage`](https://github.com/jduncanator/node-diskusage) 的 **N-API 重写版**。原项目自 1.2.0 (2023-09) 后已停止维护，依赖的 NAN 在新版 Node 上构建越来越困难，且没有 macOS arm64 预编译。

本版本目标：

- 用 **Node-API v8 + node-addon-api 6.x** 替换 NAN，ABI 稳定，Node 14.21.3 / 18 / 20 / 22 / 24 / Electron 16+ 通用
- 提供 **6 个平台预编译二进制**（win32-x64/arm64, darwin-x64/arm64, linux-x64/arm64），开箱即用，不需要 `electron-rebuild`
- 保持原 API 完全向后兼容，同时新增 BigInt、列出全部卷、物理盘视角等接口

### Added（新增能力）

- **BigInt 精度系列**：所有查询函数都提供 `*Big` 变体，返回 BigInt，无精度损失
  - `checkSyncBig(path)` / `checkBig(path)`
  - `listVolumesSyncBig()` / `listVolumesBig()`
  - `listPhysicalDisksSyncBig()` / `listPhysicalDisksBig()`
- **枚举所有卷**：`listVolumes()` / `listVolumesSync()`
  - Windows：`GetLogicalDriveStringsW` 枚举所有盘符
  - macOS：`getmntinfo(MNT_NOWAIT)` 列出所有挂载点
  - Linux：解析 `/proc/mounts`，自动过滤伪文件系统
- **物理盘视角**：`listPhysicalDisks()` / `listPhysicalDisksSync()`
  - 自动对 **macOS APFS** 同一 container 的多 Volume 做去重
  - Linux 把 `/dev/sda1`、`/dev/sda2` 合并到 `/dev/sda`
  - 返回的每条记录额外带 `mountpoints: string[]`，列出归并到同一物理盘的所有挂载点
- **更丰富的卷元数据**：
  - `name`（Windows 卷标 / *nix mountpoint）
  - `fs`（文件系统类型：NTFS / APFS / ext4 / vfat …）
  - `type`（fixed / removable / network / cdrom / ramdisk / unknown）
  - `device`（Win Volume GUID / macOS `f_mntfromname` / Linux `mnt_fsname`）
  - `ok` 与 `error`（如空光驱报错时返回 `ok=false`）

### Changed（变更）

- 实现层：NAN/C++ → **node-addon-api / N-API v8**
- 构建/发布：`node-gyp` → **`node-gyp-build` + `prebuildify`**
  - 用户安装时优先用预编译，没有匹配的才回退到源码编译
- 启用 MSVC `/utf-8`，源码中文注释/字符串不再被 GBK 误解析
- 默认 `MACOSX_DEPLOYMENT_TARGET=10.15`，C++17

### Compatibility（兼容性）

- `check / checkSync` 行为与原 `diskusage` 完全一致：
  - 同样的 path 输入 → 同样的 `{ available, free, total }` 输出
  - 同样支持 callback 与 Promise 两种异步风格
- 现有项目从 `diskusage` 切到 `@iislove/diskusage` 只需要改 `require` 字符串

### Platform matrix（平台覆盖）

通过 GitHub Actions prebuild workflow 产出：

| Platform | Arch | Status |
|---|---|---|
| Windows | x64 | ✅ |
| Windows | arm64 | ✅（cross-compile） |
| macOS 13 | x64 | ✅ |
| macOS 14 | arm64 (M1/M2/M3/M4) | ✅ |
| Ubuntu 22.04 | x64 | ✅ |
| Ubuntu 22.04 | arm64 | ✅（native runner） |

### Demos

- `demo/node/`：5 种调用入口的抽样脚本（同步 Number / Promise / Callback / BigInt 同步 / BigInt Promise + 枚举/物理盘）
- `demo/electron/`：最小 Electron 应用
  - 卡片式磁盘列表，进度条颜色映射
  - **Number / BigInt 切换**
  - **所有卷 / 物理盘视角切换**
  - 顶部 binding 徽章：一眼看出加载到的是 prebuild 还是本地编译

### Tooling

- `node-addon-api ^6.1`
- `node-gyp-build ^4.8`
- `prebuildify ^6.0`
- GitHub Actions：matrix CI + matrix prebuild + npm publish with provenance

### Acknowledgments

致谢原作者 [@jduncanator](https://github.com/jduncanator)。本仓库 MIT。

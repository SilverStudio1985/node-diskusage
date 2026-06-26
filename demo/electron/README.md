# Electron 真机抽样验证

最小化的 Electron 应用，用于在真机上验证 `@iislove/diskusage` 是否能被 **主进程**
正确加载，并通过 **IPC** 把数据交给 renderer 展示。

> 因为我们用的是 **N-API v8**，预编译二进制 **不需要 electron-rebuild**，
> 直接被 Electron 内置的 Node ABI 加载即可。这是切到 N-API 后最大的好处之一。

## 步骤

```bash
# 1) 确保仓库根目录已经构建过本地 .node（或有匹配 prebuild）
cd ../..              # 回到仓库根
npm install
npm run rebuild       # 或 npm run prebuildify

# 2) 安装 demo 依赖（会把根包以 file: 协议链入）
cd demo/electron
npm install

# 3) 启动
npm start
```

启动后窗口会显示两个 Tab：

- **磁盘列表**：调用 `diskusage.listVolumes()`，以卡片形式展示所有可见卷。
  每张卡片包含：挂载点 / 卷标 / 文件系统 / 类型徽章 / 占用进度条（>=90% 红色，>=75% 橙色）
  / 已用、可用、总容量。点击"刷新"重新拉取。
- **单路径查询**：调用 `diskusage.check()` 与 `diskusage.checkBig()`，
  JSON 形式输出 Number / BigInt 两版本，以及运行时信息。

顶部状态栏显示：Electron / Chrome / Node / N-API / platform-arch。

终端里 `[main] native modules loaded: [...]` 会打印实际加载的 `.node` 路径，
据此可判断命中的是 `prebuilds/<plat>-<arch>/...` 还是本地 `build/Release/...`。

## 真机覆盖建议

| 平台 | runner / 设备 | 验证点 |
|---|---|---|
| macOS arm64 (M1~M4) | 任一 M 系列 Mac | `prebuilds/darwin-arm64` 命中、IPC 正常 |
| macOS x64 | Intel Mac 或 Rosetta | `prebuilds/darwin-x64` 命中 |
| Windows x64 | Win10/11 x64 | `prebuilds/win32-x64` 命中 |
| Windows arm64 | Surface Pro X / WoA | `prebuilds/win32-arm64` 命中 |
| Linux x64 | Ubuntu 22.04 | `prebuilds/linux-x64` 命中 |
| Linux arm64 | RPi / 服务器 | `prebuilds/linux-arm64` 命中 |

## 常见问题

- **报错 `Could not locate the bindings file`**
  说明既没有 prebuild 命中也没有本地 build。回根目录执行 `npm run rebuild` 后再试。

- **Electron 17 以下版本可能不支持 N-API v8**
  我们的下限是 N-API v8 ⇒ Electron 需 16+（最好 ≥ 22 才稳）。

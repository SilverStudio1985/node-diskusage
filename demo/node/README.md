# Node.js 真机抽样验证

适用：在任何 macOS / Linux / Windows 真机上快速抽样验证 prebuild 二进制是否正常加载与运行。

## 方式 A：直接在仓库内运行（开发态）

```bash
# 仓库根目录
npm install            # 触发 node-gyp-build：有 prebuild 命中就用，否则从源码编译
node demo/node/run.js
```

## 方式 B：作为外部用户安装包来跑（用户视角）

```bash
# 把仓库当成本地包装到 demo/node 里
cd demo/node
npm init -y
npm install ../..      # 注意：此处会复制源码+prebuilds，模拟真实安装
node ./run.js
```

## 方式 C：用 npm pack 生成 tarball 后在真机上验证

```bash
# 在打包机（已 prebuild）执行
npm pack               # 产出 iislove-diskusage-2.0.0.tgz（含 prebuilds/）

# 把 tgz 拷贝到目标真机后
npm i ./iislove-diskusage-2.0.0.tgz
node -e "console.log(require('@iislove/diskusage').checkSync('/'))"
```

## 自定义路径

```bash
node demo/node/run.js D:\\ E:\\        # Windows
node demo/node/run.js / /Volumes/Data  # macOS
node demo/node/run.js / /home          # Linux
```

## 输出含义

- `process.versions.napi`：当前进程支持的 N-API 版本上限（我们要求 >= 8）
- `加载的 native 模块`：实际加载的 `.node` 文件路径。命中 prebuild 时形如
  `.../prebuilds/<platform>-<arch>/node.napi.node`
- 4 种接口（同步 Number / 同步 BigInt / Promise / Callback）的返回值

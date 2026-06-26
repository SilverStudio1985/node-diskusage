// Native disk usage backend.
// Single-path API:
//   checkSync / checkAsync / checkSyncBig / checkAsyncBig
// Enumerate-all API:
//   listVolumesSync / listVolumesAsync   (Number & BigInt variants)
//
// Backends:
//   - Windows: GetLogicalDriveStringsW + GetDriveTypeW + GetDiskFreeSpaceExW +
//              GetVolumeInformationW
//   - macOS:   getmntinfo(MNT_NOWAIT) -> statfs[]
//   - Linux:   /proc/mounts + statvfs per mount

#include <napi.h>
#include <string>
#include <vector>
#include <cstdint>

#if defined(_WIN32)
  #define WIN32_LEAN_AND_MEAN
  #include <windows.h>
#elif defined(__APPLE__)
  #include <sys/param.h>
  #include <sys/ucred.h>
  #include <sys/mount.h>
  #include <sys/statvfs.h>
  #include <errno.h>
  #include <cstring>
#else
  #include <sys/statvfs.h>
  #include <errno.h>
  #include <cstring>
  #include <cstdio>
  #include <mntent.h>
#endif

namespace {

struct DiskInfo {
  uint64_t available = 0;
  uint64_t free      = 0;
  uint64_t total     = 0;
};

struct VolumeInfo {
  std::string mountpoint;   // Win: "C:\\"      *nix: "/", "/Volumes/Data"
  std::string name;         // Win: volume label, *nix: 同 mountpoint
  std::string fs;           // Win: "NTFS"/"FAT32"/..., *nix: f_fstypename / mntent type
  std::string type;         // "fixed" | "removable" | "network" | "cdrom" | "ramdisk" | "unknown"
  std::string device;       // macOS: f_mntfromname (/dev/disk3s1s1); Linux: mnt_fsname (/dev/sda1);
                            // Win:   Volume GUID path (\\?\Volume{...}\)
  bool ok = false;          // 查询是否成功（如光驱无盘片时返回 ok=false）
  std::string errMsg;       // ok=false 时的错误描述
  DiskInfo usage{};
};

// ------------------- Single-path query -------------------

std::string QueryDisk(const std::string& path, DiskInfo& out) {
#if defined(_WIN32)
  int wlen = MultiByteToWideChar(CP_UTF8, 0, path.c_str(), -1, nullptr, 0);
  if (wlen <= 0) return "Invalid path encoding";
  std::wstring wpath(wlen, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, path.c_str(), -1, &wpath[0], wlen);

  ULARGE_INTEGER avail{}, total{}, free{};
  if (!GetDiskFreeSpaceExW(wpath.c_str(), &avail, &total, &free)) {
    DWORD err = GetLastError();
    return "GetDiskFreeSpaceExW failed, error code: " + std::to_string(err);
  }
  out.available = static_cast<uint64_t>(avail.QuadPart);
  out.total     = static_cast<uint64_t>(total.QuadPart);
  out.free      = static_cast<uint64_t>(free.QuadPart);
  return {};
#else
  struct statvfs s{};
  if (statvfs(path.c_str(), &s) != 0) {
    return std::string("statvfs failed: ") + std::strerror(errno);
  }
  const uint64_t frsize = static_cast<uint64_t>(s.f_frsize ? s.f_frsize : s.f_bsize);
  out.total     = frsize * static_cast<uint64_t>(s.f_blocks);
  out.free      = frsize * static_cast<uint64_t>(s.f_bfree);
  out.available = frsize * static_cast<uint64_t>(s.f_bavail);
  return {};
#endif
}

// ------------------- List all volumes -------------------

#if defined(_WIN32)
static std::string Utf16ToUtf8(const wchar_t* w) {
  if (!w) return {};
  int len = WideCharToMultiByte(CP_UTF8, 0, w, -1, nullptr, 0, nullptr, nullptr);
  if (len <= 1) return {};
  std::string s(len - 1, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w, -1, &s[0], len, nullptr, nullptr);
  return s;
}

static const char* DriveTypeName(UINT t) {
  switch (t) {
    case DRIVE_REMOVABLE: return "removable";
    case DRIVE_FIXED:     return "fixed";
    case DRIVE_REMOTE:    return "network";
    case DRIVE_CDROM:     return "cdrom";
    case DRIVE_RAMDISK:   return "ramdisk";
    default:              return "unknown";
  }
}

static std::vector<VolumeInfo> ListVolumes() {
  std::vector<VolumeInfo> result;

  DWORD need = GetLogicalDriveStringsW(0, nullptr);
  if (need == 0) return result;
  std::wstring buf(need, L'\0');
  DWORD got = GetLogicalDriveStringsW(need, &buf[0]);
  if (got == 0) return result;

  // buf 是 "C:\\\0D:\\\0...\0\0" 形式
  size_t i = 0;
  while (i < buf.size() && buf[i] != L'\0') {
    const wchar_t* root = &buf[i];
    size_t rlen = wcslen(root);

    VolumeInfo v;
    v.mountpoint = Utf16ToUtf8(root);

    UINT dt = GetDriveTypeW(root);
    v.type = DriveTypeName(dt);

    // Volume GUID 路径（同一物理卷在多个盘符挂载时 GUID 相同）
    wchar_t guid[64] = {0};
    if (GetVolumeNameForVolumeMountPointW(root, guid, 64)) {
      v.device = Utf16ToUtf8(guid);
    }

    wchar_t volName[MAX_PATH + 1] = {0};
    wchar_t fsName[MAX_PATH + 1]  = {0};
    DWORD serial = 0, maxComp = 0, flags = 0;

    // SetErrorMode 防止光驱无盘片弹窗
    UINT oldMode = SetErrorMode(SEM_FAILCRITICALERRORS);
    BOOL viOk = GetVolumeInformationW(root, volName, MAX_PATH, &serial,
                                      &maxComp, &flags, fsName, MAX_PATH);
    if (viOk) {
      v.name = Utf16ToUtf8(volName);
      v.fs   = Utf16ToUtf8(fsName);
    }

    ULARGE_INTEGER avail{}, total{}, freeBytes{};
    if (GetDiskFreeSpaceExW(root, &avail, &total, &freeBytes)) {
      v.usage.available = avail.QuadPart;
      v.usage.total     = total.QuadPart;
      v.usage.free      = freeBytes.QuadPart;
      v.ok = true;
    } else {
      DWORD ec = GetLastError();
      v.ok = false;
      v.errMsg = "GetDiskFreeSpaceExW failed, error code: " + std::to_string(ec);
    }
    SetErrorMode(oldMode);

    if (v.name.empty()) v.name = v.mountpoint;
    result.push_back(std::move(v));
    i += rlen + 1; // 跳过当前串以及 \0
  }
  return result;
}

#elif defined(__APPLE__)

static std::vector<VolumeInfo> ListVolumes() {
  std::vector<VolumeInfo> result;
  struct statfs* mounts = nullptr;
  int n = getmntinfo(&mounts, MNT_NOWAIT);
  if (n <= 0 || !mounts) return result;

  for (int i = 0; i < n; i++) {
    const struct statfs& m = mounts[i];

    VolumeInfo v;
    v.mountpoint = m.f_mntonname;
    v.name       = m.f_mntonname;
    v.fs         = m.f_fstypename;
    v.device     = m.f_mntfromname;

    // 简单分类：网络挂载 vs 本地
    if ((m.f_flags & MNT_LOCAL) == 0) v.type = "network";
    else if (std::strcmp(m.f_fstypename, "devfs") == 0 ||
             std::strcmp(m.f_fstypename, "autofs") == 0)
      v.type = "unknown";
    else v.type = "fixed";

    // 用 f_bsize（块字节数）直接算字节
    const uint64_t bs = m.f_bsize ? m.f_bsize : 4096;
    v.usage.total     = bs * static_cast<uint64_t>(m.f_blocks);
    v.usage.free      = bs * static_cast<uint64_t>(m.f_bfree);
    v.usage.available = bs * static_cast<uint64_t>(m.f_bavail);
    v.ok = true;

    result.push_back(std::move(v));
  }
  return result;
}

#else // Linux

static std::vector<VolumeInfo> ListVolumes() {
  std::vector<VolumeInfo> result;

  FILE* fp = setmntent("/proc/mounts", "r");
  if (!fp) fp = setmntent("/etc/mtab", "r");
  if (!fp) return result;

  struct mntent ent{};
  char buf[4096];
  while (getmntent_r(fp, &ent, buf, sizeof(buf))) {
    // 过滤掉虚拟/伪文件系统，避免 df 一样的噪音
    const char* fst = ent.mnt_type ? ent.mnt_type : "";
    if (!fst[0]) continue;
    static const char* kSkip[] = {
      "proc", "sysfs", "cgroup", "cgroup2", "devpts", "tmpfs", "devtmpfs",
      "mqueue", "debugfs", "tracefs", "securityfs", "pstore", "bpf",
      "configfs", "hugetlbfs", "fusectl", "binfmt_misc", "autofs",
      "rpc_pipefs", "nsfs", "overlay", "squashfs", "ramfs"
    };
    bool skip = false;
    for (const char* s : kSkip) if (std::strcmp(fst, s) == 0) { skip = true; break; }
    if (skip) continue;

    VolumeInfo v;
    v.mountpoint = ent.mnt_dir ? ent.mnt_dir : "";
    v.name       = v.mountpoint;
    v.fs         = fst;
    v.device     = ent.mnt_fsname ? ent.mnt_fsname : "";

    if (std::strncmp(fst, "nfs", 3) == 0 || std::strcmp(fst, "cifs") == 0 ||
        std::strcmp(fst, "smbfs") == 0 || std::strcmp(fst, "smb3") == 0 ||
        std::strcmp(fst, "fuse.sshfs") == 0)
      v.type = "network";
    else if (std::strcmp(fst, "iso9660") == 0 || std::strcmp(fst, "udf") == 0)
      v.type = "cdrom";
    else
      v.type = "fixed";

    struct statvfs s{};
    if (statvfs(v.mountpoint.c_str(), &s) == 0) {
      const uint64_t fr = s.f_frsize ? s.f_frsize : s.f_bsize;
      v.usage.total     = fr * static_cast<uint64_t>(s.f_blocks);
      v.usage.free      = fr * static_cast<uint64_t>(s.f_bfree);
      v.usage.available = fr * static_cast<uint64_t>(s.f_bavail);
      v.ok = true;
    } else {
      v.ok = false;
      v.errMsg = std::string("statvfs failed: ") + std::strerror(errno);
    }
    result.push_back(std::move(v));
  }
  endmntent(fp);
  return result;
}

#endif

// ------------------- Napi result builders -------------------

Napi::Object BuildResult(Napi::Env env, const DiskInfo& info) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("available", Napi::Number::New(env, static_cast<double>(info.available)));
  obj.Set("free",      Napi::Number::New(env, static_cast<double>(info.free)));
  obj.Set("total",     Napi::Number::New(env, static_cast<double>(info.total)));
  return obj;
}

Napi::Object BuildResultBig(Napi::Env env, const DiskInfo& info) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("available", Napi::BigInt::New(env, info.available));
  obj.Set("free",      Napi::BigInt::New(env, info.free));
  obj.Set("total",     Napi::BigInt::New(env, info.total));
  return obj;
}

Napi::Value BuildVolumes(Napi::Env env, const std::vector<VolumeInfo>& vols, bool big) {
  Napi::Array arr = Napi::Array::New(env, vols.size());
  for (uint32_t i = 0; i < vols.size(); i++) {
    const VolumeInfo& v = vols[i];
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("mountpoint", Napi::String::New(env, v.mountpoint));
    obj.Set("name",       Napi::String::New(env, v.name));
    obj.Set("fs",         Napi::String::New(env, v.fs));
    obj.Set("type",       Napi::String::New(env, v.type));
    obj.Set("device",     Napi::String::New(env, v.device.c_str()));
    obj.Set("ok",         Napi::Boolean::New(env, v.ok));
    if (!v.errMsg.empty()) obj.Set("error", Napi::String::New(env, v.errMsg.c_str()));
    if (v.ok) {
      obj.Set("usage", big ? BuildResultBig(env, v.usage) : BuildResult(env, v.usage));
    } else {
      obj.Set("usage", env.Null());
    }
    arr.Set(i, obj);
  }
  return arr;
}

// ------------------- AsyncWorkers -------------------

class CheckWorker : public Napi::AsyncWorker {
 public:
  CheckWorker(Napi::Env env, std::string path, bool big)
    : Napi::AsyncWorker(env), deferred_(Napi::Promise::Deferred::New(env)),
      path_(std::move(path)), big_(big) {}

  Napi::Promise GetPromise() { return deferred_.Promise(); }

  void Execute() override {
    auto err = QueryDisk(path_, info_);
    if (!err.empty()) SetError(err);
  }
  void OnOK() override {
    deferred_.Resolve(big_ ? BuildResultBig(Env(), info_) : BuildResult(Env(), info_));
  }
  void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

 private:
  Napi::Promise::Deferred deferred_;
  std::string path_;
  bool big_;
  DiskInfo info_{};
};

class ListWorker : public Napi::AsyncWorker {
 public:
  ListWorker(Napi::Env env, bool big)
    : Napi::AsyncWorker(env), deferred_(Napi::Promise::Deferred::New(env)), big_(big) {}

  Napi::Promise GetPromise() { return deferred_.Promise(); }

  void Execute() override { vols_ = ListVolumes(); }
  void OnOK() override { deferred_.Resolve(BuildVolumes(Env(), vols_, big_)); }
  void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

 private:
  Napi::Promise::Deferred deferred_;
  bool big_;
  std::vector<VolumeInfo> vols_;
};

// ------------------- Sync exports -------------------

Napi::Value CheckSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "path (string) is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();
  DiskInfo di;
  auto err = QueryDisk(path, di);
  if (!err.empty()) {
    Napi::Error::New(env, err).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  return BuildResult(env, di);
}

Napi::Value CheckSyncBig(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "path (string) is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();
  DiskInfo di;
  auto err = QueryDisk(path, di);
  if (!err.empty()) {
    Napi::Error::New(env, err).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  return BuildResultBig(env, di);
}

Napi::Value CheckAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "path (string) is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();
  auto* worker = new CheckWorker(env, std::move(path), /*big=*/false);
  auto p = worker->GetPromise();
  worker->Queue();
  return p;
}

Napi::Value CheckAsyncBig(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "path (string) is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();
  auto* worker = new CheckWorker(env, std::move(path), /*big=*/true);
  auto p = worker->GetPromise();
  worker->Queue();
  return p;
}

Napi::Value ListVolumesSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto vols = ListVolumes();
  return BuildVolumes(env, vols, /*big=*/false);
}

Napi::Value ListVolumesSyncBig(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto vols = ListVolumes();
  return BuildVolumes(env, vols, /*big=*/true);
}

Napi::Value ListVolumesAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto* worker = new ListWorker(env, /*big=*/false);
  auto p = worker->GetPromise();
  worker->Queue();
  return p;
}

Napi::Value ListVolumesAsyncBig(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto* worker = new ListWorker(env, /*big=*/true);
  auto p = worker->GetPromise();
  worker->Queue();
  return p;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("checkSync",          Napi::Function::New(env, CheckSync));
  exports.Set("checkAsync",         Napi::Function::New(env, CheckAsync));
  exports.Set("checkSyncBig",       Napi::Function::New(env, CheckSyncBig));
  exports.Set("checkAsyncBig",      Napi::Function::New(env, CheckAsyncBig));
  exports.Set("listVolumesSync",    Napi::Function::New(env, ListVolumesSync));
  exports.Set("listVolumesSyncBig", Napi::Function::New(env, ListVolumesSyncBig));
  exports.Set("listVolumesAsync",   Napi::Function::New(env, ListVolumesAsync));
  exports.Set("listVolumesAsyncBig",Napi::Function::New(env, ListVolumesAsyncBig));
  return exports;
}

} // namespace

NODE_API_MODULE(diskusage, Init)

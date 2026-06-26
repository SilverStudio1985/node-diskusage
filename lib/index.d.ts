export interface DiskUsage {
  /** Bytes available to the current user (Linux reserves some for root). */
  available: number;
  /** Bytes physically free. */
  free: number;
  /** Total bytes (free + used). */
  total: number;
}

export interface DiskUsageBig {
  available: bigint;
  free: bigint;
  total: bigint;
}

export type VolumeType =
  | 'fixed'
  | 'removable'
  | 'network'
  | 'cdrom'
  | 'ramdisk'
  | 'unknown';

export interface Volume {
  /** Windows: "C:\\"；macOS/Linux: 挂载点路径，例如 "/" 或 "/Volumes/Data" */
  mountpoint: string;
  /** Windows: 卷标（label）；*nix: 同 mountpoint */
  name: string;
  /** 文件系统类型，例如 "NTFS" / "APFS" / "ext4" */
  fs: string;
  type: VolumeType;
  /**
   * 底层设备/卷的标识。
   *  - Windows: Volume GUID 路径 `\\?\Volume{...}\`
   *  - macOS:   `f_mntfromname`，如 `/dev/disk3s1s1`
   *  - Linux:   `mnt_fsname`，如 `/dev/sda1`、`/dev/nvme0n1p2`
   * 可能为空字符串。
   */
  device: string;
  /** 是否成功取到 usage 信息（如空光驱为 false） */
  ok: boolean;
  /** ok=false 时的错误信息 */
  error?: string;
  usage: DiskUsage | null;
}

export interface VolumeBig extends Omit<Volume, 'usage'> {
  usage: DiskUsageBig | null;
}

/** "物理盘"视角：在 Volume 基础上多一个 mountpoints 数组，列出归并到同一物理盘的所有挂载点。 */
export type PhysicalDisk    = Volume    & { mountpoints: string[] };
export type PhysicalDiskBig = VolumeBig & { mountpoints: string[] };

export function checkSync(path: string): DiskUsage;
export function checkSyncBig(path: string): DiskUsageBig;

export function check(path: string): Promise<DiskUsage>;
export function check(
  path: string,
  callback: (err: Error | null, info?: DiskUsage) => void
): void;

export function checkBig(path: string): Promise<DiskUsageBig>;
export function checkBig(
  path: string,
  callback: (err: Error | null, info?: DiskUsageBig) => void
): void;

/** 列出全部可见磁盘/卷（同步，Number 版本）。 */
export function listVolumesSync(): Volume[];
/** 列出全部可见磁盘/卷（同步，BigInt 版本）。 */
export function listVolumesSyncBig(): VolumeBig[];
/** 列出全部可见磁盘/卷（异步，Number 版本）。 */
export function listVolumes(): Promise<Volume[]>;
/** 列出全部可见磁盘/卷（异步，BigInt 版本）。 */
export function listVolumesBig(): Promise<VolumeBig[]>;

/** "物理盘"视角（同步，Number 版本）：自动对 APFS / 多挂载点同盘做去重。 */
export function listPhysicalDisksSync(): PhysicalDisk[];
/** "物理盘"视角（同步，BigInt 版本）。 */
export function listPhysicalDisksSyncBig(): PhysicalDiskBig[];
/** "物理盘"视角（异步，Number 版本）。 */
export function listPhysicalDisks(): Promise<PhysicalDisk[]>;
/** "物理盘"视角（异步，BigInt 版本）。 */
export function listPhysicalDisksBig(): Promise<PhysicalDiskBig[]>;

declare const _default: {
  check: typeof check;
  checkSync: typeof checkSync;
  checkBig: typeof checkBig;
  checkSyncBig: typeof checkSyncBig;
  listVolumes: typeof listVolumes;
  listVolumesSync: typeof listVolumesSync;
  listVolumesBig: typeof listVolumesBig;
  listVolumesSyncBig: typeof listVolumesSyncBig;
  listPhysicalDisks: typeof listPhysicalDisks;
  listPhysicalDisksSync: typeof listPhysicalDisksSync;
  listPhysicalDisksBig: typeof listPhysicalDisksBig;
  listPhysicalDisksSyncBig: typeof listPhysicalDisksSyncBig;
};
export default _default;

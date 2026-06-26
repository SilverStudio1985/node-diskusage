'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const { check, checkSync, checkBig, checkSyncBig,
        listVolumes, listVolumesSync, listVolumesBig, listVolumesSyncBig,
        listPhysicalDisks, listPhysicalDisksSync } = require('..');

const probePath = os.platform() === 'win32' ? 'C:\\' : '/';

test('checkSync returns numeric fields', () => {
  const info = checkSync(probePath);
  assert.ok(Number.isFinite(info.available));
  assert.ok(Number.isFinite(info.free));
  assert.ok(Number.isFinite(info.total));
  assert.ok(info.total > 0);
  assert.ok(info.free <= info.total);
  assert.ok(info.available <= info.free + 1); // available can equal free on Win
});

test('check returns a Promise', async () => {
  const info = await check(probePath);
  assert.ok(info.total > 0);
});

test('check supports callback', (t, done) => {
  check(probePath, (err, info) => {
    try {
      assert.equal(err, null);
      assert.ok(info.total > 0);
      done();
    } catch (e) {
      done(e);
    }
  });
});

test('invalid path rejects', async () => {
  await assert.rejects(() => check('\u0000bad'));
});

test('checkSyncBig returns bigint fields', () => {
  const info = checkSyncBig(probePath);
  assert.equal(typeof info.available, 'bigint');
  assert.equal(typeof info.free, 'bigint');
  assert.equal(typeof info.total, 'bigint');
  assert.ok(info.total > 0n);
  assert.ok(info.free <= info.total);
});

test('checkBig returns a Promise<bigint>', async () => {
  const info = await checkBig(probePath);
  assert.equal(typeof info.total, 'bigint');
  assert.ok(info.total > 0n);
});

test('Number and BigInt results are consistent', () => {
  const n = checkSync(probePath);
  const b = checkSyncBig(probePath);
  // 允许在两次调用间有少量字节变动，比较量级即可
  const diff = Math.abs(n.total - Number(b.total));
  assert.ok(diff < 1024 * 1024, `total drift too large: ${diff}`);
});

test('listVolumesSync returns at least one volume', () => {
  const list = listVolumesSync();
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0, 'should find at least one volume');
  for (const v of list) {
    assert.equal(typeof v.mountpoint, 'string');
    assert.ok(v.mountpoint.length > 0);
    assert.equal(typeof v.name, 'string');
    assert.equal(typeof v.fs, 'string');
    assert.equal(typeof v.type, 'string');
    assert.equal(typeof v.ok, 'boolean');
    if (v.ok) {
      assert.ok(Number.isFinite(v.usage.total));
      assert.ok(v.usage.total >= 0);
    } else {
      assert.equal(v.usage, null);
    }
  }
});

test('listVolumes async returns same shape', async () => {
  const sync = listVolumesSync();
  const asyn = await listVolumes();
  assert.equal(sync.length, asyn.length);
});

test('listVolumesSyncBig returns BigInt usage', () => {
  const list = listVolumesSyncBig();
  const okOne = list.find(v => v.ok);
  assert.ok(okOne, 'at least one volume should be ok');
  assert.equal(typeof okOne.usage.total, 'bigint');
});

test('listVolumesBig is a Promise', async () => {
  const list = await listVolumesBig();
  assert.ok(Array.isArray(list));
});

test('Volume has device field', () => {
  const list = listVolumesSync();
  for (const v of list) {
    assert.equal(typeof v.device, 'string'); // 可能为空字符串，但必须是 string
  }
});

test('listPhysicalDisksSync dedupes by device', () => {
  const all = listVolumesSync();
  const phys = listPhysicalDisksSync();
  assert.ok(Array.isArray(phys));
  assert.ok(phys.length <= all.length, 'physical count should not exceed volume count');
  assert.ok(phys.length >= 1, 'should find at least one physical disk');
  for (const p of phys) {
    assert.ok(Array.isArray(p.mountpoints));
    assert.ok(p.mountpoints.length >= 1);
    assert.ok(p.mountpoints.includes(p.mountpoint));
  }
});

test('listPhysicalDisks async returns same shape', async () => {
  const sync = listPhysicalDisksSync();
  const asyn = await listPhysicalDisks();
  assert.equal(sync.length, asyn.length);
});

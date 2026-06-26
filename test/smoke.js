'use strict';

// Smoke test compatible with Node 14.21.3+ (no node:test dependency).
// 目的：在不支持 node:test 的旧版 Node 上，验证 prebuild 二进制能被正确加载并工作。

const assert = require('assert');
const os = require('os');
const d = require('..');

const probePath = os.platform() === 'win32' ? 'C:\\' : '/';

function check(name, fn) {
  try {
    fn();
    console.log('  ok  -', name);
  } catch (e) {
    console.error('  FAIL -', name, ':', e && e.stack || e);
    process.exitCode = 1;
  }
}

console.log('node:', process.version, 'napi:', process.versions.napi);
console.log('loaded native modules:');
for (const k of Object.keys(require.cache)) {
  if (k.endsWith('.node')) console.log('  ', k);
}

check('checkSync returns numeric fields', function () {
  var info = d.checkSync(probePath);
  assert.ok(typeof info.total === 'number' && info.total > 0);
  assert.ok(info.free <= info.total);
});

check('check returns a Promise', function () {
  return d.check(probePath).then(function (info) {
    assert.ok(info.total > 0);
  });
});

check('check supports callback', function () {
  return new Promise(function (resolve, reject) {
    d.check(probePath, function (err, info) {
      try {
        assert.ifError(err);
        assert.ok(info.total > 0);
        resolve();
      } catch (e) { reject(e); }
    });
  });
});

check('listVolumesSync returns at least one volume', function () {
  var list = d.listVolumesSync();
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0);
});

check('checkSyncBig returns bigint fields', function () {
  var info = d.checkSyncBig(probePath);
  assert.strictEqual(typeof info.total, 'bigint');
  assert.ok(info.total > 0n);
});

check('listPhysicalDisksSync dedupes', function () {
  var all = d.listVolumesSync();
  var phys = d.listPhysicalDisksSync();
  assert.ok(phys.length <= all.length);
  assert.ok(phys.length >= 1);
});

// 让带 Promise 的 check 等一会儿
setTimeout(function () {
  if (process.exitCode) {
    console.error('\nSome smoke checks FAILED.');
    process.exit(process.exitCode);
  } else {
    console.log('\nAll smoke checks passed.');
  }
}, 500);

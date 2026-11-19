'use strict';
const test = require('node:test');
const assert = require('node:assert');
const X = require('../lib/xlsx');
const SV = require('../lib/services');
test('CRC32 표준값', () => assert.equal(X.crc32(Buffer.from('123456789')).toString(16), 'cbf43926'));
test('xlsx는 zip 파일', () => {
  const b = X.build([{ name: '시트', rows: [['이름', { v: 1.5, num: 'hours' }]] }]);
  assert.equal(b.readUInt32LE(0), 0x04034b50);
  assert.equal(b.readUInt32LE(b.length - 22), 0x06054b50);
});
test('사업자등록번호 검증번호', () => {
  assert.equal(SV.bizNoValid('123-45-67891'), true);
  assert.equal(SV.bizNoValid('1234567890'), false);
  assert.equal(SV.bizNoValid('12345'), false);
});
test('거리 계산', () => assert.ok(Math.abs(SV.distanceM({ lat: 37.5, lng: 127 }, { lat: 37.501, lng: 127 }) - 111) < 2));

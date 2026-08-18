import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorToMinute } from '../lib/shared/time.ts';

test('floorToMinute: 秒とミリ秒を切り捨てる(四捨五入しない)', () => {
  assert.equal(floorToMinute('2026-08-14T10:15:59.999Z'), '2026-08-14T10:15:00.000Z');
  assert.equal(floorToMinute('2026-08-14T10:15:01.000Z'), '2026-08-14T10:15:00.000Z');
});

test('floorToMinute: 既に分単位の値はそのまま', () => {
  assert.equal(floorToMinute('2026-08-14T10:15:00.000Z'), '2026-08-14T10:15:00.000Z');
});

test('floorToMinute: オフセット付きの時刻も同じ瞬間を指したまま切り捨てる', () => {
  assert.equal(floorToMinute('2026-08-14T17:15:42+07:00'), '2026-08-14T10:15:00.000Z');
});

test('floorToMinute: 解釈できない値はnull', () => {
  assert.equal(floorToMinute('あした'), null);
  assert.equal(floorToMinute(''), null);
  assert.equal(floorToMinute(null), null);
  assert.equal(floorToMinute(undefined), null);
  assert.equal(floorToMinute(1755166500000), null);
});

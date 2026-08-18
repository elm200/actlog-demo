import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStartTime } from '../lib/shared/boundary.ts';

const iso = (s: string): string => new Date(s).toISOString();

const NOW = iso('2026-08-14T23:00:00Z');

test('validateStartTime: prev/nextの間に収まる正常な開始時刻はokになる', () => {
  const prev = { id: 1, start_time: iso('2026-08-14T09:00:00Z') };
  const next = { id: 3, start_time: iso('2026-08-14T12:00:00Z') };
  assert.deepEqual(validateStartTime(iso('2026-08-14T10:15:00Z'), prev, next, NOW), { ok: true });
});

test('validateStartTime: 直前の活動の開始時刻以前は弾く', () => {
  const prev = { id: 1, start_time: iso('2026-08-14T09:00:00Z') };
  const result = validateStartTime(iso('2026-08-14T08:59:00Z'), prev, null, NOW);
  assert.equal(result.ok, false);
});

test('validateStartTime: 直後の活動の開始時刻以降は弾く', () => {
  const next = { id: 3, start_time: iso('2026-08-14T11:00:00Z') };
  const result = validateStartTime(iso('2026-08-14T11:00:00Z'), null, next, NOW);
  assert.equal(result.ok, false);
});

test('validateStartTime: 現在時刻より後は弾く', () => {
  const result = validateStartTime(iso('2027-08-14T10:00:00Z'), null, null, NOW);
  assert.equal(result.ok, false);
});

test('validateStartTime: prev/nextどちらも無くても(唯一の活動)現在時刻以前ならokになる', () => {
  assert.deepEqual(validateStartTime(iso('2026-08-14T10:00:00Z'), null, null, NOW), { ok: true });
});

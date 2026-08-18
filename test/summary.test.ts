import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSummary, SUMMARY_MAX_LENGTH } from '../lib/shared/summary.ts';

// normalizeSummary はブラウザとサーバーの両方が呼ぶ。結果が食い違うと、楽観的更新で
// 出した表示とサーバーが保存した値がずれ、リロードで初めて分かるという壊れ方をする。

test('normalizeSummary: 前後の空白を削り、連続する空白は1つにする', () => {
  assert.equal(normalizeSummary('  Claude Code  '), 'Claude Code');
  assert.equal(normalizeSummary('タイ語\n\n単語'), 'タイ語 単語');
});

test('normalizeSummary: 未入力・文字列でない値は空文字(未入力の表現をnullと二重に持たない)', () => {
  assert.equal(normalizeSummary(''), '');
  assert.equal(normalizeSummary('   '), '');
  assert.equal(normalizeSummary(undefined), '');
  assert.equal(normalizeSummary(null), '');
  assert.equal(normalizeSummary(123), '');
});

test('normalizeSummary: 上限を超える入力は切り詰める(DBのCHECK制約に触れさせない)', () => {
  const long = 'あ'.repeat(SUMMARY_MAX_LENGTH + 50);
  assert.equal(Array.from(normalizeSummary(long)).length, SUMMARY_MAX_LENGTH);
  const exact = 'い'.repeat(SUMMARY_MAX_LENGTH);
  assert.equal(normalizeSummary(exact), exact);
});

test('normalizeSummary: 絵文字をコードポイントの途中で切らない', () => {
  // '🐈' はUTF-16では2要素。String#slice で切ると壊れた文字が残る
  const emojis = '🐈'.repeat(SUMMARY_MAX_LENGTH + 5);
  const result = normalizeSummary(emojis);
  assert.equal(result, '🐈'.repeat(SUMMARY_MAX_LENGTH));
  assert.ok(!result.includes('�'));
});

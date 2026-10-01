import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { seal, unseal, authorized } from './crypto.mjs';
test('session archive is encrypted and bound to its establishment', () => {
  process.env.WHATSAPP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const value = seal('unit-a', Buffer.from('synthetic session'));
  assert.equal(unseal('unit-a', value).toString(), 'synthetic session');
  assert.throws(() => unseal('unit-b', value));
  const corrupt = Buffer.from(value, 'base64'); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => unseal('unit-a', corrupt.toString('base64')));
});
test('gateway requires exact nonempty bearer token', () => {
  const secret = randomBytes(32).toString('hex');
  assert.equal(authorized(`Bearer ${secret}`, secret), true);
  assert.equal(authorized('Bearer other', secret), false);
  assert.equal(authorized('', ''), false);
});

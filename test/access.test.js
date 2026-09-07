import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyAccessToken } from '../src/admin/access.js';

// Mint RS256 tokens with a local key pair and verify them against an injected
// JWKS, so no Cloudflare round-trip is needed.
const TEAM = 'example.cloudflareaccess.com';
const AUD = 'aud-123';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const keys = [jwk];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);

function mint(claims = {}, header = {}) {
  const h = b64({ alg: 'RS256', kid: 'k1', ...header });
  const p = b64({ iss: `https://${TEAM}`, aud: [AUD], exp: now + 600, email: 'me@example.com', ...claims });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url');
  return `${h}.${p}.${sig}`;
}

const opts = { keys, team: TEAM, aud: AUD };

test('accepts a well-formed token signed by a known key', async () => {
  const payload = await verifyAccessToken(mint(), opts);
  assert.equal(payload.email, 'me@example.com');
});

test('rejects tampering, wrong key, expiry, issuer and audience', async () => {
  const good = mint();
  const [h, p] = good.split('.');
  const forged = `${h}.${b64({ iss: `https://${TEAM}`, aud: [AUD], exp: now + 600, email: 'evil@example.com' })}.${good.split('.')[2]}`;
  await assert.rejects(verifyAccessToken(forged, opts), /bad signature/);
  await assert.rejects(verifyAccessToken(mint({}, { kid: 'unknown' }), opts), /signing key not found/);
  await assert.rejects(verifyAccessToken(mint({}, { alg: 'HS256' }), opts), /unexpected alg/);
  await assert.rejects(verifyAccessToken(mint({ exp: now - 1 }), opts), /expired/);
  await assert.rejects(verifyAccessToken(mint({ nbf: now + 600 }), opts), /not yet valid/);
  await assert.rejects(verifyAccessToken(mint({ iss: 'https://other.cloudflareaccess.com' }), opts), /bad issuer/);
  await assert.rejects(verifyAccessToken(mint({ aud: ['someone-else'] }), opts), /bad audience/);
  await assert.rejects(verifyAccessToken(undefined, opts), /missing token/);
  await assert.rejects(verifyAccessToken('a.b', opts), /malformed/);
  assert.equal(p.length > 0, true);
});

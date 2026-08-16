import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const keyDir = join(process.cwd(), '.keys');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(keyDir, { recursive: true, mode: 0o700 });
writeFileSync(join(keyDir, 'jwt.private.pem'), privateKey, { mode: 0o600 });
writeFileSync(join(keyDir, 'jwt.public.pem'), publicKey, { mode: 0o644 });

const { n, e } = createPublicKey(publicKey).export({ format: 'jwk' });
const kid = createHash('sha256')
  .update(JSON.stringify({ e, kty: 'RSA', n }))
  .digest('base64url');

console.log(`Wrote RS256 key pair to ${keyDir} (kid=${kid})\n`);
console.log('Copy these two lines into apps/be-identity-service/.env:\n');
console.log(`JWT_PRIVATE_KEY_B64=${Buffer.from(privateKey).toString('base64')}`);
console.log(`JWT_PUBLIC_KEY_B64=${Buffer.from(publicKey).toString('base64')}`);

import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// `--service` mints the separate pair used for service-to-service tokens. It is deliberately a
// different pair from the user one, so a leaked service key can never forge a user login.
const isService = process.argv.includes('--service');
const fileprefix = isService ? 'service-jwt' : 'jwt';
const envPrefix = isService ? 'SERVICE_JWT' : 'JWT';

const keyDir = join(process.cwd(), '.keys');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(keyDir, { recursive: true, mode: 0o700 });
writeFileSync(join(keyDir, `${fileprefix}.private.pem`), privateKey, { mode: 0o600 });
writeFileSync(join(keyDir, `${fileprefix}.public.pem`), publicKey, { mode: 0o644 });

const { n, e } = createPublicKey(publicKey).export({ format: 'jwk' });
const kid = createHash('sha256')
  .update(JSON.stringify({ e, kty: 'RSA', n }))
  .digest('base64url');

console.log(`Wrote RS256 key pair to ${keyDir} (kid=${kid})\n`);

if (isService) {
  console.log('Give the private key only to executor services, which mint service tokens:\n');
  console.log(`${envPrefix}_PRIVATE_KEY_B64=${Buffer.from(privateKey).toString('base64')}\n`);
  console.log('Give the public key to every service that accepts /internal calls:\n');
  console.log(`${envPrefix}_PUBLIC_KEY_B64=${Buffer.from(publicKey).toString('base64')}`);
} else {
  console.log('Copy these two lines into apps/be-identity-service/.env:\n');
  console.log(`${envPrefix}_PRIVATE_KEY_B64=${Buffer.from(privateKey).toString('base64')}`);
  console.log(`${envPrefix}_PUBLIC_KEY_B64=${Buffer.from(publicKey).toString('base64')}`);
}

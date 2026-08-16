import 'dotenv/config';

import { generateKeyPairSync } from 'node:crypto';

// Keep e2e runs self-contained: mint a throwaway key pair when none is configured.
if (!process.env.JWT_PRIVATE_KEY_B64 || !process.env.JWT_PUBLIC_KEY_B64) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  process.env.JWT_PRIVATE_KEY_B64 = Buffer.from(privateKey).toString('base64');
  process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(publicKey).toString('base64');
}

process.env.NODE_ENV = 'test';
process.env.SWAGGER_ENABLED = 'false';
process.env.JWT_ISSUER ||= 'http://localhost:3001';
process.env.JWT_AUDIENCE ||= 'fs-platform';

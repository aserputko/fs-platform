import 'dotenv/config';

import { generateKeyPairSync } from 'node:crypto';

// Silence request logs by default; set E2E_LOG_LEVEL=debug to inspect a failing run.
process.env.LOG_LEVEL = process.env.E2E_LOG_LEVEL ?? 'silent';
process.env.LOG_PRETTY = 'false';

// This service never signs, so a configured public key has no matching private key here.
// Minting a throwaway pair lets the specs stand in for be-identity-service.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(publicKey).toString('base64');
// Read only by the specs; it is deliberately absent from the env schema.
process.env.E2E_JWT_PRIVATE_KEY_B64 = Buffer.from(privateKey).toString('base64');

process.env.NODE_ENV = 'test';
process.env.SWAGGER_ENABLED = 'false';
process.env.JWT_ISSUER ||= 'http://localhost:3001';
process.env.JWT_AUDIENCE ||= 'fs-platform';

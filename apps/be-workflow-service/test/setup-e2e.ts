import 'dotenv/config';

import { generateKeyPairSync } from 'node:crypto';

// Silence request logs by default; set E2E_LOG_LEVEL=debug to inspect a failing run.
process.env.LOG_LEVEL = process.env.E2E_LOG_LEVEL ?? 'silent';
process.env.LOG_PRETTY = 'false';

// This service never signs, so a configured public key has no matching private key here.
// Minting throwaway pairs lets the specs stand in for be-identity-service and for an executor.
function pair(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

const user = pair();
const service = pair();

process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(user.publicKey).toString('base64');
process.env.SERVICE_JWT_PUBLIC_KEY_B64 = Buffer.from(service.publicKey).toString('base64');
// Read only by the specs; they are deliberately absent from the env schema.
process.env.E2E_JWT_PRIVATE_KEY_B64 = Buffer.from(user.privateKey).toString('base64');
process.env.E2E_SERVICE_JWT_PRIVATE_KEY_B64 = Buffer.from(service.privateKey).toString('base64');

process.env.NODE_ENV = 'test';
process.env.SWAGGER_ENABLED = 'false';
process.env.JWT_ISSUER ||= 'http://localhost:3001';
process.env.JWT_AUDIENCE ||= 'fs-platform';
process.env.SERVICE_JWT_AUDIENCE ||= 'fs-platform-internal';
process.env.SERVICE_JWT_ISSUERS ||= 'svc:be-project-service';
// Deliberately unroutable: the specs assert that a failed lookup degrades to null names.
process.env.IDENTITY_BASE_URL ||= 'http://127.0.0.1:1';
process.env.IDENTITY_TIMEOUT_MS ||= '250';

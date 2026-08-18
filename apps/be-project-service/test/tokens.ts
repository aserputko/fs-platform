import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';

const ISSUER = process.env.JWT_ISSUER ?? 'http://localhost:3001';
const AUDIENCE = process.env.JWT_AUDIENCE ?? 'fs-platform';

function pem(variable: string): string {
  const encoded = process.env[variable];

  if (!encoded) {
    throw new Error(`${variable} is not set; check test/setup-e2e.ts`);
  }

  return Buffer.from(encoded, 'base64').toString('utf8');
}

/** RFC 7638 JWK thumbprint, matching what KeyService derives for the configured public key. */
function kidOf(publicPem: string): string {
  const { n, e } = createPublicKey(publicPem).export({ format: 'jwk' });

  return createHash('sha256')
    .update(JSON.stringify({ e, kty: 'RSA', n }))
    .digest('base64url');
}

export interface TokenOverrides {
  issuer?: string;
  audience?: string;
  expiresIn?: number;
  privateKey?: string;
  kid?: string;
}

/** Mints the same shape of access token be-identity-service issues. */
export function signAccessToken(userId: string, overrides: TokenOverrides = {}): string {
  const privateKey = overrides.privateKey ?? pem('E2E_JWT_PRIVATE_KEY_B64');
  const kid = overrides.kid ?? kidOf(pem('JWT_PUBLIC_KEY_B64'));

  return sign({ email: `${userId}@example.com`, role: 'USER' }, privateKey, {
    algorithm: 'RS256',
    subject: userId,
    issuer: overrides.issuer ?? ISSUER,
    audience: overrides.audience ?? AUDIENCE,
    expiresIn: overrides.expiresIn ?? 900,
    keyid: kid,
  });
}

/** A valid RS256 token signed by a key this service does not trust. */
export function signWithForeignKey(userId: string): string {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return signAccessToken(userId, { privateKey, kid: kidOf(publicKey) });
}

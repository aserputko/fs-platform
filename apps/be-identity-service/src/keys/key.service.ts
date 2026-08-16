import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';

import type { Env } from '../config/env';

export interface Jwk {
  kty: 'RSA';
  use: 'sig';
  alg: 'RS256';
  kid: string;
  n: string;
  e: string;
}

export interface JwkSet {
  keys: Jwk[];
}

const MIN_RSA_MODULUS_BITS = 2048;

function decodePem(value: string, label: string): string {
  const pem = Buffer.from(value, 'base64').toString('utf8').trim();

  if (!pem.startsWith('-----BEGIN')) {
    throw new Error(`${label} must be a base64-encoded PEM block. Run \`npm run keys:generate\`.`);
  }

  return pem;
}

function assertRsaKey(key: KeyObject, label: string): void {
  if (key.asymmetricKeyType !== 'rsa') {
    throw new Error(
      `${label} must be an RSA key, received "${key.asymmetricKeyType ?? 'unknown'}"`,
    );
  }

  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < MIN_RSA_MODULUS_BITS) {
    throw new Error(`${label} must be at least ${MIN_RSA_MODULUS_BITS} bits, received ${bits}`);
  }
}

/** RFC 7638 JWK thumbprint: SHA-256 over the canonical JSON with lexicographically ordered members. */
function thumbprint(n: string, e: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ e, kty: 'RSA', n }))
    .digest('base64url');
}

function toJwk(publicKey: KeyObject, kidOverride?: string): Jwk {
  const { n, e } = publicKey.export({ format: 'jwk' });

  if (!n || !e) {
    throw new Error('Failed to export RSA public key as JWK');
  }

  return { kty: 'RSA', use: 'sig', alg: 'RS256', kid: kidOverride ?? thumbprint(n, e), n, e };
}

@Injectable()
export class KeyService {
  private readonly logger = new Logger(KeyService.name);

  private readonly signingKeyPem: string;
  private readonly signingKid: string;
  private readonly verificationKeys = new Map<string, string>();
  private readonly jwks: JwkSet;

  // Keys are loaded in the constructor, not onModuleInit, so that the JwtModule
  // async factory can read them while providers are still being instantiated.
  constructor(config: ConfigService<Env, true>) {
    this.signingKeyPem = decodePem(
      config.get('JWT_PRIVATE_KEY_B64', { infer: true }),
      'JWT_PRIVATE_KEY_B64',
    );
    const currentPublicPem = decodePem(
      config.get('JWT_PUBLIC_KEY_B64', { infer: true }),
      'JWT_PUBLIC_KEY_B64',
    );

    const privateKey = createPrivateKey(this.signingKeyPem);
    const currentPublicKey = createPublicKey(currentPublicPem);
    assertRsaKey(privateKey, 'JWT_PRIVATE_KEY_B64');
    assertRsaKey(currentPublicKey, 'JWT_PUBLIC_KEY_B64');

    const derivedJwk = toJwk(createPublicKey(privateKey));
    const currentJwk = toJwk(currentPublicKey, config.get('JWT_KEY_ID', { infer: true }));

    if (derivedJwk.n !== currentJwk.n) {
      throw new Error('JWT_PUBLIC_KEY_B64 does not match the key pair of JWT_PRIVATE_KEY_B64');
    }

    this.signingKid = currentJwk.kid;
    this.verificationKeys.set(currentJwk.kid, currentPublicPem);

    const keys: Jwk[] = [currentJwk];

    const previousEncoded = config.get('JWT_PREVIOUS_PUBLIC_KEY_B64', { infer: true });
    if (previousEncoded) {
      const previousPem = decodePem(previousEncoded, 'JWT_PREVIOUS_PUBLIC_KEY_B64');
      const previousKey = createPublicKey(previousPem);
      assertRsaKey(previousKey, 'JWT_PREVIOUS_PUBLIC_KEY_B64');

      const previousJwk = toJwk(previousKey);
      if (previousJwk.kid !== currentJwk.kid) {
        this.verificationKeys.set(previousJwk.kid, previousPem);
        keys.push(previousJwk);
      }
    }

    this.jwks = { keys };
    this.logger.log(`Loaded ${keys.length} RS256 key(s); signing kid=${this.signingKid}`);
  }

  getJwks(): JwkSet {
    return this.jwks;
  }

  getSigningKeyPem(): string {
    return this.signingKeyPem;
  }

  getSigningKid(): string {
    return this.signingKid;
  }

  /** Resolves the verification key for a token's `kid`, falling back to the active signing key. */
  getVerificationKeyPem(kid?: string): string | undefined {
    if (!kid) {
      return this.verificationKeys.get(this.signingKid);
    }

    return this.verificationKeys.get(kid);
  }
}

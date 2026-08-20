import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, type KeyObject } from 'node:crypto';

import type { Env } from '../config/env';

const MIN_RSA_MODULUS_BITS = 2048;

function decodePem(value: string, label: string): string {
  const pem = Buffer.from(value, 'base64').toString('utf8').trim();

  if (!pem.startsWith('-----BEGIN')) {
    throw new Error(
      `${label} must be a base64-encoded PEM block. Copy it from be-identity-service.`,
    );
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
function thumbprint(publicKey: KeyObject): string {
  const { n, e } = publicKey.export({ format: 'jwk' });

  if (!n || !e) {
    throw new Error('Failed to export RSA public key as JWK');
  }

  return createHash('sha256')
    .update(JSON.stringify({ e, kty: 'RSA', n }))
    .digest('base64url');
}

/**
 * Verification half of be-identity-service's KeyService: it resolves a token's `kid` to a public
 * PEM. This service never signs, so it holds no private key and publishes no JWKS.
 *
 * It holds two independent key sets. The user set verifies tokens minted by be-identity-service;
 * the service set verifies tokens minted by executor services. Keeping them separate is what stops
 * a leaked service key from being able to forge a user login.
 */
@Injectable()
export class KeyService {
  private readonly logger = new Logger(KeyService.name);

  private readonly currentKid: string;
  private readonly verificationKeys = new Map<string, string>();

  private readonly serviceKid: string;
  private readonly serviceVerificationKeys = new Map<string, string>();

  // Keys are loaded in the constructor, not onModuleInit, so that JwtStrategy can read
  // them while providers are still being instantiated.
  constructor(config: ConfigService<Env, true>) {
    const currentPem = decodePem(
      config.get('JWT_PUBLIC_KEY_B64', { infer: true }),
      'JWT_PUBLIC_KEY_B64',
    );
    const currentKey = createPublicKey(currentPem);
    assertRsaKey(currentKey, 'JWT_PUBLIC_KEY_B64');

    // A blank JWT_KEY_ID in a .env file must fall back to the thumbprint, not become the kid.
    const kidOverride = config.get('JWT_KEY_ID', { infer: true })?.trim();
    this.currentKid = kidOverride || thumbprint(currentKey);
    this.verificationKeys.set(this.currentKid, currentPem);

    const previousEncoded = config.get('JWT_PREVIOUS_PUBLIC_KEY_B64', { infer: true });
    if (previousEncoded) {
      const previousPem = decodePem(previousEncoded, 'JWT_PREVIOUS_PUBLIC_KEY_B64');
      const previousKey = createPublicKey(previousPem);
      assertRsaKey(previousKey, 'JWT_PREVIOUS_PUBLIC_KEY_B64');

      const previousKid = thumbprint(previousKey);
      if (previousKid !== this.currentKid) {
        this.verificationKeys.set(previousKid, previousPem);
      }
    }

    const servicePem = decodePem(
      config.get('SERVICE_JWT_PUBLIC_KEY_B64', { infer: true }),
      'SERVICE_JWT_PUBLIC_KEY_B64',
    );
    const serviceKey = createPublicKey(servicePem);
    assertRsaKey(serviceKey, 'SERVICE_JWT_PUBLIC_KEY_B64');

    this.serviceKid = thumbprint(serviceKey);
    this.serviceVerificationKeys.set(this.serviceKid, servicePem);

    if (this.verificationKeys.has(this.serviceKid)) {
      throw new Error(
        'SERVICE_JWT_PUBLIC_KEY_B64 must be a different key pair from JWT_PUBLIC_KEY_B64',
      );
    }

    this.logger.log(
      { keyCount: this.verificationKeys.size, currentKid: this.currentKid },
      'Loaded RS256 verification key(s)',
    );
  }

  /** Resolves the verification key for a token's `kid`, falling back to the current key. */
  getVerificationKeyPem(kid?: string): string | undefined {
    return this.verificationKeys.get(kid ?? this.currentKid);
  }

  /** Same lookup for service tokens, against the deliberately separate service key set. */
  getServiceVerificationKeyPem(kid?: string): string | undefined {
    return this.serviceVerificationKeys.get(kid ?? this.serviceKid);
  }
}

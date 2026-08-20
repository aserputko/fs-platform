import type { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';

import type { Env } from '../config/env';
import { KeyService } from './key.service';

function generatePublicPem(modulusLength = 2048): string {
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return publicKey;
}

function encode(pem: string): string {
  return Buffer.from(pem, 'utf8').toString('base64');
}

function expectedKid(pem: string): string {
  const { n, e } = createPublicKey(pem).export({ format: 'jwk' });

  return createHash('sha256')
    .update(JSON.stringify({ e, kty: 'RSA', n }))
    .digest('base64url');
}

function configOf(values: Partial<Env>): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
}

describe('KeyService', () => {
  const currentPem = generatePublicPem();
  const previousPem = generatePublicPem();
  const servicePem = generatePublicPem();

  // Every construction needs a service key, so the fixture supplies one unless overridden.
  function config(values: Partial<Env>): ConfigService<Env, true> {
    return configOf({ SERVICE_JWT_PUBLIC_KEY_B64: encode(servicePem), ...values });
  }

  it('derives the RFC 7638 thumbprint as the kid', () => {
    const service = new KeyService(config({ JWT_PUBLIC_KEY_B64: encode(currentPem) }));

    expect(service.getVerificationKeyPem(expectedKid(currentPem))).toBe(currentPem.trim());
  });

  it('falls back to the current key when the token carries no kid', () => {
    const service = new KeyService(config({ JWT_PUBLIC_KEY_B64: encode(currentPem) }));

    expect(service.getVerificationKeyPem()).toBe(currentPem.trim());
  });

  it('returns undefined for an unknown kid so the strategy can reject the token', () => {
    const service = new KeyService(config({ JWT_PUBLIC_KEY_B64: encode(currentPem) }));

    expect(service.getVerificationKeyPem('not-a-known-kid')).toBeUndefined();
  });

  it('honours a JWT_KEY_ID override', () => {
    const service = new KeyService(
      config({ JWT_PUBLIC_KEY_B64: encode(currentPem), JWT_KEY_ID: 'manual-kid' }),
    );

    expect(service.getVerificationKeyPem('manual-kid')).toBe(currentPem.trim());
    expect(service.getVerificationKeyPem(expectedKid(currentPem))).toBeUndefined();
  });

  it('ignores a blank JWT_KEY_ID left in a .env file', () => {
    const service = new KeyService(
      config({ JWT_PUBLIC_KEY_B64: encode(currentPem), JWT_KEY_ID: '  ' }),
    );

    expect(service.getVerificationKeyPem(expectedKid(currentPem))).toBe(currentPem.trim());
  });

  it('keeps the user and service key sets separate', () => {
    const service = new KeyService(config({ JWT_PUBLIC_KEY_B64: encode(currentPem) }));

    expect(service.getServiceVerificationKeyPem(expectedKid(servicePem))).toBe(servicePem.trim());
    // A service token must not be verifiable with a user key, and vice versa.
    expect(service.getVerificationKeyPem(expectedKid(servicePem))).toBeUndefined();
    expect(service.getServiceVerificationKeyPem(expectedKid(currentPem))).toBeUndefined();
  });

  it('refuses to start when the same pair is used for users and services', () => {
    expect(
      () =>
        new KeyService(
          configOf({
            JWT_PUBLIC_KEY_B64: encode(currentPem),
            SERVICE_JWT_PUBLIC_KEY_B64: encode(currentPem),
          }),
        ),
    ).toThrow(/different key pair/);
  });

  it('keeps accepting the previous key during a rotation', () => {
    const service = new KeyService(
      config({
        JWT_PUBLIC_KEY_B64: encode(currentPem),
        JWT_PREVIOUS_PUBLIC_KEY_B64: encode(previousPem),
      }),
    );

    expect(service.getVerificationKeyPem(expectedKid(currentPem))).toBe(currentPem.trim());
    expect(service.getVerificationKeyPem(expectedKid(previousPem))).toBe(previousPem.trim());
  });

  it('rejects a value that is not a base64-encoded PEM', () => {
    expect(() => new KeyService(configOf({ JWT_PUBLIC_KEY_B64: 'not-base64-pem' }))).toThrow(
      /base64-encoded PEM/,
    );
  });

  it('rejects an RSA key below the minimum modulus length', () => {
    const weakPem = generatePublicPem(1024);

    expect(() => new KeyService(configOf({ JWT_PUBLIC_KEY_B64: encode(weakPem) }))).toThrow(
      /at least 2048 bits/,
    );
  });
});

import type { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';

import type { Env } from '../config/env';
import { KeyService } from './key.service';

function generatePairB64(modulusLength = 2048) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    privateB64: Buffer.from(privateKey).toString('base64'),
    publicB64: Buffer.from(publicKey).toString('base64'),
  };
}

function configFor(values: Record<string, string | undefined>): ConfigService<Env, true> {
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

describe('KeyService', () => {
  let pair: ReturnType<typeof generatePairB64>;
  let otherPair: ReturnType<typeof generatePairB64>;

  beforeAll(() => {
    pair = generatePairB64();
    otherPair = generatePairB64();
  });

  it('publishes a single RS256 signing key', () => {
    const service = new KeyService(
      configFor({ JWT_PRIVATE_KEY_B64: pair.privateB64, JWT_PUBLIC_KEY_B64: pair.publicB64 }),
    );

    const { keys } = service.getJwks();

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256', e: 'AQAB' });
    expect(keys[0].n).toEqual(expect.any(String));
    expect(keys[0].kid).toBe(service.getSigningKid());
  });

  it('derives a stable kid that differs between key pairs', () => {
    const first = new KeyService(
      configFor({ JWT_PRIVATE_KEY_B64: pair.privateB64, JWT_PUBLIC_KEY_B64: pair.publicB64 }),
    );
    const sameKey = new KeyService(
      configFor({ JWT_PRIVATE_KEY_B64: pair.privateB64, JWT_PUBLIC_KEY_B64: pair.publicB64 }),
    );
    const different = new KeyService(
      configFor({
        JWT_PRIVATE_KEY_B64: otherPair.privateB64,
        JWT_PUBLIC_KEY_B64: otherPair.publicB64,
      }),
    );

    expect(sameKey.getSigningKid()).toBe(first.getSigningKid());
    expect(different.getSigningKid()).not.toBe(first.getSigningKid());
  });

  it('honours an explicit JWT_KEY_ID override', () => {
    const service = new KeyService(
      configFor({
        JWT_PRIVATE_KEY_B64: pair.privateB64,
        JWT_PUBLIC_KEY_B64: pair.publicB64,
        JWT_KEY_ID: 'manual-kid',
      }),
    );

    expect(service.getSigningKid()).toBe('manual-kid');
  });

  it('rejects a public key that does not belong to the private key', () => {
    expect(
      () =>
        new KeyService(
          configFor({
            JWT_PRIVATE_KEY_B64: pair.privateB64,
            JWT_PUBLIC_KEY_B64: otherPair.publicB64,
          }),
        ),
    ).toThrow(/does not match the key pair/);
  });

  it('rejects keys weaker than 2048 bits', () => {
    const weak = generatePairB64(1024);

    expect(
      () =>
        new KeyService(
          configFor({ JWT_PRIVATE_KEY_B64: weak.privateB64, JWT_PUBLIC_KEY_B64: weak.publicB64 }),
        ),
    ).toThrow(/at least 2048 bits/);
  });

  it('rejects values that are not base64-encoded PEM', () => {
    expect(
      () =>
        new KeyService(
          configFor({
            JWT_PRIVATE_KEY_B64: Buffer.from('not a key').toString('base64'),
            JWT_PUBLIC_KEY_B64: pair.publicB64,
          }),
        ),
    ).toThrow(/base64-encoded PEM/);
  });

  it('advertises the previous public key during a rotation', () => {
    const service = new KeyService(
      configFor({
        JWT_PRIVATE_KEY_B64: pair.privateB64,
        JWT_PUBLIC_KEY_B64: pair.publicB64,
        JWT_PREVIOUS_PUBLIC_KEY_B64: otherPair.publicB64,
      }),
    );

    const { keys } = service.getJwks();
    const previousKid = keys.find((key) => key.kid !== service.getSigningKid())?.kid;

    expect(keys).toHaveLength(2);
    expect(previousKid).toBeDefined();
    expect(service.getVerificationKeyPem(previousKid)).toContain('BEGIN PUBLIC KEY');
  });

  it('resolves the signing key when no kid is supplied and nothing for an unknown kid', () => {
    const service = new KeyService(
      configFor({ JWT_PRIVATE_KEY_B64: pair.privateB64, JWT_PUBLIC_KEY_B64: pair.publicB64 }),
    );

    expect(service.getVerificationKeyPem()).toContain('BEGIN PUBLIC KEY');
    expect(service.getVerificationKeyPem('nope')).toBeUndefined();
  });
});

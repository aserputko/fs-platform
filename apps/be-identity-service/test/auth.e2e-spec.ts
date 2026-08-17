import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface JwtHeader {
  alg: string;
  kid: string;
}

function decodeHeader(jwt: string): JwtHeader {
  return JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString('utf8')) as JwtHeader;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof app.getHttpServer>;

  const email = `e2e-${randomBytes(6).toString('hex')}@example.com`;
  const password = 'correct horse battery staple';

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('registers a new account and returns a token pair', async () => {
    const response = await request(http)
      .post('/auth/register')
      .send({ email, password, displayName: 'E2E User' })
      .expect(201);

    expect(response.body).toMatchObject({ tokenType: 'Bearer' });
    expect(response.body.expiresIn).toBeGreaterThan(0);

    accessToken = response.body.accessToken;
    refreshToken = response.body.refreshToken;
  });

  it('rejects a duplicate registration', async () => {
    await request(http).post('/auth/register').send({ email, password }).expect(409);
  });

  it('rejects unknown properties in the payload', async () => {
    await request(http)
      .post('/auth/register')
      .send({ email: 'other@example.com', password, isAdmin: true })
      .expect(400);
  });

  it('signs access tokens with RS256 using a kid published in the JWKS', async () => {
    const { body } = await request(http).get('/.well-known/jwks.json').expect(200);

    const header = decodeHeader(accessToken);

    expect(header.alg).toBe('RS256');
    expect(body.keys.map((key: { kid: string }) => key.kid)).toContain(header.kid);
    expect(body.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' });
    expect(body.keys[0]).not.toHaveProperty('d');
  });

  it('logs in with the registered credentials', async () => {
    const { body } = await request(http).post('/auth/login').send({ email, password }).expect(200);

    expect(body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password', async () => {
    await request(http).post('/auth/login').send({ email, password: 'wrong-password' }).expect(401);
  });

  it('rotates the refresh token', async () => {
    const { body } = await request(http).post('/auth/refresh').send({ refreshToken }).expect(200);

    expect(body.refreshToken).not.toBe(refreshToken);

    const previousToken = refreshToken;
    refreshToken = body.refreshToken;

    // Replaying the consumed token must fail and burn the whole chain.
    await request(http).post('/auth/refresh').send({ refreshToken: previousToken }).expect(401);
    await request(http).post('/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('exposes health endpoints without authentication', async () => {
    await request(http).get('/health').expect(200, { status: 'ok' });
    await request(http).get('/health/ready').expect(200, { status: 'ok', database: 'up' });
  });
});

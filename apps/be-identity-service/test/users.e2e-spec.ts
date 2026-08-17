import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof app.getHttpServer>;

  const email = `e2e-${randomBytes(6).toString('hex')}@example.com`;
  const password = 'correct horse battery staple';

  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    http = app.getHttpServer();

    const { body } = await request(http)
      .post('/auth/register')
      .send({ email, password, displayName: 'E2E User' })
      .expect(201);

    accessToken = body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('refuses /users/me without a bearer token', async () => {
    await request(http).get('/users/me').expect(401);
  });

  it('refuses /users/me with a malformed bearer token', async () => {
    await request(http).get('/users/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('returns the profile for a valid bearer token', async () => {
    const { body } = await request(http)
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(body).toMatchObject({ email, displayName: 'E2E User', role: 'USER' });
    expect(body.id).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('isActive');
  });
});

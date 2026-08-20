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
  const otherEmail = `e2e-${randomBytes(6).toString('hex')}@example.com`;
  const password = 'correct horse battery staple';

  let accessToken: string;
  let userId: string;
  let otherUserId: string;

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

    await request(http)
      .post('/auth/register')
      .send({ email: otherEmail, password, displayName: 'Other User' })
      .expect(201);

    const me = await request(http)
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    userId = me.body.id;

    const other = await prisma.user.findUniqueOrThrow({ where: { email: otherEmail } });
    otherUserId = other.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
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

  describe('GET /users?ids=', () => {
    it('refuses an unauthenticated caller', async () => {
      await request(http).get(`/users?ids=${userId}`).expect(401);
    });

    it('resolves several ids to display names only', async () => {
      const { body } = await request(http)
        .get(`/users?ids=${userId},${otherUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(body).toHaveLength(2);
      expect(body).toEqual(
        expect.arrayContaining([
          { id: userId, displayName: 'E2E User' },
          { id: otherUserId, displayName: 'Other User' },
        ]),
      );
      // A bulk endpoint must not become an email harvester.
      expect(body[0]).not.toHaveProperty('email');
      expect(body[0]).not.toHaveProperty('role');
    });

    it('omits ids that do not exist rather than failing', async () => {
      const { body } = await request(http)
        .get(`/users?ids=${userId},018f2c9a-0000-7000-8000-0000000000ff`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(body).toEqual([{ id: userId, displayName: 'E2E User' }]);
    });

    it.each([
      ['no ids', ''],
      ['a non-uuid id', 'not-a-uuid'],
      ['more than 100 ids', Array.from({ length: 101 }, () => userId).join(',')],
    ])('rejects %s', async (_label, ids) => {
      await request(http)
        .get(`/users?ids=${ids}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });
});

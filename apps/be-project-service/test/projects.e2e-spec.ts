import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { signAccessToken, signWithForeignKey } from './tokens';

describe('Projects (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const userId = randomUUID();
  const otherUserId = randomUUID();
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    // main.ts never runs in e2e, so the global pipe has to be re-applied here.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    // Bind once: otherwise supertest opens an ephemeral listener per request and eventually times out.
    await app.listen(0);

    prisma = app.get(PrismaService);
    server = app.getHttpServer();

    token = signAccessToken(userId);
    otherToken = signAccessToken(otherUserId);
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await app.close();
  });

  async function createProject(title = 'Apollo', description?: string): Promise<string> {
    const { body } = await request(server)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ title, ...(description === undefined ? {} : { description }) })
      .expect(201);

    return body.id as string;
  }

  describe('authentication', () => {
    it('rejects a request with no token', async () => {
      await request(server).get('/projects').expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(server).get('/projects').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });

    it('rejects a token from another issuer', async () => {
      const foreign = signAccessToken(userId, { issuer: 'https://evil.example.com' });

      await request(server).get('/projects').set('Authorization', `Bearer ${foreign}`).expect(401);
    });

    it('rejects a token for another audience', async () => {
      const foreign = signAccessToken(userId, { audience: 'some-other-api' });

      await request(server).get('/projects').set('Authorization', `Bearer ${foreign}`).expect(401);
    });

    it('rejects a token signed with an untrusted key', async () => {
      await request(server)
        .get('/projects')
        .set('Authorization', `Bearer ${signWithForeignKey(userId)}`)
        .expect(401);
    });

    it('rejects an expired token', async () => {
      const expired = signAccessToken(userId, { expiresIn: -60 });

      await request(server).get('/projects').set('Authorization', `Bearer ${expired}`).expect(401);
    });
  });

  describe('CRUD', () => {
    it('creates a project owned by the token subject', async () => {
      const { body } = await request(server)
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '  Apollo  ', description: '  Moon landing  ' })
        .expect(201);

      expect(body).toMatchObject({
        userId,
        title: 'Apollo',
        description: 'Moon landing',
      });
      expect(body.id).toEqual(expect.any(String));
      expect(body).not.toHaveProperty('deletedAt');
    });

    it('ignores a userId supplied in the body', async () => {
      await request(server)
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Spoofed', userId: otherUserId })
        .expect(400);
    });

    it('reads a project back', async () => {
      const id = await createProject('Gemini');

      const { body } = await request(server)
        .get(`/projects/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(body).toMatchObject({ id, userId, title: 'Gemini', description: null });
    });

    it('updates a single field and leaves the rest untouched', async () => {
      const id = await createProject('Mercury', 'First crewed programme');

      const { body } = await request(server)
        .patch(`/projects/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Mercury Redstone' })
        .expect(200);

      expect(body).toMatchObject({
        title: 'Mercury Redstone',
        description: 'First crewed programme',
      });
    });

    it('clears the description when passed null', async () => {
      const id = await createProject('Skylab', 'Space station');

      const { body } = await request(server)
        .patch(`/projects/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: null })
        .expect(200);

      expect(body.description).toBeNull();
    });

    it('soft-deletes a project and then hides it', async () => {
      const id = await createProject('Voyager');

      await request(server)
        .delete(`/projects/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(server)
        .get(`/projects/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      const record = await prisma.project.findUnique({ where: { id } });
      expect(record?.deletedAt).toBeInstanceOf(Date);
    });

    it('refuses to delete the same project twice', async () => {
      const id = await createProject('Cassini');

      await request(server)
        .delete(`/projects/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
      await request(server)
        .delete(`/projects/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('ownership', () => {
    let foreignProjectId: string;

    beforeAll(async () => {
      foreignProjectId = await createProject('Private');
    });

    it('hides another user\u2019s project from reads', async () => {
      await request(server)
        .get(`/projects/${foreignProjectId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('hides another user\u2019s project from updates', async () => {
      await request(server)
        .patch(`/projects/${foreignProjectId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Hijacked' })
        .expect(404);
    });

    it('hides another user\u2019s project from deletes', async () => {
      await request(server)
        .delete(`/projects/${foreignProjectId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('excludes another user\u2019s projects from the list', async () => {
      const { body } = await request(server)
        .get('/projects')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('validation', () => {
    it('rejects a missing title', async () => {
      await request(server)
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'No title' })
        .expect(400);
    });

    it('rejects a title over 256 characters', async () => {
      await request(server)
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'a'.repeat(257) })
        .expect(400);
    });

    it('rejects a description over 1024 characters', async () => {
      await request(server)
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Apollo', description: 'a'.repeat(1025) })
        .expect(400);
    });

    it('rejects an unknown field', async () => {
      await request(server)
        .post('/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Apollo', status: 'ACTIVE' })
        .expect(400);
    });

    it('rejects an empty patch', async () => {
      const id = await createProject('Juno');

      await request(server)
        .patch(`/projects/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('rejects a non-uuid id', async () => {
      await request(server)
        .get('/projects/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('pagination and search', () => {
    const pagedUserId = randomUUID();
    let pagedToken: string;

    beforeAll(async () => {
      pagedToken = signAccessToken(pagedUserId);

      for (let index = 0; index < 5; index += 1) {
        await request(server)
          .post('/projects')
          .set('Authorization', `Bearer ${pagedToken}`)
          .send({ title: `Probe ${index}` })
          .expect(201);
      }
    });

    afterAll(async () => {
      await prisma.project.deleteMany({ where: { userId: pagedUserId } });
    });

    it('defaults to page 1 with a limit of 20', async () => {
      const { body } = await request(server)
        .get('/projects')
        .set('Authorization', `Bearer ${pagedToken}`)
        .expect(200);

      expect(body).toMatchObject({ total: 5, page: 1, limit: 20 });
      expect(body.data).toHaveLength(5);
    });

    it('returns the requested slice while reporting the full total', async () => {
      const { body } = await request(server)
        .get('/projects?page=2&limit=2')
        .set('Authorization', `Bearer ${pagedToken}`)
        .expect(200);

      expect(body).toMatchObject({ total: 5, page: 2, limit: 2 });
      expect(body.data).toHaveLength(2);
    });

    it('filters by title, case-insensitively', async () => {
      const { body } = await request(server)
        .get('/projects?search=probe 3')
        .set('Authorization', `Bearer ${pagedToken}`)
        .expect(200);

      expect(body.total).toBe(1);
      expect(body.data[0].title).toBe('Probe 3');
    });

    it('rejects a limit above the maximum', async () => {
      await request(server)
        .get('/projects?limit=101')
        .set('Authorization', `Bearer ${pagedToken}`)
        .expect(400);
    });

    it('rejects a page below 1', async () => {
      await request(server)
        .get('/projects?page=0')
        .set('Authorization', `Bearer ${pagedToken}`)
        .expect(400);
    });
  });
});

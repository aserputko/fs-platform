import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    // Bind once: otherwise supertest opens an ephemeral listener per request and eventually times out.
    await app.listen(0);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness without a token', async () => {
    const { body } = await request(server).get('/health').expect(200);

    expect(body).toEqual({ status: 'ok' });
  });

  it('serves readiness without a token', async () => {
    const { body } = await request(server).get('/health/ready').expect(200);

    expect(body).toEqual({ status: 'ok', database: 'up' });
  });
});

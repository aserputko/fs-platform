import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

const UUID = /^[0-9a-f-]{36}$/;

describe('Logging (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof app.getHttpServer>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a consistent error body carrying the generated request id', async () => {
    const response = await request(http).get('/users/me').expect(401);

    expect(response.headers['x-request-id']).toMatch(UUID);
    expect(response.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Unauthorized',
      requestId: response.headers['x-request-id'],
      path: '/users/me',
    });
    expect(Date.parse(response.body.timestamp)).not.toBeNaN();
  });

  it('adopts a caller-supplied request id', async () => {
    const response = await request(http)
      .get('/users/me')
      .set('x-request-id', 'trace-abc-123')
      .expect(401);

    expect(response.headers['x-request-id']).toBe('trace-abc-123');
    expect(response.body.requestId).toBe('trace-abc-123');
  });

  it('replaces a request id that could forge log fields', async () => {
    const response = await request(http)
      .get('/users/me')
      .set('x-request-id', 'not a safe id')
      .expect(401);

    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('reports validation failures as a list of messages', async () => {
    const response = await request(http)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(response.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    expect(Array.isArray(response.body.message)).toBe(true);
  });
});

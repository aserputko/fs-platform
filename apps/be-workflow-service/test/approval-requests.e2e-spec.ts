import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  signAccessToken,
  signServiceToken,
  signServiceTokenWithForeignKey,
  signWithForeignKey,
} from './tokens';

describe('Approval requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const requestor = randomUUID();
  const approverA = randomUUID();
  const approverB = randomUUID();
  const secondStepApprover = randomUUID();
  const stranger = randomUUID();
  const userIds = [requestor, approverA, approverB, secondStepApprover, stranger];

  let requestorToken: string;
  let approverAToken: string;
  let approverBToken: string;
  let secondStepToken: string;
  let strangerToken: string;
  let serviceToken: string;

  const basePayload = {
    definitionKey: 'generic-approval',
    subject: 'Budget increase',
    description: 'Please approve the revised budget',
  };

  async function createRequest(
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('authorization', `Bearer ${token}`)
      .send({
        ...basePayload,
        approvers: [{ stepIndex: 1, approverUserIds: [approverA, approverB] }],
        ...overrides,
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    // main.ts never runs in e2e, so the global pipe has to be re-applied here.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    // Bind once, or supertest opens an ephemeral listener per request and times out.
    await app.listen(0);

    prisma = app.get(PrismaService);

    requestorToken = signAccessToken(requestor);
    approverAToken = signAccessToken(approverA);
    approverBToken = signAccessToken(approverB);
    secondStepToken = signAccessToken(secondStepApprover);
    strangerToken = signAccessToken(stranger);
    serviceToken = signServiceToken();
  });

  afterAll(async () => {
    await prisma.approvalRequest.deleteMany({ where: { requestorUserId: { in: userIds } } });
    await app.close();
  });

  describe('authentication', () => {
    it.each([
      ['no token', undefined],
      ['a malformed token', 'not-a-jwt'],
      ['a token from an untrusted key', signWithForeignKey(requestor)],
      ['an expired token', signAccessToken(requestor, { expiresIn: -10 })],
      ['a token with the wrong issuer', signAccessToken(requestor, { issuer: 'https://evil' })],
      ['a token with the wrong audience', signAccessToken(requestor, { audience: 'other' })],
    ])('rejects %s', async (_label, token) => {
      const call = request(app.getHttpServer()).get('/approval-requests/inbox');
      if (token) {
        call.set('authorization', `Bearer ${token}`);
      }

      await call.expect(401);
    });
  });

  describe('creation', () => {
    it('starts on the first approver step with the requestor step already complete', async () => {
      const id = await createRequest(requestorToken);

      const response = await request(app.getHttpServer())
        .get(`/approval-requests/${id}`)
        .set('authorization', `Bearer ${requestorToken}`)
        .expect(200);

      const body = response.body as {
        status: string;
        currentStepIndex: number;
        chain: { index: number; status: string; approvers: unknown[] }[];
        history: { eventType: string; actorRole: string }[];
        availableActions: string[];
      };

      expect(body.status).toBe('PENDING');
      expect(body.currentStepIndex).toBe(1);
      expect(body.chain).toHaveLength(2);
      expect(body.chain[0]).toMatchObject({ index: 0, status: 'COMPLETED' });
      expect(body.chain[1]).toMatchObject({ index: 1, status: 'PENDING' });
      expect(body.chain[1]?.approvers).toHaveLength(2);
      expect(body.history).toEqual([
        expect.objectContaining({ eventType: 'SUBMIT', actorRole: 'REQUESTOR' }),
      ]);
      expect(body.availableActions).toEqual(['CANCEL']);
    });

    it('rejects an unknown definition', async () => {
      await request(app.getHttpServer())
        .post('/approval-requests')
        .set('authorization', `Bearer ${requestorToken}`)
        .send({
          ...basePayload,
          definitionKey: 'does-not-exist',
          approvers: [{ stepIndex: 1, approverUserIds: [approverA] }],
        })
        .expect(404);
    });

    it('rejects a step left without approvers', async () => {
      await request(app.getHttpServer())
        .post('/approval-requests')
        .set('authorization', `Bearer ${requestorToken}`)
        .send({
          ...basePayload,
          definitionKey: 'two-stage-approval',
          approvers: [{ stepIndex: 1, approverUserIds: [approverA] }],
        })
        .expect(400);
    });

    it('rejects an unknown field', async () => {
      await request(app.getHttpServer())
        .post('/approval-requests')
        .set('authorization', `Bearer ${requestorToken}`)
        .send({
          ...basePayload,
          approvers: [{ stepIndex: 1, approverUserIds: [approverA] }],
          hacked: true,
        })
        .expect(400);
    });
  });

  describe('reading', () => {
    it('hides a request from anyone outside its chain', async () => {
      const id = await createRequest(requestorToken);

      await request(app.getHttpServer())
        .get(`/approval-requests/${id}`)
        .set('authorization', `Bearer ${strangerToken}`)
        .expect(404);
    });

    it('lists the request in the approver inbox and the requestor outbox', async () => {
      const id = await createRequest(requestorToken);

      const inbox = await request(app.getHttpServer())
        .get('/approval-requests/inbox')
        .set('authorization', `Bearer ${approverAToken}`)
        .expect(200);
      const outbox = await request(app.getHttpServer())
        .get('/approval-requests/outbox')
        .set('authorization', `Bearer ${requestorToken}`)
        .expect(200);

      expect((inbox.body as { data: { id: string }[] }).data.map((r) => r.id)).toContain(id);
      expect((outbox.body as { data: { id: string }[] }).data.map((r) => r.id)).toContain(id);
    });

    it('degrades to null display names when identity cannot be reached', async () => {
      const id = await createRequest(requestorToken);

      const response = await request(app.getHttpServer())
        .get(`/approval-requests/${id}`)
        .set('authorization', `Bearer ${requestorToken}`)
        .expect(200);

      expect((response.body as { requestorDisplayName: unknown }).requestorDisplayName).toBeNull();
    });

    it('caps the page size', async () => {
      await request(app.getHttpServer())
        .get('/approval-requests/inbox?limit=101')
        .set('authorization', `Bearer ${approverAToken}`)
        .expect(400);
    });
  });

  describe('actions', () => {
    it('approves on the final step and closes the request', async () => {
      const id = await createRequest(requestorToken);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${approverAToken}`)
        .send({ actionType: 'APPROVE' })
        .expect(204);

      const response = await request(app.getHttpServer())
        .get(`/approval-requests/${id}`)
        .set('authorization', `Bearer ${requestorToken}`)
        .expect(200);

      const body = response.body as {
        status: string;
        closedAt: string | null;
        chain: { approvers: { approverUserId: string; status: string }[] }[];
        availableActions: string[];
      };

      expect(body.status).toBe('APPROVED');
      expect(body.closedAt).not.toBeNull();
      expect(body.availableActions).toEqual([]);

      const approvers = body.chain[1]?.approvers ?? [];
      expect(approvers.find((a) => a.approverUserId === approverA)?.status).toBe('COMPLETED');
      // Any-one-wins: the sibling is skipped, not left pending.
      expect(approvers.find((a) => a.approverUserId === approverB)?.status).toBe('SKIPPED');
    });

    it('locks out every other participant once it is closed', async () => {
      const id = await createRequest(requestorToken);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${approverAToken}`)
        .send({ actionType: 'APPROVE' })
        .expect(204);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${approverBToken}`)
        .send({ actionType: 'APPROVE' })
        .expect(409);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${requestorToken}`)
        .send({ actionType: 'CANCEL' })
        .expect(409);
    });

    it('advances through a multi-step chain and only closes on the last step', async () => {
      const id = await createRequest(requestorToken, {
        definitionKey: 'two-stage-approval',
        approvers: [
          { stepIndex: 1, approverUserIds: [approverA] },
          { stepIndex: 2, approverUserIds: [secondStepApprover] },
        ],
      });

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${approverAToken}`)
        .send({ actionType: 'APPROVE' })
        .expect(204);

      const midway = await request(app.getHttpServer())
        .get(`/approval-requests/${id}`)
        .set('authorization', `Bearer ${requestorToken}`)
        .expect(200);

      const midwayBody = midway.body as {
        status: string;
        currentStepIndex: number;
        history: { eventType: string }[];
      };
      expect(midwayBody.status).toBe('PENDING');
      expect(midwayBody.currentStepIndex).toBe(2);
      expect(midwayBody.history.map((entry) => entry.eventType)).toEqual([
        'SUBMIT',
        'APPROVE',
        'STEP_ADVANCED',
      ]);

      // The requestor's cancel window closed when the chain moved past step 1.
      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${requestorToken}`)
        .send({ actionType: 'CANCEL' })
        .expect(409);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${secondStepToken}`)
        .send({ actionType: 'APPROVE' })
        .expect(204);

      const final = await request(app.getHttpServer())
        .get(`/approval-requests/${id}`)
        .set('authorization', `Bearer ${requestorToken}`)
        .expect(200);

      expect((final.body as { status: string }).status).toBe('APPROVED');
    });

    it('terminates the whole chain on a mid-chain rejection', async () => {
      const id = await createRequest(requestorToken, {
        definitionKey: 'two-stage-approval',
        approvers: [
          { stepIndex: 1, approverUserIds: [approverA] },
          { stepIndex: 2, approverUserIds: [secondStepApprover] },
        ],
      });

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${approverAToken}`)
        .send({ actionType: 'REJECT', comment: 'Numbers do not add up' })
        .expect(204);

      const response = await request(app.getHttpServer())
        .get(`/approval-requests/${id}`)
        .set('authorization', `Bearer ${requestorToken}`)
        .expect(200);

      const body = response.body as {
        status: string;
        chain: { index: number; status: string }[];
        history: { eventType: string; comment: string | null }[];
      };

      expect(body.status).toBe('REJECTED');
      expect(body.chain[2]?.status).toBe('CANCELLED');
      expect(body.history.at(-1)).toMatchObject({
        eventType: 'REJECT',
        comment: 'Numbers do not add up',
      });
    });

    it('requires a comment on reject', async () => {
      const id = await createRequest(requestorToken);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${approverAToken}`)
        .send({ actionType: 'REJECT' })
        .expect(400);
    });

    it('lets the requestor cancel before anyone acts', async () => {
      const id = await createRequest(requestorToken);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${requestorToken}`)
        .send({ actionType: 'CANCEL' })
        .expect(204);

      const response = await request(app.getHttpServer())
        .get(`/approval-requests/${id}`)
        .set('authorization', `Bearer ${approverAToken}`)
        .expect(200);

      const body = response.body as {
        status: string;
        chain: { approvers: { status: string }[] }[];
      };
      expect(body.status).toBe('CANCELLED');
      expect(body.chain[1]?.approvers.every((task) => task.status === 'CANCELLED')).toBe(true);
    });

    it('refuses an approver trying to cancel', async () => {
      const id = await createRequest(requestorToken);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${approverAToken}`)
        .send({ actionType: 'CANCEL' })
        .expect(409);
    });

    it('hides the action endpoint from anyone outside the chain', async () => {
      const id = await createRequest(requestorToken);

      await request(app.getHttpServer())
        .post(`/approval-requests/${id}/actions`)
        .set('authorization', `Bearer ${strangerToken}`)
        .send({ actionType: 'APPROVE' })
        .expect(404);
    });

    it('lets exactly one of two simultaneous approvals win', async () => {
      const id = await createRequest(requestorToken);

      const results = await Promise.all(
        [approverAToken, approverBToken].map((token) =>
          request(app.getHttpServer())
            .post(`/approval-requests/${id}/actions`)
            .set('authorization', `Bearer ${token}`)
            .send({ actionType: 'APPROVE' }),
        ),
      );

      const statuses = results.map((result) => result.status).sort();
      expect(statuses).toEqual([204, 409]);
    });
  });

  describe('internal surface', () => {
    it('creates a request from a service token on behalf of a user', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/approval-requests')
        .set('authorization', `Bearer ${serviceToken}`)
        .send({
          ...basePayload,
          requestorUserId: requestor,
          approvers: [{ stepIndex: 1, approverUserIds: [approverA] }],
          sourceType: 'project',
          sourceId: 'project-42',
        })
        .expect(201);

      const { id } = response.body as { id: string };

      const bySource = await request(app.getHttpServer())
        .get('/approval-requests/by-source?sourceType=project&sourceId=project-42')
        .set('authorization', `Bearer ${requestorToken}`)
        .expect(200);

      expect((bySource.body as { id: string }[]).map((r) => r.id)).toContain(id);
    });

    it.each([
      ['a user token', () => signAccessToken(requestor)],
      ['an untrusted service key', () => signServiceTokenWithForeignKey()],
      ['a service token with the wrong audience', () => signServiceToken({ audience: 'other' })],
      ['a service token from an unknown issuer', () => signServiceToken({ issuer: 'svc:evil' })],
    ])('rejects %s on the internal surface', async (_label, mint) => {
      await request(app.getHttpServer())
        .post('/internal/approval-requests')
        .set('authorization', `Bearer ${mint()}`)
        .send({
          ...basePayload,
          requestorUserId: requestor,
          approvers: [{ stepIndex: 1, approverUserIds: [approverA] }],
        })
        .expect(401);
    });

    it('refuses a service token on the user surface', async () => {
      await request(app.getHttpServer())
        .get('/approval-requests/inbox')
        .set('authorization', `Bearer ${serviceToken}`)
        .expect(401);
    });
  });
});

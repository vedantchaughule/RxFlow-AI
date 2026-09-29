import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
describe('Jarvis service health', () => {
  it('returns liveness without a provider call', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
  it('rejects messages without a Jarvis session', async () => {
    const response = await request(createApp()).post('/v1/messages').send({ sessionId: crypto.randomUUID(), message: 'Queue count', clientTurnId: crypto.randomUUID() });
    expect(response.status).toBe(401);
  });
});

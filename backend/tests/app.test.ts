import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, HTTP_LOG_REDACT_PATHS } from '../src/app.js';

const app = createApp();

describe('platform endpoints', () => {
  it('redacts URLs, query data, route identifiers, headers, and network identifiers from HTTP logs', () => {
    expect(HTTP_LOG_REDACT_PATHS).toEqual(expect.arrayContaining([
      'req.url',
      'req.query',
      'req.params',
      'req.headers',
      'req.remoteAddress',
      'req.remotePort',
    ]));
  });

  it('returns liveness without authentication', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('rejects malformed signup input before any provider call', async () => {
    const response = await request(app).post('/api/v1/auth/clinic-signup').send({ clinicName: 'A', email: 'bad', password: 'short' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not expose a refresh cookie when no refresh token exists', async () => {
    const response = await request(app).post('/api/v1/auth/refresh');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });
});

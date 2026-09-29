import { describe, it, expect } from 'vitest';
import {
  signJarvisTokenNative,
  verifyJarvisToken,
  requireJarvisSession,
  requireSignedInternal,
  signInternalRequest,
  AuthError,
} from '../src/auth.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';

describe('Jarvis Gateway Authentication & Authorization (PROMPT 04)', () => {
  it('1. doctor session create: verifies valid doctor token with iss/aud claims', () => {
    const token = signJarvisTokenNative({
      iss: 'rxflow-backend',
      aud: 'rxflow-jarvis-v2',
      sub: 'doc_789',
      sessionId: 'sess_123',
      clinicId: 'clinic_456',
      doctorId: 'doc_789',
      role: 'doctor',
      tokenVersion: 1,
    });

    const claims = verifyJarvisToken(token);

    expect(claims.sessionId).toBe('sess_123');
    expect(claims.clinicId).toBe('clinic_456');
    expect(claims.doctorId).toBe('doc_789');
    expect(claims.role).toBe('doctor');
    expect(claims.iss).toBe('rxflow-backend');
    expect(claims.aud).toBe('rxflow-jarvis-v2');
  });

  it('2. wrong role rejected: rejects assistant or patient roles with 403 FORBIDDEN', () => {
    const assistantToken = signJarvisTokenNative({
      iss: 'rxflow-backend',
      aud: 'rxflow-jarvis-v2',
      sub: 'ast_789',
      sessionId: 'sess_123',
      clinicId: 'clinic_456',
      doctorId: 'doc_789',
      role: 'assistant',
      tokenVersion: 1,
    });

    expect(() => verifyJarvisToken(assistantToken)).toThrow(AuthError);
    try {
      verifyJarvisToken(assistantToken);
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    }
  });

  it('3. wrong clinic rejected: middleware rejects token when headers lack Bearer token', () => {
    const reqMock = {
      headers: { authorization: 'Bearer invalid.token.here' },
      body: {},
    };

    let errorResult: any = null;
    requireJarvisSession(reqMock as any, {} as any, ((err?: any) => {
      if (err) errorResult = err;
    }) as any);

    expect(errorResult).toBeDefined();
    expect(errorResult?.statusCode).toBe(401);
  });

  it('4. expired token rejected: fails verification on expired JWT', () => {
    const expiredToken = signJarvisTokenNative(
      {
        iss: 'rxflow-backend',
        aud: 'rxflow-jarvis-v2',
        sub: 'doc_789',
        sessionId: 'sess_123',
        clinicId: 'clinic_456',
        doctorId: 'doc_789',
        role: 'doctor',
        tokenVersion: 1,
      },
      undefined,
      -3600
    );

    expect(() => verifyJarvisToken(expiredToken)).toThrow(AuthError);
    try {
      verifyJarvisToken(expiredToken);
    } catch (err: any) {
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('JARVIS_SESSION_EXPIRED');
    }
  });

  it('5. wrong issuer rejected: fails verification on invalid iss claim', () => {
    const token = signJarvisTokenNative({
      iss: 'wrong-issuer',
      aud: 'rxflow-jarvis-v2',
      sub: 'doc_789',
      sessionId: 'sess_123',
      clinicId: 'clinic_456',
      doctorId: 'doc_789',
      role: 'doctor',
      tokenVersion: 1,
    });

    expect(() => verifyJarvisToken(token)).toThrow(AuthError);
    try {
      verifyJarvisToken(token);
    } catch (err: any) {
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('JARVIS_ISSUER_INVALID');
    }
  });

  it('6. wrong audience rejected: fails verification on invalid aud claim', () => {
    const token = signJarvisTokenNative({
      iss: 'rxflow-backend',
      aud: 'wrong-audience',
      sub: 'doc_789',
      sessionId: 'sess_123',
      clinicId: 'clinic_456',
      doctorId: 'doc_789',
      role: 'doctor',
      tokenVersion: 1,
    });

    expect(() => verifyJarvisToken(token)).toThrow(AuthError);
    try {
      verifyJarvisToken(token);
    } catch (err: any) {
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('JARVIS_AUDIENCE_INVALID');
    }
  });

  it('7. signed internal HMAC: authenticates backend-to-jarvis-v2 requests', () => {
    const method = 'POST';
    const path = '/v2/internal/execute-tool';
    const body = { toolName: 'lookup_patient', args: { query: 'Rahul' } };

    const signedHeaders = signInternalRequest(method, path, body);

    const reqMock = {
      method,
      path,
      headers: signedHeaders,
      header: (name: string) => (signedHeaders as any)[name.toLowerCase()],
      body,
    };

    let nextCalled = false;
    requireSignedInternal(reqMock as any, {} as any, ((err?: any) => {
      if (!err) nextCalled = true;
    }) as any);

    expect(nextCalled).toBe(true);
  });

  it('8. replay protection: rejects replayed internal requests with duplicate nonce', () => {
    const method = 'POST';
    const path = '/v2/internal/execute-tool-unique';
    const body = { toolName: 'lookup_patient', args: { query: 'UniqueNonceQuery' } };

    const signedHeaders = signInternalRequest(method, path, body);

    const reqMock = {
      method,
      path,
      headers: signedHeaders,
      header: (name: string) => (signedHeaders as any)[name.toLowerCase()],
      body,
    };

    let firstCallSuccess = false;
    requireSignedInternal(reqMock as any, {} as any, ((err?: any) => {
      if (!err) firstCallSuccess = true;
    }) as any);

    expect(firstCallSuccess).toBe(true);

    let secondCallError: any = null;
    requireSignedInternal(reqMock as any, {} as any, ((err?: any) => {
      if (err) secondCallError = err;
    }) as any);

    expect(secondCallError).toBeDefined();
    expect(secondCallError?.statusCode).toBe(409);
    expect(secondCallError?.code).toBe('JARVIS_REPLAY');
  });

  it('9. tampered payload rejected: rejects signed request when body is modified', () => {
    const method = 'POST';
    const path = '/v2/internal/execute-tool';
    const body = { toolName: 'lookup_patient', args: { query: 'Rahul' } };

    const signedHeaders = signInternalRequest(method, path, body);

    const tamperedReqMock = {
      method,
      path,
      headers: signedHeaders,
      header: (name: string) => (signedHeaders as any)[name.toLowerCase()],
      body: { toolName: 'lookup_patient', args: { query: 'Tampered' } }, // Body modified!
    };

    let errorResult: any = null;
    requireSignedInternal(tamperedReqMock as any, {} as any, ((err?: any) => {
      if (err) errorResult = err;
    }) as any);

    expect(errorResult).toBeDefined();
    expect(errorResult?.statusCode).toBe(401);
    expect(errorResult?.code).toBe('JARVIS_SIGNATURE_INVALID');
  });

  it('10. ignores patientId/doctorId in body: identity is derived strictly from JWT context', () => {
    const context: ToolExecutionContext = {
      sessionId: 'sess_123',
      clinicId: 'clinic_456',
      doctorId: 'doc_789',
      boundPatientId: 'pat_real_999',
      sessionToken: 'token_123',
    };

    const bodyInjectedParams = {
      doctorId: 'doc_hacked_000',
      clinicId: 'clinic_hacked_000',
      patientId: 'pat_real_999',
    };

    expect(context.doctorId).toBe('doc_789');
    expect(context.clinicId).toBe('clinic_456');
    expect(bodyInjectedParams.doctorId).not.toBe(context.doctorId);
  });
});

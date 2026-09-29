import crypto from 'node:crypto';
import { signInternalRequest, AuthError } from './auth.js';
import { env } from './env.js';

export async function executeBackendTool(toolName: string, args: Record<string, unknown>, sessionId: string): Promise<unknown> {
  const path = '/api/v1/internal/jarvis/tools/execute';
  const url = `${env.BACKEND_URL.replace(/\/$/, '')}${path}`;
  const body = { sessionId, toolName, arguments: args, requestId: crypto.randomUUID() };

  const headers = signInternalRequest('POST', path, body, env.JARVIS_INTERNAL_HMAC_SECRET);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errBody: any;
    try {
      errBody = await response.json();
    } catch {
      errBody = {};
    }
    const code = errBody?.error?.code || `HTTP_${response.status}`;
    const message = errBody?.error?.message || `Backend tool execution failed with status ${response.status}`;
    throw new AuthError(response.status, code, message);
  }

  const result = (await response.json()) as { success: boolean; data: unknown };
  return result.data;
}

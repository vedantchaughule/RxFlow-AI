import crypto from 'node:crypto';
import { env } from './env.js';

function backendError(status: number, code: string, message: string) {
  const error = new Error(message) as Error & { status: number; code: string };
  error.status = status;
  error.code = code;
  return error;
}

export async function runTool(sessionId: string, toolName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const path = '/api/v1/internal/jarvis/tools/execute';
  const body = JSON.stringify({ sessionId, toolName, arguments: args, requestId: crypto.randomUUID() });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const canonical = ['POST', path, timestamp, nonce, digest].join('\n');
  const signature = crypto.createHmac('sha256', env.JARVIS_INTERNAL_HMAC_SECRET).update(canonical).digest('hex');
  let response: Response;
  try {
    response = await fetch(`${env.RXFLOW_BACKEND_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-jarvis-timestamp': timestamp,
        'x-jarvis-nonce': nonce,
        'x-jarvis-content-sha256': digest,
        'x-jarvis-signature': signature,
      },
      body,
    });
  } catch (error) {
    if (signal?.aborted) throw backendError(504, 'BACKEND_TOOL_TIMEOUT', 'RxFlow did not complete the Jarvis tool request in time');
    throw backendError(503, 'BACKEND_TOOL_UNAVAILABLE', 'RxFlow clinic tools are temporarily unavailable');
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw backendError(502, 'BACKEND_TOOL_INVALID_RESPONSE', 'RxFlow returned an invalid Jarvis tool response');
  const json = await response.json() as { success?: boolean; data?: unknown; error?: { code?: string; message?: string } };
  if (!response.ok || !json.success) throw backendError(response.status, json.error?.code ?? 'BACKEND_TOOL_REJECTED', json.error?.message ?? 'RxFlow rejected the Jarvis tool request');
  return json.data;
}

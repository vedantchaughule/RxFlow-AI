/**
 * Jarvis Workflow Acceptance Test — Deterministic Provider Mock
 *
 * Simulates the OpenAI/Gemini chat completion API locally.
 * Returns deterministic, structured JSON responses for all Jarvis tool calls.
 * No paid API requests are ever made.
 *
 * Mounted as an HTTP server on a dynamic port for the test run.
 */
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

let server: http.Server | null = null;
let _port: number | null = null;

// ─── Deterministic responses keyed by message content keywords ─
function generateResponse(messages: Array<{ role: string; content: string }>): object {
  const lastUserMsg = [...messages].reverse().find((m: { role: string; content: string }) => m.role === 'user')?.content ?? '';

  // Default: ask to lookup patient by ID
  let toolCalls: object[] = [];
  let content = 'I can help you with that. Let me look up the information from the clinic database.';

  const lowerMsg = lastUserMsg.toLowerCase();

  if (lowerMsg.includes('rxf-9999') || lowerMsg.includes('rXF-9999')) {
    // No patient found
    toolCalls = [{
      id: 'call_001',
      type: 'function',
      function: {
        name: 'lookup_patient',
        arguments: JSON.stringify({ query: 'RXF-9999', lookupType: 'patient_code' }),
      },
    }];
  } else if (lowerMsg.includes('rxf-1042') || lowerMsg.includes('priya mehta')) {
    toolCalls = [{
      id: 'call_002',
      type: 'function',
      function: {
        name: 'lookup_patient',
        arguments: JSON.stringify({ query: 'RXF-1042', lookupType: 'patient_code' }),
      },
    }];
  } else if (lowerMsg.includes('rahul patil')) {
    toolCalls = [{
      id: 'call_003',
      type: 'function',
      function: {
        name: 'lookup_patient',
        arguments: JSON.stringify({ query: 'Rahul Patil', lookupType: 'name' }),
      },
    }];
  } else if (lowerMsg.includes('queue number 3') || lowerMsg.includes('queue number 999') || lowerMsg.includes('queue number')) {
    const qNum = lowerMsg.includes('999') ? '999' : '3';
    toolCalls = [{
      id: 'call_004',
      type: 'function',
      function: {
        name: 'lookup_patient',
        arguments: JSON.stringify({ query: qNum, lookupType: 'queue_number' }),
      },
    }];
  } else if (lowerMsg.includes('remaining') || lowerMsg.includes('next patient') || lowerMsg.includes('waiting queue') || lowerMsg.includes('current patient')) {
    const mode = lowerMsg.includes('remaining') ? 'remaining' : lowerMsg.includes('current') ? 'current' : 'list';
    toolCalls = [{
      id: 'call_005',
      type: 'function',
      function: {
        name: 'get_queue_status',
        arguments: JSON.stringify({ mode }),
      },
    }];
  } else if (lowerMsg.includes('paracetamol') && lowerMsg.includes('inventory')) {
    toolCalls = [{
      id: 'call_006',
      type: 'function',
      function: {
        name: 'search_inventory',
        arguments: JSON.stringify({ query: 'paracetamol 500 mg' }),
      },
    }];
  } else if (lowerMsg.includes('low-stock') || lowerMsg.includes('low stock')) {
    toolCalls = [{
      id: 'call_007',
      type: 'function',
      function: {
        name: 'get_low_stock',
        arguments: JSON.stringify({}),
      },
    }];
  } else if (lowerMsg.includes('change paracetamol stock') || lowerMsg.includes('update stock')) {
    // Jarvis must refuse this — return a refusal as content, no tool call
    toolCalls = [];
    content = 'I am unable to modify inventory stock quantities. Please use the inventory management panel to adjust stock levels directly.';
  } else if ((lowerMsg.includes('paracetamol') || lowerMsg.includes('add')) && (lowerMsg.includes('twice') || lowerMsg.includes('twice daily') || lowerMsg.includes('draft'))) {
    toolCalls = [{
      id: 'call_008',
      type: 'function',
      function: {
        name: 'draft_prescription',
        arguments: JSON.stringify({
          diagnosis: 'Acute pain',
          medicines: [{
            name: 'Paracetamol',
            dosage: '500 mg',
            frequency: 'Twice daily',
            duration: '5 days',
            instructions: 'After food',
          }],
          warnings: [],
        }),
      },
    }];
  } else if (lowerMsg.includes('finalize') || lowerMsg.includes('without showing')) {
    // Autonomous finalization — must refuse
    toolCalls = [];
    content = 'I cannot finalize a prescription autonomously. The doctor must review all prescription fields and explicitly confirm through the prescription form before finalization.';
  } else if (lowerMsg.includes('send the prescription') || lowerMsg.includes('send to the patient')) {
    toolCalls = [];
    content = 'I cannot directly send prescriptions or WhatsApp messages. The doctor must review and finalize the prescription through the clinic workflow, which will then queue a notification if consent allows.';
  } else if (lowerMsg.includes('mark the whatsapp') || lowerMsg.includes('mark as delivered')) {
    toolCalls = [];
    content = 'I cannot modify communication delivery status. Delivery status is updated only through verified provider webhooks.';
  } else if (lowerMsg.includes('cetirizine')) {
    toolCalls = [{
      id: 'call_009',
      type: 'function',
      function: {
        name: 'draft_prescription',
        arguments: JSON.stringify({
          diagnosis: 'Allergic rhinitis',
          medicines: [{
            name: 'Cetirizine',
            dosage: '',       // intentionally missing for validation test
            frequency: '',
            duration: '',
          }],
          warnings: ['Cetirizine is currently out of stock in clinic inventory.'],
        }),
      },
    }];
  } else if (lowerMsg.includes('communication status') || lowerMsg.includes('notification status')) {
    toolCalls = [{
      id: 'call_010',
      type: 'function',
      function: {
        name: 'get_communication_status',
        arguments: JSON.stringify({}),
      },
    }];
  }

  if (toolCalls.length > 0) {
    return {
      id: `chatcmpl-mock-${Date.now()}`,
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: null, tool_calls: toolCalls },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  }

  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: 'chat.completion',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
}

export function startMockProvider(): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const response = generateResponse(parsed.messages ?? []);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Bad request to mock provider' } }));
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address();
      if (!addr || typeof addr !== 'object') {
        reject(new Error('Mock provider failed to start'));
        return;
      }
      _port = addr.port;
      resolve(_port);
    });

    server.on('error', reject);
  });
}

export function stopMockProvider(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) { resolve(); return; }
    server.close(() => { server = null; _port = null; resolve(); });
  });
}

export function getMockProviderPort(): number {
  if (!_port) throw new Error('Mock provider not started');
  return _port;
}

export function getMockProviderUrl(): string {
  return `http://127.0.0.1:${getMockProviderPort()}`;
}

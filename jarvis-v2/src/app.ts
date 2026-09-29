import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { z } from 'zod';
import { env } from './env.js';
import { requireJarvisSession } from './auth.js';
import { parseLocalIntent } from './parser/local-parser.js';
import { getProvider } from './providers/provider-registry.js';
import { executeBackendTool } from './backend-client.js';
import type { Intent } from './types.js';
import { handleRealtimeToken } from './voice/realtime-token.js';
import { startTask, resumeTaskWithSelection } from './agent/task-runner.js';

const messageSchema = z.strictObject({
  sessionId: z.string(),
  message: z.string().trim().min(1).max(env.MAX_INPUT_CHARS),
  clientTurnId: z.string().optional(),
});

const speechSchema = z.strictObject({
  text: z.string().trim().min(1).max(1200),
  voiceId: z.string().trim().min(1).max(100).optional(),
});

const logger = pino({ redact: ['req.headers', 'req.body', 'res.headers'] });

type Card = { type: string; title: string; data: unknown };
type PendingAction = {
  actionId: string;
  type: string;
  expiresAt: string;
  patientId?: string;
  purpose?: string;
  title?: string;
  payload?: unknown;
};
type UICmd = { type: string; targetPath?: string; draftFields?: unknown; payload?: unknown };
type TurnResult = {
  turnId: string;
  sessionId: string;
  intent: Intent;
  assistantText: string;
  cards: Card[];
  pendingAction: PendingAction | null;
  uiCommand: UICmd | null;
  state: string;
  status: string;
};

// ─── Intent → Backend Tool Dispatch ───────────────────────────────────

async function dispatchIntent(intent: Intent, sessionId: string): Promise<{
  assistantText: string;
  cards: Card[];
  pendingAction: PendingAction | null;
  uiCommand: UICmd | null;
  state: string;
}> {
  const kind = intent.kind;

  // Intents that don't need backend tools
  if (kind === 'greeting') {
    return {
      assistantText: 'Good day, Doctor. Friday is online and ready. How can I assist you today?',
      cards: [],
      pendingAction: null,
      uiCommand: null,
      state: 'success',
    };
  }

  if (kind === 'help') {
    return {
      assistantText: 'Here are the commands I understand. You can speak or type any of these:',
      cards: [{
        type: 'help',
        title: 'Available Commands',
        data: [
          'Show remaining queue count',
          'Who is the next patient?',
          'Show low stock medicines',
          'Search Paracetamol 500 mg in inventory',
          'Open patient [name or code]',
          'Show recent prescriptions',
          'Prescribe Amoxicillin 500mg twice daily for 5 days',
          'Prepare patient access',
          'Show operational summary',
          'Today\'s appointments',
          'Communication status',
        ],
      }],
      pendingAction: null,
      uiCommand: null,
      state: 'success',
    };
  }

  if (kind === 'unknown') {
    return {
      assistantText: 'I didn\'t understand that command. Try saying "help" to see available commands, or rephrase your request.',
      cards: [],
      pendingAction: null,
      uiCommand: null,
      state: 'warning',
    };
  }

  // Map intent kinds to backend tool calls
  try {
    switch (kind) {
      // ── Queue ──
      case 'queue': {
        const data = await executeBackendTool('get_queue_status', { mode: intent.mode }, sessionId) as any;
        const remaining = data?.remainingPatients ?? data?.totalWaiting ?? 0;
        const current = data?.current;
        const next = data?.next;

        if (intent.mode === 'next') {
          if (!next) return { assistantText: 'No patients are waiting in line.', cards: [{ type: 'queue_status', title: 'Queue Status', data: { remainingPatients: 0 } }], pendingAction: null, uiCommand: null, state: 'success' };
          const p = next.patient ?? next;
          return { assistantText: `Next patient is ${p?.name ?? 'Unknown'} (Queue #${next.queueNumber}).`, cards: [{ type: 'patient_match', title: 'Next Patient', data: p }], pendingAction: null, uiCommand: null, state: 'success' };
        }
        if (intent.mode === 'current') {
          if (!current) return { assistantText: 'No patient is currently in consultation.', cards: [{ type: 'queue_status', title: 'Queue Status', data: { remainingPatients: remaining } }], pendingAction: null, uiCommand: null, state: 'success' };
          const p = current.patient ?? current;
          return { assistantText: `Currently consulting ${p?.name ?? 'Unknown'} (Queue #${current.queueNumber}).`, cards: [{ type: 'patient_match', title: 'Current Patient', data: p }], pendingAction: null, uiCommand: null, state: 'success' };
        }
        if (intent.mode === 'list') {
          return { assistantText: `Showing your active queue (${remaining} waiting).`, cards: [{ type: 'queue_status', title: 'Queue', data }], pendingAction: null, uiCommand: { type: 'NAVIGATE_UI', targetPath: '/app/patients' }, state: 'success' };
        }
        // remaining mode
        const currentInfo = current ? ` ${(current.patient ?? current)?.name ?? 'A patient'} is currently in consultation.` : '';
        return { assistantText: `There are ${remaining} patients waiting in your queue today.${currentInfo}`, cards: [{ type: 'queue_status', title: 'Queue Status', data: { remainingPatients: remaining, current } }], pendingAction: null, uiCommand: null, state: 'success' };
      }

      case 'patients_seen_today':
      case 'patients_waiting':
      case 'operational_summary': {
        const data = await executeBackendTool('get_queue_status', { mode: 'list' }, sessionId) as any;
        const entries = data?.entries ?? [];
        const waiting = entries.filter((e: any) => e.status === 'waiting').length;
        const inConsultation = entries.filter((e: any) => e.status === 'in_consultation').length;
        const completed = entries.filter((e: any) => e.status === 'completed').length;
        const total = entries.length;

        if (kind === 'patients_seen_today') {
          return { assistantText: `You have seen ${completed} patients today out of ${total} total.`, cards: [{ type: 'operational_summary', title: 'Patients Seen Today', data: { completedCount: completed, waitingCount: waiting, totalVolume: total } }], pendingAction: null, uiCommand: null, state: 'success' };
        }
        if (kind === 'patients_waiting') {
          return { assistantText: `${waiting} patients are currently waiting in your queue.`, cards: [{ type: 'queue_status', title: 'Patients Waiting', data: { remainingPatients: waiting, current: inConsultation > 0 ? entries.find((e: any) => e.status === 'in_consultation') : null } }], pendingAction: null, uiCommand: null, state: 'success' };
        }
        // operational_summary
        return { assistantText: `Today's clinic summary: ${completed} completed, ${waiting} waiting, ${total} total volume.`, cards: [{ type: 'operational_summary', title: 'Operational Summary', data: { completedCount: completed, waitingCount: waiting, totalVolume: total, averageWaitMinutes: null } }], pendingAction: null, uiCommand: null, state: 'success' };
      }

      // ── Patient Lookup ──
      case 'patient_lookup': {
        const data = await executeBackendTool('lookup_patient', { query: intent.query, lookupType: intent.lookupType }, sessionId) as any;
        if (data.status === 'no_match') {
          return { assistantText: `No patients found matching "${intent.query}".`, cards: [], pendingAction: null, uiCommand: null, state: 'warning' };
        }
        if (data.status === 'exact_match' && data.patient) {
          return {
            assistantText: `Found patient ${data.patient.name} (${data.patient.patientCode}).`,
            cards: [{ type: 'patient_match', title: 'Patient Found', data: data.patient }],
            pendingAction: null,
            uiCommand: null,
            state: 'success',
          };
        }
        if (data.status === 'multiple_matches' && data.matches) {
          return {
            assistantText: `Found ${data.matches.length} patients matching "${intent.query}". Select one:`,
            cards: [{ type: 'patient_matches', title: 'Multiple Matches', data: data.matches }],
            pendingAction: null,
            uiCommand: null,
            state: 'needs_confirmation',
          };
        }
        return { assistantText: 'Patient lookup completed.', cards: [], pendingAction: null, uiCommand: null, state: 'success' };
      }

      // ── Inventory ──
      case 'inventory_search': {
        const data = await executeBackendTool('search_inventory', { query: intent.query }, sessionId) as any;
        if (!data.items?.length) {
          return { assistantText: `No inventory items found for "${intent.query}".`, cards: [], pendingAction: null, uiCommand: null, state: 'warning' };
        }
        return { assistantText: `Found ${data.items.length} result(s) for "${intent.query}" in inventory.`, cards: [{ type: 'inventory_result', title: 'Inventory Search', data }], pendingAction: null, uiCommand: null, state: 'success' };
      }

      case 'low_stock': {
        const data = await executeBackendTool('get_low_stock', {}, sessionId) as any;
        if (!data.items?.length) {
          return { assistantText: 'All inventory items are above reorder levels. No low stock detected.', cards: [], pendingAction: null, uiCommand: null, state: 'success' };
        }
        return { assistantText: `${data.items.length} item(s) are below reorder levels.`, cards: [{ type: 'low_stock', title: 'Low Stock Alert', data }], pendingAction: null, uiCommand: null, state: 'warning' };
      }

      // ── Prescriptions ──
      case 'recent_prescriptions': {
        const data = await executeBackendTool('get_recent_prescriptions', { limit: 3 }, sessionId) as any;
        if (!data.items?.length) {
          return { assistantText: 'No recent prescriptions found for the confirmed patient.', cards: [], pendingAction: null, uiCommand: null, state: 'warning' };
        }
        return { assistantText: `Showing ${data.items.length} recent prescription(s).`, cards: [{ type: 'prescription_history', title: 'Recent Prescriptions', data }], pendingAction: null, uiCommand: null, state: 'success' };
      }

      case 'prescription_draft': {
        const data = await executeBackendTool('propose_prescription_draft', { draft: intent.draft }, sessionId) as any;
        return {
          assistantText: 'Prescription draft prepared. Please review and confirm.',
          cards: [{ type: 'prescription_draft', title: 'Prescription Draft', data: intent.draft }],
          pendingAction: data.actionId ? { actionId: data.actionId, type: data.type, expiresAt: data.expiresAt, title: 'Review Prescription Draft', payload: intent.draft } : null,
          uiCommand: null,
          state: data.actionId ? 'needs_confirmation' : 'success',
        };
      }

      // ── Patient Access ──
      case 'prepare_patient_access': {
        const data = await executeBackendTool('prepare_patient_access', {}, sessionId) as any;
        return {
          assistantText: 'Patient access link prepared. Confirm to generate.',
          cards: [],
          pendingAction: data.actionId ? { actionId: data.actionId, type: data.type, expiresAt: data.expiresAt, title: 'Prepare Patient Access' } : null,
          uiCommand: null,
          state: data.actionId ? 'needs_confirmation' : 'success',
        };
      }

      case 'access_status': {
        const data = await executeBackendTool('get_access_status', {}, sessionId) as any;
        return { assistantText: `Prescription access status: ${data.accessStatus ?? 'Unknown'}.`, cards: [{ type: 'access_status', title: 'Access Status', data }], pendingAction: null, uiCommand: null, state: 'success' };
      }

      // ── Communication ──
      case 'communication_status': {
        const data = await executeBackendTool('get_communication_status', {}, sessionId) as any;
        if (!data.messages?.length) {
          return { assistantText: 'No communication messages found for the confirmed patient.', cards: [], pendingAction: null, uiCommand: null, state: 'warning' };
        }
        return { assistantText: `Showing ${data.messages.length} communication message(s).`, cards: [{ type: 'communication_status', title: 'Communication Status', data }], pendingAction: null, uiCommand: null, state: 'success' };
      }

      // ── Navigation / Templates / Appointments (UI-only dispatches) ──
      case 'list_templates': {
        return { assistantText: 'Opening your prescription templates.', cards: [], pendingAction: null, uiCommand: { type: 'OPEN_TEMPLATE_LIBRARY' }, state: 'success' };
      }

      case 'today_appointments':
      case 'next_appointment':
      case 'appointment_status':
      case 'draft_appointment': {
        return { assistantText: 'Opening the appointments panel.', cards: [], pendingAction: null, uiCommand: { type: 'NAVIGATE_UI', targetPath: '/app/appointments' }, state: 'success' };
      }

      case 'use_template': {
        return { assistantText: `Looking for template "${intent.templateName ?? ''}"...`, cards: [], pendingAction: null, uiCommand: { type: 'OPEN_TEMPLATE_LIBRARY' }, state: 'success' };
      }

      case 'patient_context': {
        const data = await executeBackendTool('get_patient_context' as any, {}, sessionId) as any;
        return { assistantText: `Patient context loaded for ${data?.name ?? 'the confirmed patient'}.`, cards: [{ type: 'patient_summary', title: 'Patient Context', data }], pendingAction: null, uiCommand: null, state: 'success' };
      }

      // ── Mutation intents → navigate to the relevant page ──
      case 'mutate_inventory_stock':
      case 'add_inventory_to_draft': {
        return { assistantText: 'Opening inventory management.', cards: [], pendingAction: null, uiCommand: { type: 'NAVIGATE_UI', targetPath: '/app/inventory' }, state: 'success' };
      }

      case 'mutate_appointment': {
        return { assistantText: `Opening appointments to ${intent.action} an appointment.`, cards: [], pendingAction: null, uiCommand: { type: 'OPEN_APPOINTMENT_FORM' }, state: 'success' };
      }

      case 'mutate_communication':
      case 'draft_communication':
      case 'reminder_status': {
        return { assistantText: 'Opening communications panel.', cards: [], pendingAction: null, uiCommand: { type: 'NAVIGATE_UI', targetPath: '/app/communications' }, state: 'success' };
      }

      case 'save_draft_template':
      case 'fill_blank_template': {
        return { assistantText: 'Opening template management.', cards: [], pendingAction: null, uiCommand: { type: 'OPEN_TEMPLATE_LIBRARY' }, state: 'success' };
      }

      case 'database_info': {
        return { assistantText: 'Friday is connected to the RxFlow clinical database. All patient data is encrypted and access-controlled.', cards: [], pendingAction: null, uiCommand: null, state: 'success' };
      }

      case 'web_search': {
        return { assistantText: 'Web search is not available in the clinical assistant for patient safety.', cards: [], pendingAction: null, uiCommand: null, state: 'warning' };
      }

      default:
        return { assistantText: 'I understood your request but this command is not yet supported. Try "help" to see available commands.', cards: [], pendingAction: null, uiCommand: null, state: 'warning' };
    }
  } catch (err: any) {
    const code = err?.code ?? '';
    const message = err?.message ?? 'Backend tool execution failed';

    // Handle specific backend errors gracefully
    if (code === 'PATIENT_CONFIRMATION_REQUIRED' || message.includes('Confirm a patient')) {
      return { assistantText: 'Please confirm a patient first. Say "Open patient [name]" to look up and bind a patient.', cards: [], pendingAction: null, uiCommand: null, state: 'warning' };
    }
    if (code === 'CONSULTATION_NOT_ACTIVE' || message.includes('consultation')) {
      return { assistantText: 'No active consultation. Start the patient consultation first.', cards: [], pendingAction: null, uiCommand: null, state: 'warning' };
    }

    logger.error({ err, kind }, 'Backend tool error during intent dispatch');
    return { assistantText: `Friday encountered an error: ${message}. Please retry or continue manually.`, cards: [], pendingAction: null, uiCommand: null, state: 'error' };
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: true, credentials: true, methods: ['GET', 'POST', 'OPTIONS'] }));
  app.use(express.json({ limit: '32kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === 'test' ? 1000 : 100, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'jarvis-v2' }));

  app.get('/ready', (_req, res) => {
    res.json({
      status: 'ready',
      service: 'jarvis-v2',
      provider: env.AI_PROVIDER,
      providerConfigured: true,
    });
  });

  app.post('/v1/voice/realtime-token', requireJarvisSession, handleRealtimeToken);

  const handleTaskRunner = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const body = messageSchema.parse(req.body);
      const session = (req as any).jarvisSession;
      if (body.sessionId !== session.sessionId) {
        return res.status(403).json({ success: false, error: { code: 'SESSION_MISMATCH', message: 'Session mismatch' } });
      }

      const task = await startTask(session.sessionId, body.message);
      
      const turnResult = {
        turnId: task.taskId,
        taskId: task.taskId,
        sessionId: session.sessionId,
        status: task.status === 'failed' ? 'failed' : 'success',
        state: task.status,
        assistantText: task.assistantText || 'Task processed.',
        cards: task.needsSelection ? [{ type: 'patient_matches', title: 'Select Patient', data: task.needsSelection.options }] : [],
        pendingAction: task.pendingAction || null,
        needsSelection: task.needsSelection || null,
        uiCommand: task.uiCommands.length > 0 ? task.uiCommands[0] : null,
        uiCommands: task.uiCommands,
        stepsExecuted: task.stepsExecuted,
      };

      res.json({ success: true, data: turnResult });
    } catch (error) {
      next(error);
    }
  };

  const handleTurn = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const body = messageSchema.parse(req.body);
      const session = (req as any).jarvisSession;
      if (body.sessionId !== session.sessionId) {
        return res.status(403).json({ success: false, error: { code: 'SESSION_MISMATCH', message: 'Session mismatch' } });
      }

      // Check if this is a complex or multi-step command
      const isMultiStep = body.message.includes(',') || body.message.toLowerCase().includes('and') || body.message.length > 35;

      if (isMultiStep) {
        const task = await startTask(session.sessionId, body.message);
        const turnResult = {
          turnId: task.taskId,
          taskId: task.taskId,
          sessionId: session.sessionId,
          status: task.status === 'failed' ? 'failed' : 'success',
          state: task.status,
          assistantText: task.assistantText || 'Task processed.',
          cards: task.needsSelection ? [{ type: 'patient_matches', title: 'Select Patient', data: task.needsSelection.options }] : [],
          pendingAction: task.pendingAction || null,
          needsSelection: task.needsSelection || null,
          uiCommand: task.uiCommands.length > 0 ? task.uiCommands[0] : null,
          uiCommands: task.uiCommands,
          stepsExecuted: task.stepsExecuted,
        };
        return res.json({ success: true, data: turnResult });
      }

      // 1. Resolve intent — try AI provider first, fall back to local parser
      let intent: Intent;
      try {
        const provider = getProvider();
        const providerResult = await provider.understand(
          { message: body.message },
          { timeoutMs: env.JARVIS_REQUEST_TIMEOUT_MS }
        );
        intent = providerResult.intent;
      } catch (err) {
        logger.warn({ err }, 'AI provider failed, falling back to local parser');
        intent = parseLocalIntent(body.message);
      }

      // If AI returned unknown, try local parser as a second chance
      if (intent.kind === 'unknown') {
        const localIntent = parseLocalIntent(body.message);
        if (localIntent.kind !== 'unknown') {
          intent = localIntent;
        }
      }

      // 2. Dispatch intent to backend tools
      const result = await dispatchIntent(intent, session.sessionId);

      // 3. Build response
      const turnResult: TurnResult = {
        turnId: crypto.randomUUID(),
        sessionId: session.sessionId,
        intent,
        assistantText: result.assistantText,
        cards: result.cards,
        pendingAction: result.pendingAction,
        uiCommand: result.uiCommand,
        state: result.state,
        status: 'success',
      };

      res.json({ success: true, data: turnResult });
    } catch (error) {
      next(error);
    }
  };

  app.post('/v1/agent/task', requireJarvisSession, handleTaskRunner);
  app.post('/v1/messages', requireJarvisSession, handleTurn);
  app.post('/jarvis/turn', requireJarvisSession, handleTurn);

  app.post('/v1/tasks/:taskId/resume', requireJarvisSession, async (req, res, next) => {
    try {
      const taskId = String(req.params.taskId || '');
      const { selectedOption, sessionId } = req.body;
      const session = (req as any).jarvisSession;
      if (sessionId && sessionId !== session.sessionId) {
        return res.status(403).json({ success: false, error: { code: 'SESSION_MISMATCH', message: 'Session mismatch' } });
      }

      const task = await resumeTaskWithSelection(taskId, selectedOption, session.sessionId);
      res.json({
        success: true,
        data: {
          taskId: task.taskId,
          status: task.status,
          assistantText: task.assistantText,
          uiCommands: task.uiCommands,
          stepsExecuted: task.stepsExecuted,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  const handleSpeech = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const body = speechSchema.parse(req.body);
      if (!env.ELEVENLABS_ENABLED || !env.ELEVENLABS_API_KEY) {
        return res.status(503).json({ success: false, error: { code: 'VOICE_NOT_CONFIGURED', message: 'ElevenLabs voice is not configured' } });
      }

      const voiceId = body.voiceId || env.ELEVENLABS_VOICE_ID;
      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${encodeURIComponent(env.ELEVENLABS_OUTPUT_FORMAT)}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': env.ELEVENLABS_API_KEY,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            text: body.text,
            model_id: env.ELEVENLABS_MODEL_ID,
            voice_settings: { stability: 0.65, similarity_boost: 0.82, style: 0.12, use_speaker_boost: true },
          }),
        }
      );

      if (!upstream.ok) {
        return res.status(502).json({ success: false, error: { code: 'ELEVENLABS_ERROR', message: 'ElevenLabs upstream request failed' } });
      }

      const arrayBuffer = await upstream.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.status(200).send(Buffer.from(arrayBuffer));
    } catch (error) {
      next(error);
    }
  };

  app.post('/v1/speech', requireJarvisSession, handleSpeech);
  app.post('/jarvis/speak', requireJarvisSession, handleSpeech);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const value = error as { statusCode?: number; status?: number; code?: string; message?: string; name?: string };
    const status = value.statusCode ?? value.status ?? (value.name === 'ZodError' ? 400 : 500);
    res.status(status).json({
      success: false,
      error: {
        code: value.code ?? (status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'),
        message: value.message ?? 'Request failed',
      },
    });
  });

  return app;
}


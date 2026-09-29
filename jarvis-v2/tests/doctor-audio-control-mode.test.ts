import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/env.js';
import { signJarvisTokenNative } from '../src/auth.js';
import { createTask, updateTask } from '../src/agent/task-state.js';
import { startTask, resumeTaskWithSelection } from '../src/agent/task-runner.js';

describe('Jarvis Doctor Audio Control Mode (v3.md Specifications)', () => {
  const app = createApp();

  describe('1. Realtime STT Token API (/v1/voice/realtime-token)', () => {
    it('rejects unauthorized requests without session header', async () => {
      const res = await request(app)
        .post('/v1/voice/realtime-token')
        .send({});
      expect(res.status).toBe(401);
    });

    it('returns single-use STT token in test mode when session is valid', async () => {
      const token = signJarvisTokenNative({
        iss: 'rxflow-backend',
        aud: 'rxflow-jarvis-v2',
        sub: 'doc_789',
        sessionId: 'test-session-123',
        clinicId: 'clinic_456',
        doctorId: 'doc_789',
        role: 'doctor',
        tokenVersion: 1,
      });

      const res = await request(app)
        .post('/v1/voice/realtime-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.modelId).toBe('scribe_v2_realtime');
    });
  });

  describe('2. Multi-Step Task Runner & Agent Tool Loop', () => {
    it('creates persistent task and executes sequential steps for complex goal', async () => {
      const sessionId = 'test-session-123';
      const goal = 'Jarvis open Rahul Patil, show his previous prescription and open a new prescription.';

      const task = await startTask(sessionId, goal);

      expect(task.taskId).toMatch(/^J-\d{4}$/);
      expect(task.sessionId).toBe(sessionId);
      expect(task.currentStep).toBeGreaterThan(0);
      expect(task.stepsExecuted.length).toBeGreaterThan(0);
      expect(task.maxSteps).toBe(6);
    });

    it('pauses task when patient lookup returns multiple matches (awaiting_selection)', async () => {
      const task = createTask('test-session-456', 'Open Rahul');
      
      // Simulate multi-match patient lookup output
      const updated = updateTask(task.taskId, {
        status: 'awaiting_selection',
        needsSelection: {
          type: 'patient',
          prompt: 'Select patient',
          options: [
            { patientId: 'p1', name: 'Rahul Patil (Mumbai)' },
            { patientId: 'p2', name: 'Rahul Patil (Pune)' },
          ],
        },
      });

      expect(updated?.status).toBe('awaiting_selection');
      expect(updated?.needsSelection?.options.length).toBe(2);

      // Resume task with selection
      const resumed = await resumeTaskWithSelection(
        task.taskId,
        { patientId: 'p1', name: 'Rahul Patil (Mumbai)', friendlyId: 'RXF-1001' },
        'test-session-456'
      );

      expect(resumed.patientId).toBe('p1');
      expect(resumed.patientName).toBe('Rahul Patil (Mumbai)');
      expect(resumed.uiCommands.some((cmd) => cmd.type === 'OPEN_PATIENT')).toBe(true);
    });
  });

  describe('3. Indian Doctor Speech Intention Support', () => {
    it('understands mixed Marathi/English doctor speech patterns', async () => {
      const sessionId = 'test-session-789';
      const goal = 'Jarvis Rahul Patil cha patient open kar';

      const task = await startTask(sessionId, goal);
      expect(task.taskId).toBeDefined();
      expect(task.stepsExecuted.length).toBeGreaterThan(0);
    });
  });

  describe('4. Environment Settings', () => {
    it('configures default Scribe Realtime STT model and max agent steps', () => {
      expect(env.ELEVENLABS_STT_MODEL_ID).toBe('scribe_v2_realtime');
      expect(env.MAX_AGENT_STEPS).toBe(6);
    });
  });
});

import { executeBackendTool } from '../backend-client.js';
import { getProvider } from '../providers/provider-registry.js';
import { parseLocalIntent } from '../parser/local-parser.js';
import { env } from '../env.js';
import { JarvisTask, updateTask, AgentTaskStep } from './task-state.js';
import type { Intent } from '../types.js';

export interface ProgressEvent {
  taskId: string;
  stepIndex: number;
  status: string;
  message: string;
  uiCommand?: any;
  pendingAction?: any;
  timestamp: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * Maps multi-step doctor goals into structured sequential tool steps
 * and executes them with full safety gating and streaming callbacks.
 */
export async function executeTaskStepLoop(
  task: JarvisTask,
  sessionId: string,
  onProgress?: ProgressCallback
): Promise<JarvisTask> {
  let currentTask = updateTask(task.taskId, { status: 'running' }) || task;

  const emitProgress = (message: string, uiCommand?: any, pendingAction?: any) => {
    const event: ProgressEvent = {
      taskId: currentTask.taskId,
      stepIndex: currentTask.currentStep,
      status: currentTask.status,
      message,
      uiCommand,
      pendingAction,
      timestamp: new Date().toISOString(),
    };
    onProgress?.(event);
  };

  emitProgress(`Understanding doctor goal: "${currentTask.goal}"...`);

  // Breakdown or plan step intentions
  const goalsToProcess = parseSubGoals(currentTask.goal);
  
  for (let i = 0; i < goalsToProcess.length; i++) {
    if (currentTask.currentStep >= env.MAX_AGENT_STEPS) {
      emitProgress('Reached maximum agent steps count (6). Terminating task safely.');
      currentTask = updateTask(currentTask.taskId, {
        status: 'completed',
        assistantText: currentTask.assistantText || 'Completed partial workflow steps.',
      }) || currentTask;
      break;
    }

    if (currentTask.status === 'awaiting_selection' || currentTask.status === 'awaiting_confirmation') {
      // Paused for doctor input
      break;
    }

    const subGoal = goalsToProcess[i] ?? '';
    if (!subGoal) continue;

    currentTask.currentStep += 1;
    const stepIndex = currentTask.currentStep;

    emitProgress(`Executing step ${stepIndex}/${goalsToProcess.length}: ${subGoal}...`);

    // Determine intent for sub-goal
    let intent: Intent;
    try {
      const provider = getProvider();
      const providerResult = await provider.understand(
        { message: subGoal, contextHint: `PatientId: ${currentTask.patientId || 'none'}` },
        { timeoutMs: env.JARVIS_REQUEST_TIMEOUT_MS }
      );
      intent = providerResult.intent;
    } catch {
      intent = parseLocalIntent(subGoal);
    }

    if (intent.kind === 'unknown') {
      intent = parseLocalIntent(subGoal);
    }

    // Step Execution Record
    const toolCallId = `call_${Math.random().toString(36).substring(2, 9)}`;
    const stepRecord: AgentTaskStep = {
      stepIndex,
      toolCallId,
      toolName: intent.kind,
      arguments: intent as any,
      status: 'running',
      timestamp: new Date().toISOString(),
    };

    try {
      switch (intent.kind) {
        // ── Patient Lookup & Binding ──
        case 'patient_lookup': {
          const res = (await executeBackendTool('lookup_patient', { query: intent.query, lookupType: intent.lookupType }, sessionId)) as any;
          if (res.status === 'no_match' || !res.matches?.length) {
            stepRecord.status = 'failed';
            stepRecord.error = `No patient found matching "${intent.query}"`;
            currentTask.stepsExecuted.push(stepRecord);
            emitProgress(`No patient found matching "${intent.query}".`);
            currentTask = updateTask(currentTask.taskId, {
              status: 'failed',
              assistantText: `I couldn't find any patient matching "${intent.query}".`,
            }) || currentTask;
            return currentTask;
          }

          if (res.status === 'multiple_matches' || res.matches.length > 1) {
            stepRecord.status = 'paused';
            stepRecord.result = res.matches;
            currentTask.stepsExecuted.push(stepRecord);
            currentTask = updateTask(currentTask.taskId, {
              status: 'awaiting_selection',
              needsSelection: {
                type: 'patient',
                prompt: `Found ${res.matches.length} patients matching "${intent.query}". Please select one:`,
                options: res.matches,
              },
              assistantText: `Multiple patients found for "${intent.query}". Please select the correct patient.`,
            }) || currentTask;
            emitProgress(`Found ${res.matches.length} matching patients. Awaiting doctor selection.`);
            return currentTask;
          }

          // Single match
          const p = res.matches[0] || res.patient;
          currentTask.patientId = p.patientId;
          currentTask.patientName = p.name;
          stepRecord.status = 'success';
          stepRecord.result = p;
          currentTask.stepsExecuted.push(stepRecord);

          // Add UI Command to open patient
          const navCmd = { type: 'OPEN_PATIENT', patientId: p.patientId, friendlyId: p.friendlyId || p.patientCode || p.patientId };
          currentTask.uiCommands.push(navCmd);
          emitProgress(`Found and bound patient ${p.name}. Opening patient workspace...`, navCmd);
          break;
        }

        case 'queue': {
          const res = (await executeBackendTool('get_queue_status', { mode: intent.mode }, sessionId)) as any;
          stepRecord.status = 'success';
          stepRecord.result = res;
          currentTask.stepsExecuted.push(stepRecord);

          if (intent.mode === 'next' && res.next) {
            const p = res.next.patient || res.next;
            currentTask.patientId = p.patientId;
            currentTask.patientName = p.name;
            currentTask.queueEntryId = res.next.queueEntryId;
            const navCmd = { type: 'OPEN_PATIENT', patientId: p.patientId, friendlyId: p.friendlyId || p.patientId };
            currentTask.uiCommands.push(navCmd);
            emitProgress(`Next patient is ${p.name}. Opening patient workspace...`, navCmd);
          } else {
            const navCmd = { type: 'SHOW_QUEUE', filter: 'all' };
            currentTask.uiCommands.push(navCmd);
            emitProgress(`Queue status retrieved (${res.totalWaiting || res.remainingPatients || 0} waiting).`, navCmd);
          }
          break;
        }

        // ── Inventory ──
        case 'inventory_search': {
          const res = (await executeBackendTool('search_inventory', { query: intent.query }, sessionId)) as any;
          stepRecord.status = 'success';
          stepRecord.result = res;
          currentTask.stepsExecuted.push(stepRecord);
          const navCmd = { type: 'NAVIGATE_UI', targetPath: '/app/inventory' };
          currentTask.uiCommands.push(navCmd);
          emitProgress(`Found ${res.items?.length || 0} inventory items for "${intent.query}".`, navCmd);
          break;
        }

        case 'low_stock': {
          const res = (await executeBackendTool('get_low_stock', {}, sessionId)) as any;
          stepRecord.status = 'success';
          stepRecord.result = res;
          currentTask.stepsExecuted.push(stepRecord);
          const navCmd = { type: 'NAVIGATE_UI', targetPath: '/app/inventory' };
          currentTask.uiCommands.push(navCmd);
          emitProgress(`Checked low stock inventory (${res.items?.length || 0} items low).`, navCmd);
          break;
        }

        // ── Prescriptions & Drafts ──
        case 'recent_prescriptions': {
          const pId = currentTask.patientId;
          const res = (await executeBackendTool('get_recent_prescriptions', { patientId: pId, limit: 3 }, sessionId)) as any;
          stepRecord.status = 'success';
          stepRecord.result = res;
          currentTask.stepsExecuted.push(stepRecord);
          const navCmd = { type: 'NAVIGATE_UI', targetPath: pId ? `/app/patients/${pId}` : '/app/prescriptions' };
          currentTask.uiCommands.push(navCmd);
          emitProgress(`Loaded recent prescriptions for ${currentTask.patientName || 'patient'}.`, navCmd);
          break;
        }

        case 'prescription_draft': {
          const res = (await executeBackendTool('propose_prescription_draft', { draft: intent.draft }, sessionId)) as any;
          stepRecord.status = 'success';
          stepRecord.result = res;
          currentTask.stepsExecuted.push(stepRecord);
          
          const applyCmd = {
            type: 'APPLY_PRESCRIPTION_DRAFT_FIELDS',
            patientId: currentTask.patientId || '',
            queueEntryId: currentTask.queueEntryId,
            draft: intent.draft,
            mergedFields: Object.keys(intent.draft || {}),
            isJarvisAssisted: true,
            resetFinalApproval: true,
          };
          const openEditorCmd = { type: 'OPEN_PRESCRIPTION_EDITOR' };
          currentTask.uiCommands.push(applyCmd, openEditorCmd);
          emitProgress('Prescription draft ready and applied to editor for doctor review.', openEditorCmd);
          break;
        }

        // ── Navigation ──
        case 'list_templates': {
          stepRecord.status = 'success';
          currentTask.stepsExecuted.push(stepRecord);
          const navCmd = { type: 'OPEN_TEMPLATE_LIBRARY' };
          currentTask.uiCommands.push(navCmd);
          emitProgress('Opening prescription template library.', navCmd);
          break;
        }

        default: {
          stepRecord.status = 'success';
          currentTask.stepsExecuted.push(stepRecord);
          emitProgress(`Completed action for "${subGoal}".`);
          break;
        }
      }
    } catch (err: any) {
      stepRecord.status = 'failed';
      stepRecord.error = err?.message || 'Tool execution failed';
      currentTask.stepsExecuted.push(stepRecord);
      emitProgress(`Step failed: ${stepRecord.error}`);
      currentTask = updateTask(currentTask.taskId, {
        status: 'failed',
        assistantText: `Failed while executing "${subGoal}": ${stepRecord.error}`,
      }) || currentTask;
      return currentTask;
    }
  }

  if (currentTask.status === 'running') {
    const speechSummary = buildConciseSpeechSummary(currentTask);
    currentTask = updateTask(currentTask.taskId, {
      status: 'completed',
      assistantText: speechSummary,
    }) || currentTask;
    emitProgress(`Task completed successfully: ${speechSummary}`);
  }

  return currentTask;
}

/**
 * Splits multi-action doctor commands into individual manageable goals.
 * e.g. "Jarvis open Rahul Patil, show his previous prescription and open a new prescription."
 */
function parseSubGoals(goal: string): string[] {
  // Clean prefix like "jarvis"
  const cleanGoal = goal.replace(/^(jarvis|friday)[,\s]*/i, '').trim();

  // Split on connectors like "and then", "and", "then", commas, semicolons
  const parts = cleanGoal
    .split(/(?:\s+and\s+then\s+|\s+then\s+|,\s*and\s+|\b,\s*|\s*;\s*)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return parts.length > 0 ? parts : [cleanGoal];
}

/**
 * Generates a concise natural spoken response summarizing the completed steps.
 */
function buildConciseSpeechSummary(task: JarvisTask): string {
  if (task.patientName) {
    return `${task.patientName}'s profile is open and workspace is ready, Doctor.`;
  }
  const lastStep = task.stepsExecuted[task.stepsExecuted.length - 1];
  if (lastStep?.toolName === 'queue') {
    return 'The queue status has been updated on your dashboard, Doctor.';
  }
  if (lastStep?.toolName === 'inventory_search' || lastStep?.toolName === 'low_stock') {
    return 'Inventory search results are ready for your review, Doctor.';
  }
  return 'Your request has been executed successfully, Doctor.';
}

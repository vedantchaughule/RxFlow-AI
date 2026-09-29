export type TaskStatus =
  | 'planning'
  | 'running'
  | 'awaiting_selection'
  | 'awaiting_confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentTaskStep {
  stepIndex: number;
  toolCallId?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'failed' | 'paused';
  result?: unknown;
  backendRequestId?: string;
  error?: string;
  timestamp: string;
}

export interface JarvisTask {
  taskId: string;
  sessionId: string;
  status: TaskStatus;
  goal: string;
  currentStep: number;
  maxSteps: number;
  stepsExecuted: AgentTaskStep[];
  patientId?: string;
  patientName?: string;
  queueEntryId?: string;
  pendingAction?: {
    actionId: string;
    type: string;
    expiresAt: string;
    title?: string;
    payload?: unknown;
    prompt?: string;
  } | null;
  needsSelection?: {
    type: 'patient' | 'slot' | 'item';
    prompt: string;
    options: unknown[];
  } | null;
  uiCommands: any[];
  assistantText?: string;
  createdAt: string;
  updatedAt: string;
}

const taskStore = new Map<string, JarvisTask>();

export function createTask(sessionId: string, goal: string, maxSteps = 6): JarvisTask {
  const taskId = `J-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();
  const task: JarvisTask = {
    taskId,
    sessionId,
    status: 'planning',
    goal,
    currentStep: 0,
    maxSteps,
    stepsExecuted: [],
    uiCommands: [],
    createdAt: now,
    updatedAt: now,
  };
  taskStore.set(taskId, task);
  return task;
}

export function getTask(taskId: string): JarvisTask | undefined {
  return taskStore.get(taskId);
}

export function updateTask(taskId: string, updates: Partial<JarvisTask>): JarvisTask | undefined {
  const existing = taskStore.get(taskId);
  if (!existing) return undefined;

  const updated: JarvisTask = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  taskStore.set(taskId, updated);
  return updated;
}

export function clearSessionTasks(sessionId: string): void {
  for (const [id, task] of taskStore.entries()) {
    if (task.sessionId === sessionId) {
      taskStore.delete(id);
    }
  }
}

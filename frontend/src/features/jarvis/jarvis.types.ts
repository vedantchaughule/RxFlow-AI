export type JarvisVisualState =
  | 'off'
  | 'booting'
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'planning'
  | 'thinking'
  | 'tool_running'
  | 'needs_confirmation'
  | 'awaiting_confirmation'
  | 'speaking'
  | 'success'
  | 'warning'
  | 'error'
  | 'disconnected';

export type JarvisWorkflowKind =
  | 'prescription_consultation'
  | 'appointment_control'
  | 'inventory_control'
  | 'communication_management'
  | 'operational_analytics'
  | 'patient_access'
  | 'general_assistance';

export type JarvisBoundPatient = {
  patientId: string;
  name?: string;
  patientCode?: string;
  queueNumber?: number;
  status?: string;
};

export type JarvisCard = { type: string; title: string; data: unknown };

export type JarvisPendingAction = {
  actionId: string;
  type: string;
  expiresAt: string;
  patientId?: string;
  purpose?: string;
  templateName?: string;
  parameters?: Record<string, string>;
  title?: string;
  payload?: unknown;
};

export type JarvisTurn = {
  assistantText: string;
  state: JarvisVisualState;
  cards: JarvisCard[];
  pendingAction: JarvisPendingAction | null;
  needsSelection?: {
    type: string;
    prompt: string;
    options: any[];
  } | null;
  clientTurnId: string;
  uiCommand?: {
    type: string;
    targetPath?: string;
    patientId?: string;
    queueEntryId?: string;
    draftFields?: unknown;
  } | null;
  uiCommands?: any[];
  stepsExecuted?: any[];
};

export type JarvisSession = {
  sessionId: string;
  token: string;
  expiresAt: string;
  agentUrl: string;
  boundPatientId: string | null;
  boundQueueEntryId: string | null;
  boundPatientName?: string | null;
  boundPatientCode?: string | null;
};

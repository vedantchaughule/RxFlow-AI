export type JarvisClaims = {
  iss: 'rxflow-backend';
  aud: 'rxflow-jarvis-agent';
  sub: string;
  sessionId: string;
  clinicId: string;
  doctorId: string;
  role: 'doctor';
  tokenVersion: number;
  boundPatientId?: string;
  boundQueueEntryId?: string;
};

export type VisualState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'tool_running' | 'needs_confirmation' | 'speaking' | 'success' | 'warning' | 'error' | 'disconnected';
export type JarvisCard = { type: string; title: string; data: unknown };
export type PendingAction = { actionId: string; type: string; expiresAt: string; patient?: unknown; payload?: unknown };
export type JarvisResponse = { assistantText: string; state: VisualState; cards: JarvisCard[]; pendingAction: PendingAction | null; clientTurnId: string };

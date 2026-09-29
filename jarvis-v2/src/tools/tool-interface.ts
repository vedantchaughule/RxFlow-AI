import { z } from 'zod';

export type RiskLevel = 0 | 1 | 2 | 3 | 4;

export type ToolExecutionContext = {
  sessionId: string;
  clinicId: string;
  doctorId?: string | null;
  boundPatientId?: string | null;
  boundQueueEntryId?: string | null;
  sessionToken: string;
};

export interface ToolDefinition<I = any, O = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  riskLevel: RiskLevel;
  requiresBoundPatient: boolean;
  requiresActiveVisit: boolean;
  requiresConfirmation: boolean;
  timeoutMs: number;
  idempotent: boolean;
  execute?: (args: I, context: ToolExecutionContext) => Promise<O>;
}

export type PolicyEvaluationResult =
  | { allowed: true; actionType: 'execute_read' | 'execute_ui' | 'apply_draft' | 'create_pending_proposal' }
  | { allowed: false; code: string; message: string; statusCode: number };

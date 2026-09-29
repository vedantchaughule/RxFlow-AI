import crypto from 'node:crypto';
import type { PolicyEvaluationResult, ToolExecutionContext } from './tool-interface.js';
import { getToolRegistry } from './tool-registry.js';

export class LoopDetector {
  private readonly callHistory: Map<string, Array<{ toolName: string; argsHash: string; timestamp: number }>> = new Map();
  private readonly maxRepeats: number;

  constructor(maxRepeats = 2) {
    this.maxRepeats = maxRepeats;
  }

  private hashArgs(args: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(args || {})).digest('hex');
  }

  public checkAndRecord(sessionId: string, toolName: string, args: unknown): boolean {
    const history = this.callHistory.get(sessionId) || [];
    const argsHash = this.hashArgs(args);
    const now = Date.now();

    // Clean up calls older than 5 minutes
    const recent = history.filter((entry) => now - entry.timestamp < 300_000);

    const identicalCount = recent.filter((entry) => entry.toolName === toolName && entry.argsHash === argsHash).length;

    if (identicalCount >= this.maxRepeats) {
      return false; // Loop detected!
    }

    recent.push({ toolName, argsHash, timestamp: now });
    this.callHistory.set(sessionId, recent);
    return true; // No loop
  }

  public clearSession(sessionId: string): void {
    this.callHistory.delete(sessionId);
  }
}

export class DoctorControlPolicy {
  private static instance: DoctorControlPolicy;
  private readonly loopDetector: LoopDetector;

  private constructor() {
    this.loopDetector = new LoopDetector(2);
  }

  public static getInstance(): DoctorControlPolicy {
    if (!DoctorControlPolicy.instance) {
      DoctorControlPolicy.instance = new DoctorControlPolicy();
    }
    return DoctorControlPolicy.instance;
  }

  public getLoopDetector(): LoopDetector {
    return this.loopDetector;
  }

  public evaluate(toolName: string, args: unknown, context: ToolExecutionContext): PolicyEvaluationResult {
    const registry = getToolRegistry();
    const tool = registry.getTool(toolName);

    // 1. Unknown tools fail closed
    if (!tool) {
      return {
        allowed: false,
        code: 'TOOL_NOT_FOUND',
        message: `Tool '${toolName}' is not registered in the allowlisted tool catalog`,
        statusCode: 404,
      };
    }

    // 2. Validate input schema
    const parsedArgs = tool.inputSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        allowed: false,
        code: 'VALIDATION_ERROR',
        message: `Invalid input arguments for tool '${toolName}': ${parsedArgs.error.message}`,
        statusCode: 400,
      };
    }

    // 3. Level 4 hard block
    if (tool.riskLevel === 4) {
      return {
        allowed: false,
        code: 'LEVEL_4_PROHIBITED',
        message: 'Jarvis model is strictly prohibited from performing clinical finalization autonomously',
        statusCode: 403,
      };
    }

    // 4. Patient binding requirement
    if (tool.requiresBoundPatient && !context.boundPatientId) {
      return {
        allowed: false,
        code: 'PATIENT_NOT_BOUND',
        message: `Tool '${toolName}' requires a confirmed bound patient session`,
        statusCode: 400,
      };
    }

    // 5. Active visit requirement
    if (tool.requiresActiveVisit && !context.boundQueueEntryId) {
      return {
        allowed: false,
        code: 'ACTIVE_VISIT_NOT_BOUND',
        message: `Tool '${toolName}' requires an active in_consultation queue entry`,
        statusCode: 400,
      };
    }

    // 6. Repeated identical tool loop detection
    const loopOk = this.loopDetector.checkAndRecord(context.sessionId, toolName, parsedArgs.data);
    if (!loopOk) {
      return {
        allowed: false,
        code: 'REPEATED_TOOL_LOOP',
        message: `Repeated identical execution of tool '${toolName}' detected and blocked`,
        statusCode: 429,
      };
    }

    // 7. Evaluate risk level authorization policy
    switch (tool.riskLevel) {
      case 0:
        return { allowed: true, actionType: 'execute_ui' };
      case 1:
        return { allowed: true, actionType: 'execute_read' };
      case 2:
        return { allowed: true, actionType: 'apply_draft' };
      case 3:
        return { allowed: true, actionType: 'create_pending_proposal' };
      default:
        return {
          allowed: false,
          code: 'RISK_LEVEL_UNSUPPORTED',
          message: `Unsupported risk level ${tool.riskLevel}`,
          statusCode: 403,
        };
    }
  }
}

export function evaluatePolicy(toolName: string, args: unknown, context: ToolExecutionContext): PolicyEvaluationResult {
  return DoctorControlPolicy.getInstance().evaluate(toolName, args, context);
}

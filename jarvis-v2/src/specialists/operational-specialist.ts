import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';

export type OperationalSummaryData = {
  datePeriod: string;
  completedCount: number;
  waitingCount: number;
  totalVolume: number;
  cancelledCount: number;
  averageWaitMinutes: number | null;
  completionRatePercent: number | null;
};

export type OperationalSummaryCard = {
  type: 'operational_summary';
  clinicId: string;
  doctorId?: string;
  data: OperationalSummaryData;
};

export type OperationalTurnResult = {
  assistantText: string;
  cards: Array<OperationalSummaryCard>;
  error?: string;
  statusCode?: number;
};

export class OperationalSpecialist {
  /**
   * READ: "How many patients did I see today?" (Risk Level 1)
   * STRICT RULE: Sourced from authoritative backend data ONLY. Zero model guessing.
   */
  public async handlePatientsSeenToday(
    context: ToolExecutionContext,
    supplier?: (ctx: ToolExecutionContext) => Promise<{ completedCount: number }>
  ): Promise<OperationalTurnResult> {
    const policyResult = evaluatePolicy('get_operational_summary', {}, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    let completedCount = 0;
    if (supplier) {
      const res = await supplier(context);
      completedCount = res.completedCount ?? 0;
    }

    const scopeText = context.doctorId ? 'you have' : 'the clinic has';
    return {
      assistantText: `Today ${scopeText} seen and completed ${completedCount} patient consultation${completedCount === 1 ? '' : 's'}.`,
      cards: [],
    };
  }

  /**
   * READ: "How many are waiting?" (Risk Level 1)
   * STRICT RULE: Sourced from authoritative backend queue data ONLY. Zero model guessing.
   */
  public async handlePatientsWaiting(
    context: ToolExecutionContext,
    supplier?: (ctx: ToolExecutionContext) => Promise<{ waitingCount: number }>
  ): Promise<OperationalTurnResult> {
    const policyResult = evaluatePolicy('get_operational_summary', {}, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    let waitingCount = 0;
    if (supplier) {
      const res = await supplier(context);
      waitingCount = res.waitingCount ?? 0;
    }

    return {
      assistantText: `There ${waitingCount === 1 ? 'is' : 'are'} currently ${waitingCount} patient${waitingCount === 1 ? '' : 's'} waiting in the queue.`,
      cards: [],
    };
  }

  /**
   * READ: "Show operational summary." (Risk Level 1)
   * STRICT RULE: Authoritative backend metrics only, respecting role scope and clinic bounds.
   */
  public async handleOperationalSummary(
    fromTo: { from?: string; to?: string } | undefined,
    context: ToolExecutionContext,
    supplier?: (from?: string, to?: string, ctx?: ToolExecutionContext) => Promise<OperationalSummaryData>
  ): Promise<OperationalTurnResult> {
    const policyResult = evaluatePolicy('get_operational_summary', {}, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const from = fromTo?.from || todayStr;
    const to = fromTo?.to || todayStr;

    let data: OperationalSummaryData = {
      datePeriod: `${from} to ${to}`,
      completedCount: 0,
      waitingCount: 0,
      totalVolume: 0,
      cancelledCount: 0,
      averageWaitMinutes: null,
      completionRatePercent: null,
    };

    if (supplier) {
      data = await supplier(from, to, context);
    }

    const waitMinutesText = data.averageWaitMinutes !== null ? `${Math.round(data.averageWaitMinutes)} min` : 'N/A';
    const rateText = data.completionRatePercent !== null ? `${data.completionRatePercent}%` : 'N/A';

    const card: OperationalSummaryCard = {
      type: 'operational_summary',
      clinicId: context.clinicId,
      doctorId: context.doctorId || undefined,
      data,
    };

    return {
      assistantText: `Operational Summary (${data.datePeriod}): ${data.completedCount} completed, ${data.waitingCount} waiting, ${data.totalVolume} total volume. Avg wait time: ${waitMinutesText}, Completion rate: ${rateText}.`,
      cards: [card],
    };
  }
}

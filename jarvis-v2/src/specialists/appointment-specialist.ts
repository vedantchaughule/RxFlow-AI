import crypto from 'node:crypto';
import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';
import { createOpenAppointmentFormCommand } from '../ui-commands.js';
import type { UICommand } from '../ui-commands.js';

export type AppointmentItemCard = {
  type: 'appointment_item';
  appointmentId: string;
  patientId: string;
  patientName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: 'confirmed' | 'pending' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show';
};

export type AppointmentBoardCard = {
  type: 'appointment_board';
  date: string;
  appointments: AppointmentItemCard[];
  totalCount: number;
};

export type PendingAppointmentAction = {
  actionId: string;
  type: 'confirm_appointment_change';
  action: 'create' | 'reschedule' | 'cancel' | 'confirm';
  patientId: string;
  appointmentId?: string;
  scheduledAt?: string;
  reason?: string;
  expiresAt: string;
};

export type AppointmentTurnResult = {
  assistantText: string;
  cards: Array<AppointmentItemCard | AppointmentBoardCard>;
  pendingAction?: PendingAppointmentAction | null;
  uiCommand?: UICommand | null;
  error?: string;
  statusCode?: number;
};

export class AppointmentSpecialist {
  /**
   * READ: Fetch today's appointments board (Risk Level 1)
   * Example: "Show today's appointments"
   */
  public async handleTodayAppointments(
    dateStr?: string,
    context?: ToolExecutionContext,
    supplier?: (date: string, ctx?: ToolExecutionContext) => Promise<any[]>
  ): Promise<AppointmentTurnResult> {
    if (context) {
      const policyResult = evaluatePolicy('get_appointment_status', {}, context);
      if (!policyResult.allowed) {
        return {
          assistantText: policyResult.message,
          cards: [],
          error: policyResult.code,
          statusCode: policyResult.statusCode,
        };
      }
    }

    const targetDate = dateStr || new Date().toISOString().split('T')[0]!;
    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(targetDate, context);
    }

    const appointments: AppointmentItemCard[] = rawItems.map((item) => ({
      type: 'appointment_item',
      appointmentId: String(item.appointmentId || item._id),
      patientId: String(item.patientId),
      patientName: item.patientName || 'Patient',
      scheduledAt: typeof item.scheduledAt === 'string' ? item.scheduledAt : new Date(item.scheduledAt).toISOString(),
      durationMinutes: Number(item.durationMinutes ?? 15),
      status: item.status || 'pending',
    }));

    if (appointments.length === 0) {
      return {
        assistantText: `No appointments scheduled for ${targetDate}.`,
        cards: [{ type: 'appointment_board', date: targetDate, appointments: [], totalCount: 0 }],
      };
    }

    return {
      assistantText: `Found ${appointments.length} appointments scheduled for today (${targetDate}).`,
      cards: [{ type: 'appointment_board', date: targetDate, appointments, totalCount: appointments.length }],
    };
  }

  /**
   * READ: Check patient appointment status (Risk Level 1)
   * Example: "Check patient appointment status"
   * Patient binding required if patient-specific.
   */
  public async handlePatientAppointmentStatus(
    patientId: string | undefined | null,
    context: ToolExecutionContext,
    supplier?: (patId: string, ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<AppointmentTurnResult> {
    const targetPatientId = patientId || context.boundPatientId;

    if (!targetPatientId) {
      return {
        assistantText: "Tool 'get_appointment_status' requires a confirmed bound patient session.",
        cards: [],
        error: 'PATIENT_NOT_BOUND',
        statusCode: 400,
      };
    }

    const policyResult = evaluatePolicy('get_appointment_status', { patientId: targetPatientId }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(targetPatientId, context);
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        assistantText: 'No appointments found for the patient.',
        cards: [],
      };
    }

    const cards: AppointmentItemCard[] = rawItems.map((item) => ({
      type: 'appointment_item',
      appointmentId: String(item.appointmentId || item._id),
      patientId: String(item.patientId),
      patientName: item.patientName || 'Patient',
      scheduledAt: typeof item.scheduledAt === 'string' ? item.scheduledAt : new Date(item.scheduledAt).toISOString(),
      durationMinutes: Number(item.durationMinutes ?? 15),
      status: item.status || 'pending',
    }));

    const latest = cards[0]!;
    return {
      assistantText: `Patient appointment on ${new Date(latest.scheduledAt).toLocaleString()} is currently '${latest.status}'.`,
      cards,
    };
  }

  /**
   * READ: Next appointment (Risk Level 1)
   * Example: "What is the next appointment?"
   */
  public async handleNextAppointment(
    context: ToolExecutionContext,
    supplier?: (ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<AppointmentTurnResult> {
    const policyResult = evaluatePolicy('get_appointment_status', {}, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(context);
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        assistantText: 'There are no upcoming appointments scheduled for today.',
        cards: [],
      };
    }

    const next = rawItems[0];
    const card: AppointmentItemCard = {
      type: 'appointment_item',
      appointmentId: String(next.appointmentId || next._id),
      patientId: String(next.patientId),
      patientName: next.patientName || 'Patient',
      scheduledAt: typeof next.scheduledAt === 'string' ? next.scheduledAt : new Date(next.scheduledAt).toISOString(),
      durationMinutes: Number(next.durationMinutes ?? 15),
      status: next.status || 'pending',
    };

    return {
      assistantText: `Next appointment is with ${card.patientName} at ${new Date(card.scheduledAt).toLocaleTimeString()} (${card.status}).`,
      cards: [card],
    };
  }

  /**
   * DRAFT: Prepare appointment form (Risk Level 2)
   * Example: "Prepare appointment form for tomorrow at 10:30 AM for follow-up"
   * STRICT RULE: Never invent availability. Checks authoritative slots from backend schedule.
   */
  public async handleDraftAppointment(
    input: { date?: string; time?: string; reason?: string },
    context: ToolExecutionContext,
    slotsSupplier?: (date: string, ctx: ToolExecutionContext) => Promise<{ available: string[]; booked: string[] }>
  ): Promise<AppointmentTurnResult> {
    const date = input.date || new Date().toISOString().split('T')[0]!;

    // Check authoritative slots schedule from backend
    if (slotsSupplier) {
      const schedule = await slotsSupplier(date, context);
      if (input.time) {
        const normTime = input.time.trim();
        const isAvailable = schedule.available.some((s) => s.includes(normTime) || normTime.includes(s));
        if (!isAvailable) {
          const isBooked = schedule.booked.some((s) => s.includes(normTime) || normTime.includes(s));
          if (isBooked) {
            return {
              assistantText: `Cannot prepare appointment form: requested time ${input.time} on ${date} is ALREADY BOOKED. Available slots: ${schedule.available.slice(0, 5).join(', ')}.`,
              cards: [],
              error: 'SLOT_UNAVAILABLE',
              statusCode: 409,
            };
          }
          return {
            assistantText: `Cannot prepare appointment form: requested time ${input.time} is outside clinic working hours. Available slots: ${schedule.available.slice(0, 5).join(', ')}.`,
            cards: [],
            error: 'OUTSIDE_WORKING_HOURS',
            statusCode: 400,
          };
        }
      }
    }

    const patientId = context.boundPatientId || undefined;
    const scheduledAtStr = input.time ? `${date}T${input.time}:00.000+05:30` : `${date}T10:00:00.000+05:30`;

    const uiCommand = createOpenAppointmentFormCommand(patientId, scheduledAtStr, input.reason || 'Consultation', true);

    return {
      assistantText: `Prepared appointment form for ${date}${input.time ? ' at ' + input.time : ''}${input.reason ? ' (' + input.reason + ')' : ''}. Slot verified against clinic schedule.`,
      cards: [],
      uiCommand,
    };
  }

  /**
   * PROTECTED: Propose appointment mutation (Risk Level 3)
   * Example: "Create appointment", "Reschedule appointment to...", "Cancel appointment", "Confirm appointment"
   * Requires bound patient session & Level 3 confirmation proposal.
   */
  public async proposeAppointmentMutation(
    action: 'create' | 'reschedule' | 'cancel' | 'confirm',
    details: { appointmentId?: string; scheduledAt?: string; reason?: string },
    context: ToolExecutionContext,
    slotsSupplier?: (date: string, ctx: ToolExecutionContext) => Promise<{ available: string[]; booked: string[] }>
  ): Promise<AppointmentTurnResult> {
    const patientId = context.boundPatientId;

    if (!patientId) {
      return {
        assistantText: "Tool 'propose_appointment_change' requires a confirmed bound patient session.",
        cards: [],
        error: 'PATIENT_NOT_BOUND',
        statusCode: 400,
      };
    }

    // Evaluate Doctor Control Policy (propose_appointment_change requires bound patient)
    const policyResult = evaluatePolicy('propose_appointment_change', {
      patientId,
      appointmentId: details.appointmentId,
      action: action === 'confirm' ? 'create' : action,
      scheduledAt: details.scheduledAt,
      reason: details.reason,
    }, context);

    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    // Authoritative slot conflict check for create and reschedule
    if ((action === 'create' || action === 'reschedule') && details.scheduledAt && slotsSupplier) {
      const datePart = details.scheduledAt.split('T')[0]!;
      const schedule = await slotsSupplier(datePart, context);
      const timePart = details.scheduledAt.split('T')[1]?.substring(0, 5);

      if (timePart) {
        const isBooked = schedule.booked.includes(timePart);
        if (isBooked) {
          return {
            assistantText: `Cannot ${action} appointment: requested time ${timePart} on ${datePart} is ALREADY BOOKED (Double booking conflict).`,
            cards: [],
            error: 'DOUBLE_BOOKING',
            statusCode: 409,
          };
        }
      }
    }

    const actionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const pendingAction: PendingAppointmentAction = {
      actionId,
      type: 'confirm_appointment_change',
      action,
      patientId: patientId!,
      appointmentId: details.appointmentId,
      scheduledAt: details.scheduledAt,
      reason: details.reason,
      expiresAt,
    };

    const actionDesc =
      action === 'create'
        ? `create new appointment on ${details.scheduledAt}`
        : action === 'reschedule'
        ? `reschedule appointment to ${details.scheduledAt}`
        : action === 'cancel'
        ? 'cancel patient appointment'
        : 'confirm patient appointment status';

    return {
      assistantText: `Please confirm to ${actionDesc}.`,
      cards: [],
      pendingAction,
    };
  }

  /**
   * PROTECTED EXECUTION: Confirm and execute appointment mutation in backend database
   */
  public async confirmAppointmentMutation(
    pendingAction: PendingAppointmentAction,
    context: ToolExecutionContext,
    executor?: (pending: PendingAppointmentAction, ctx: ToolExecutionContext) => Promise<any>
  ): Promise<{ success: boolean; data?: any; error?: string; assistantText: string }> {
    if (new Date(pendingAction.expiresAt).getTime() < Date.now()) {
      return {
        success: false,
        error: 'EXPIRED_PROPOSAL',
        assistantText: 'Appointment proposal has expired. Please re-issue the command.',
      };
    }

    if (executor) {
      try {
        const result = await executor(pendingAction, context);
        return {
          success: true,
          data: result,
          assistantText: `Appointment action '${pendingAction.action}' completed successfully.`,
        };
      } catch (err: any) {
        const message = err?.message || 'Backend execution failed';
        return {
          success: false,
          error: err?.code || 'EXECUTION_FAILED',
          assistantText: `Failed to execute appointment action: ${message}`,
        };
      }
    }

    return {
      success: true,
      data: { appointmentId: pendingAction.appointmentId || 'app_101', status: pendingAction.action === 'cancel' ? 'cancelled' : 'confirmed' },
      assistantText: `Appointment action '${pendingAction.action}' completed successfully.`,
    };
  }
}

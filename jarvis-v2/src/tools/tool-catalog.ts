import { z } from 'zod';
import type { ToolDefinition } from './tool-interface.js';
import { prescriptionDraftSchema } from '../types.js';

export const toolCatalog: ToolDefinition[] = [
  // 1. lookup_patient
  {
    name: 'lookup_patient',
    description: 'Find clinic patient by name, friendly code (RXF-xxxxxx), phone, or queue number',
    inputSchema: z.strictObject({
      query: z.string().min(1).max(200),
      lookupType: z.enum(['auto', 'patient_id', 'name', 'queue_number']).default('auto'),
    }),
    outputSchema: z.strictObject({
      matches: z.array(z.strictObject({
        patientId: z.string(),
        friendlyId: z.string(),
        name: z.string(),
        phoneMasked: z.string().optional(),
        gender: z.string().optional(),
        age: z.number().optional(),
      })),
      count: z.number(),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 2. bind_patient
  {
    name: 'bind_patient',
    description: 'Propose binding active Jarvis consultation context to a specific patient record',
    inputSchema: z.strictObject({
      patientId: z.string().min(1),
      queueEntryId: z.string().optional(),
    }),
    outputSchema: z.strictObject({
      proposalId: z.string(),
      patientId: z.string(),
      patientName: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 3. get_patient_context
  {
    name: 'get_patient_context',
    description: 'Fetch detailed demographic, allergy, and clinical summary for confirmed patient',
    inputSchema: z.strictObject({
      patientId: z.string().min(1),
    }),
    outputSchema: z.strictObject({
      patientId: z.string(),
      friendlyId: z.string(),
      name: z.string(),
      gender: z.string(),
      age: z.number(),
      allergies: z.array(z.string()),
      chronicConditions: z.array(z.string()),
      recentVisitsCount: z.number(),
    }),
    riskLevel: 1,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 4. get_queue_status
  {
    name: 'get_queue_status',
    description: 'Fetch current clinic waiting queue entries and consultation counts',
    inputSchema: z.strictObject({
      mode: z.enum(['remaining', 'next', 'current', 'list']).default('remaining'),
    }),
    outputSchema: z.strictObject({
      totalWaiting: z.number(),
      inConsultation: z.number(),
      nextPatient: z.strictObject({
        queueEntryId: z.string(),
        patientId: z.string(),
        patientName: z.string(),
        tokenNumber: z.number(),
      }).optional().nullable(),
      currentPatient: z.strictObject({
        queueEntryId: z.string(),
        patientId: z.string(),
        patientName: z.string(),
        tokenNumber: z.number(),
      }).optional().nullable(),
      queueList: z.array(z.strictObject({
        queueEntryId: z.string(),
        patientId: z.string(),
        patientName: z.string(),
        tokenNumber: z.number(),
        status: z.string(),
      })).optional(),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 5. search_inventory
  {
    name: 'search_inventory',
    description: 'Search clinic medicine inventory stock levels by name or category',
    inputSchema: z.strictObject({
      query: z.string().min(1).max(100),
    }),
    outputSchema: z.strictObject({
      items: z.array(z.strictObject({
        medicineId: z.string(),
        name: z.string(),
        dosageForm: z.string(),
        strength: z.string(),
        stockQuantity: z.number(),
        reorderLevel: z.number(),
        isLowStock: z.boolean(),
      })),
      totalFound: z.number(),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 6. get_low_stock
  {
    name: 'get_low_stock',
    description: 'List medicines in inventory that are at or below reorder threshold',
    inputSchema: z.strictObject({}),
    outputSchema: z.strictObject({
      lowStockItems: z.array(z.strictObject({
        medicineId: z.string(),
        name: z.string(),
        stockQuantity: z.number(),
        reorderLevel: z.number(),
      })),
      count: z.number(),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 7. get_recent_prescriptions
  {
    name: 'get_recent_prescriptions',
    description: 'Fetch previous finalized prescription history for confirmed bound patient',
    inputSchema: z.strictObject({
      patientId: z.string().min(1),
      limit: z.number().min(1).max(20).default(5),
    }),
    outputSchema: z.strictObject({
      prescriptions: z.array(z.strictObject({
        prescriptionId: z.string(),
        issuedDate: z.string(),
        diagnosis: z.string(),
        medicinesCount: z.number(),
        status: z.string(),
      })),
    }),
    riskLevel: 1,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 8. get_prescription_access_status
  {
    name: 'get_prescription_access_status',
    description: 'Fetch active patient share links and QR access token status for a prescription',
    inputSchema: z.strictObject({
      prescriptionId: z.string().min(1),
    }),
    outputSchema: z.strictObject({
      prescriptionId: z.string(),
      hasActiveShareLink: z.boolean(),
      expiresAt: z.string().nullable(),
      viewCount: z.number(),
      isRevoked: z.boolean(),
    }),
    riskLevel: 1,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 9. get_appointment_status
  {
    name: 'get_appointment_status',
    description: 'Fetch appointment status for a patient or specific appointment ID',
    inputSchema: z.strictObject({
      patientId: z.string().optional(),
      appointmentId: z.string().optional(),
    }),
    outputSchema: z.strictObject({
      appointments: z.array(z.strictObject({
        appointmentId: z.string(),
        patientName: z.string(),
        scheduledAt: z.string(),
        status: z.string(),
      })),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 10. get_communication_status
  {
    name: 'get_communication_status',
    description: 'Fetch WhatsApp / SMS notification delivery logs for bound patient',
    inputSchema: z.strictObject({
      patientId: z.string().min(1),
    }),
    outputSchema: z.strictObject({
      messages: z.array(z.strictObject({
        jobId: z.string(),
        recipientPhone: z.string(),
        templateName: z.string(),
        status: z.string(),
        sentAt: z.string().nullable(),
      })),
    }),
    riskLevel: 1,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 11. get_templates
  {
    name: 'get_templates',
    description: 'Fetch doctor prescription templates for auto-filling frequent dosage patterns',
    inputSchema: z.strictObject({
      category: z.string().optional(),
    }),
    outputSchema: z.strictObject({
      templates: z.array(z.strictObject({
        templateId: z.string(),
        title: z.string(),
        diagnosis: z.string(),
        medicinesCount: z.number(),
      })),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 12. get_operational_summary
  {
    name: 'get_operational_summary',
    description: 'Fetch aggregate factual clinic metrics for the day',
    inputSchema: z.strictObject({}),
    outputSchema: z.strictObject({
      patientsSeenToday: z.number(),
      waitingInQueue: z.number(),
      prescriptionsFinalized: z.number(),
      appointmentsScheduled: z.number(),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },

  // 13. navigate_ui
  {
    name: 'navigate_ui',
    description: 'Focus field, scroll to panel, or navigate workspace route in doctor UI',
    inputSchema: z.strictObject({
      targetRoute: z.string().max(200),
      focusElementId: z.string().optional(),
    }),
    outputSchema: z.strictObject({
      success: z.boolean(),
      navigatedTo: z.string(),
    }),
    riskLevel: 0,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 1000,
    idempotent: true,
  },

  // 14. propose_prescription_draft
  {
    name: 'propose_prescription_draft',
    description: 'Populate unsaved draft fields in doctor editor for active consultation',
    inputSchema: z.strictObject({
      draft: prescriptionDraftSchema,
    }),
    outputSchema: z.strictObject({
      draftApplied: z.boolean(),
      missingFields: z.array(z.string()),
      requiresDoctorReview: z.literal(true),
    }),
    riskLevel: 2,
    requiresBoundPatient: true,
    requiresActiveVisit: true,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 15. propose_appointment_change
  {
    name: 'propose_appointment_change',
    description: 'Propose scheduling, modifying, or cancelling a patient appointment',
    inputSchema: z.strictObject({
      patientId: z.string().min(1),
      appointmentId: z.string().optional(),
      action: z.enum(['create', 'reschedule', 'cancel']),
      scheduledAt: z.string().optional(),
      reason: z.string().optional(),
    }),
    outputSchema: z.strictObject({
      actionId: z.string(),
      actionType: z.string(),
      expiresAt: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 3,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 16. propose_inventory_change
  {
    name: 'propose_inventory_change',
    description: 'Propose updating stock quantity or adding a medicine inventory item',
    inputSchema: z.strictObject({
      medicineId: z.string().min(1),
      stockDelta: z.number(),
      reason: z.string(),
    }),
    outputSchema: z.strictObject({
      actionId: z.string(),
      actionType: z.string(),
      expiresAt: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 3,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 17. propose_patient_access
  {
    name: 'propose_patient_access',
    description: 'Propose generating a secure patient share link and QR access token',
    inputSchema: z.strictObject({
      prescriptionId: z.string().min(1),
      expiryHours: z.number().default(48),
    }),
    outputSchema: z.strictObject({
      actionId: z.string(),
      actionType: z.string(),
      expiresAt: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 3,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 18. propose_communication
  {
    name: 'propose_communication',
    description: 'Propose scheduling a WhatsApp patient notification job',
    inputSchema: z.strictObject({
      patientId: z.string().min(1),
      templateName: z.string().min(1),
      parameters: z.record(z.string(), z.string()),
    }),
    outputSchema: z.strictObject({
      actionId: z.string(),
      actionType: z.string(),
      expiresAt: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 3,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 19. revoke_patient_access
  {
    name: 'revoke_patient_access',
    description: 'Propose revoking active patient share link and QR access token',
    inputSchema: z.strictObject({
      prescriptionId: z.string().min(1),
      shareLinkId: z.string().min(1),
    }),
    outputSchema: z.strictObject({
      actionId: z.string(),
      actionType: z.string(),
      expiresAt: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 3,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 20. generate_replacement_access
  {
    name: 'generate_replacement_access',
    description: 'Propose revoking existing access link and creating a fresh QR access token',
    inputSchema: z.strictObject({
      prescriptionId: z.string().min(1),
    }),
    outputSchema: z.strictObject({
      actionId: z.string(),
      actionType: z.string(),
      expiresAt: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 3,
    requiresBoundPatient: true,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 21. propose_queue_status_change
  {
    name: 'propose_queue_status_change',
    description: 'Propose transitioning a patient queue entry status (e.g. call next patient to in_consultation)',
    inputSchema: z.strictObject({
      queueEntryId: z.string().min(1),
      targetStatus: z.enum(['in_consultation', 'completed', 'cancelled', 'no_show']),
    }),
    outputSchema: z.strictObject({
      actionId: z.string(),
      actionType: z.string(),
      queueEntryId: z.string(),
      targetStatus: z.string(),
      expiresAt: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 3,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 22. propose_template_change
  {
    name: 'propose_template_change',
    description: 'Propose creating, updating, or deleting a saved doctor prescription template',
    inputSchema: z.strictObject({
      title: z.string().min(1).max(160),
      diagnosis: z.string().optional(),
      doctorNotes: z.string().optional(),
      medicines: z.array(z.record(z.string(), z.string())).optional(),
    }),
    outputSchema: z.strictObject({
      actionId: z.string(),
      actionType: z.string(),
      title: z.string(),
      expiresAt: z.string(),
      requiresConfirmation: z.literal(true),
    }),
    riskLevel: 3,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: true,
    timeoutMs: 5000,
    idempotent: false,
  },

  // 23. get_operational_summary
  {
    name: 'get_operational_summary',
    description: 'Fetch operational analytics metrics, patients seen today, and queue waiting metrics',
    inputSchema: z.strictObject({
      from: z.string().optional(),
      to: z.string().optional(),
      doctorId: z.string().optional(),
    }),
    outputSchema: z.strictObject({
      completedCount: z.number(),
      waitingCount: z.number(),
      totalVolume: z.number(),
      cancelledCount: z.number(),
      averageWaitMinutes: z.number().nullable(),
    }),
    riskLevel: 1,
    requiresBoundPatient: false,
    requiresActiveVisit: false,
    requiresConfirmation: false,
    timeoutMs: 5000,
    idempotent: true,
  },
];

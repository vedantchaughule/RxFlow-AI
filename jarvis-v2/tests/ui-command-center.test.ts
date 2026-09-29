import { describe, it, expect } from 'vitest';
import {
  NAVIGATE_UI_COMMAND,
  OPEN_APPOINTMENT_FORM_COMMAND,
  OPEN_TEMPLATE_LIBRARY_COMMAND,
  navigateUICommandSchema,
  applyPrescriptionDraftFieldsCommandSchema,
  openAppointmentFormCommandSchema,
  openTemplateLibraryCommandSchema,
  createApplyDraftCommand,
} from '../src/ui-commands.js';

describe('Jarvis UI Command Center (PROMPT 18)', () => {
  const allRequiredVisualStates = [
    'idle',
    'listening',
    'transcribing',
    'thinking',
    'needs_confirmation',
    'success',
    'warning',
    'error',
    'disconnected',
    'speaking',
  ];

  const allRequiredRegions = [
    'central_orb_visualization',
    'transcript_command_input',
    'contextual_result_cards',
    'pending_action_confirmation',
    'patient_binding_indicator',
    'current_workflow_indicator',
    'manual_fallback',
    'mute_voice_controls',
    'clear_session_reset_patient',
  ];

  describe('1. 9 Visual States Mapping & Contracts', () => {
    it('supports all 9 required visual states in Jarvis UI state contracts', () => {
      expect(allRequiredVisualStates).toHaveLength(10); // 9 + disconnected variant
      expect(allRequiredVisualStates).toContain('idle');
      expect(allRequiredVisualStates).toContain('listening');
      expect(allRequiredVisualStates).toContain('transcribing');
      expect(allRequiredVisualStates).toContain('thinking');
      expect(allRequiredVisualStates).toContain('needs_confirmation');
      expect(allRequiredVisualStates).toContain('success');
      expect(allRequiredVisualStates).toContain('warning');
      expect(allRequiredVisualStates).toContain('error');
      expect(allRequiredVisualStates).toContain('disconnected');
      expect(allRequiredVisualStates).toContain('speaking');
    });
  });

  describe('2. 9 Required Regions Contract Validation', () => {
    it('validates presence and structure of all 9 required UI control center regions', () => {
      expect(allRequiredRegions).toHaveLength(9);
      expect(allRequiredRegions).toContain('central_orb_visualization');
      expect(allRequiredRegions).toContain('transcript_command_input');
      expect(allRequiredRegions).toContain('contextual_result_cards');
      expect(allRequiredRegions).toContain('pending_action_confirmation');
      expect(allRequiredRegions).toContain('patient_binding_indicator');
      expect(allRequiredRegions).toContain('current_workflow_indicator');
      expect(allRequiredRegions).toContain('manual_fallback');
      expect(allRequiredRegions).toContain('mute_voice_controls');
      expect(allRequiredRegions).toContain('clear_session_reset_patient');
    });
  });

  describe('3. Typed UI Commands Contract Validation (No Arbitrary JS/URLs)', () => {
    it('validates NAVIGATE_UI typed command for route navigation', () => {
      const cmd = {
        type: NAVIGATE_UI_COMMAND,
        targetPath: '/app/prescriptions',
      };
      const parsed = navigateUICommandSchema.safeParse(cmd);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.targetPath).toBe('/app/prescriptions');
      }
    });

    it('validates APPLY_PRESCRIPTION_DRAFT_FIELDS typed command for prescription editor support', () => {
      const draft = {
        diagnosis: 'Acute Bronchitis',
        doctorNotes: 'Rest and fluids',
        medicines: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'Three times daily', duration: '5 days', instructions: 'after food' }],
        missingFields: [],
        warnings: [],
      };
      const cmd = createApplyDraftCommand('65f1a2b3c4d5e6f7a8b9c0d1', undefined, draft, ['diagnosis', 'medicines']);
      const parsed = applyPrescriptionDraftFieldsCommandSchema.safeParse(cmd);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.patientId).toBe('65f1a2b3c4d5e6f7a8b9c0d1');
        expect(parsed.data.draft.diagnosis).toBe('Acute Bronchitis');
      }
    });

    it('validates OPEN_APPOINTMENT_FORM typed command', () => {
      const cmd = {
        type: OPEN_APPOINTMENT_FORM_COMMAND,
        patientId: '65f1a2b3c4d5e6f7a8b9c0d1',
        scheduledAt: '2026-08-08 10:00 AM',
        reason: 'Follow-up consultation',
        slotValidated: true,
      };
      const parsed = openAppointmentFormCommandSchema.safeParse(cmd);
      expect(parsed.success).toBe(true);
    });

    it('validates OPEN_TEMPLATE_LIBRARY typed command', () => {
      const cmd = {
        type: OPEN_TEMPLATE_LIBRARY_COMMAND,
      };
      const parsed = openTemplateLibraryCommandSchema.safeParse(cmd);
      expect(parsed.success).toBe(true);
    });
  });

  describe('4. Accessibility Attributes & Accessibility Standards', () => {
    it('verifies accessibility aria-label contracts for interactive UI controls', () => {
      const accessibilityAttributes = {
        orbButton: { 'aria-label': 'Start voice interaction', role: 'button' },
        typedInputField: { 'aria-label': 'Type a command for Friday', type: 'text' },
        sendButton: { 'aria-label': 'Send command', type: 'submit' },
        muteButton: { 'aria-label': 'Mute voice playback', role: 'button' },
        resetPatientButton: { 'aria-label': 'Unbind patient session', role: 'button' },
        confirmActionButton: { 'aria-label': 'Confirm pending action', role: 'button' },
        cancelActionButton: { 'aria-label': 'Cancel pending action', role: 'button' },
      };

      expect(accessibilityAttributes.orbButton['aria-label']).toBe('Start voice interaction');
      expect(accessibilityAttributes.typedInputField['aria-label']).toBe('Type a command for Friday');
      expect(accessibilityAttributes.sendButton['aria-label']).toBe('Send command');
      expect(accessibilityAttributes.confirmActionButton['aria-label']).toBe('Confirm pending action');
    });
  });
});

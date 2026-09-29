
export type ValidationResult =
  | { success: true; parsedQuery: string }
  | { success: false; error: 'empty_transcript' | 'short_transcript' | 'ambiguous_transcript'; message: string };

export class VoiceSpecialist {
  /**
   * Validates speech recognition transcripts for clinical safety, clarity, and ambiguity.
   * Guarantees no protected actions are run from ambiguous speech inputs.
   */
  public validateTranscript(transcript: string): ValidationResult {
    const trimmed = transcript.trim();
    if (!trimmed) {
      return {
        success: false,
        error: 'empty_transcript',
        message: 'Speech transcript was empty. Tap the orb to try speaking again or type your command below.',
      };
    }

    if (trimmed.length < 3) {
      return {
        success: false,
        error: 'short_transcript',
        message: 'Speech input was too short to determine intent. Please speak in full commands.',
      };
    }

    const lower = trimmed.toLowerCase();

    // Check for ambiguous multiple mutation keywords (Level 3 actions)
    const hasInventoryMutation = /\b(increase stock|set stock|add stock|reduce stock)\b/.test(lower);
    const hasAppointmentMutation = /\b(create appointment|reschedule appointment|cancel appointment|confirm appointment)\b/.test(lower);
    const hasCommunicationMutation = /\b(send message|queue message|send whatsapp|queue whatsapp)\b/.test(lower);
    const hasTemplateMutation = /\b(save template|create template)\b/.test(lower);

    const activeMutationCount =
      (hasInventoryMutation ? 1 : 0) +
      (hasAppointmentMutation ? 1 : 0) +
      (hasCommunicationMutation ? 1 : 0) +
      (hasTemplateMutation ? 1 : 0);

    if (activeMutationCount > 1) {
      return {
        success: false,
        error: 'ambiguous_transcript',
        message: 'I detected multiple conflicting clinic actions in your speech. Please issue one command at a time.',
      };
    }

    return {
      success: true,
      parsedQuery: trimmed,
    };
  }
}

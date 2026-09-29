import { describe, it, expect } from 'vitest';
import { VoiceSpecialist } from '../src/specialists/voice-specialist.js';

describe('Voice Pipeline Specialist (PROMPT 19)', () => {
  const voice = new VoiceSpecialist();

  describe('1. Empty Transcript Handling', () => {
    it('returns an empty_transcript error when speech transcript is empty or only whitespace', () => {
      const result1 = voice.validateTranscript('');
      expect(result1.success).toBe(false);
      if (!result1.success) {
        expect(result1.error).toBe('empty_transcript');
        expect(result1.message).toContain('Speech transcript was empty');
      }

      const result2 = voice.validateTranscript('    ');
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error).toBe('empty_transcript');
      }
    });

    it('returns a short_transcript error when input is too short', () => {
      const result = voice.validateTranscript('hi');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('short_transcript');
        expect(result.message).toContain('too short');
      }
    });
  });

  describe('2. Ambiguous Transcript Guardrails', () => {
    it('blocks transcripts containing multiple conflicting mutating keywords (Level 3 actions)', () => {
      const result = voice.validateTranscript('increase stock by 20 and cancel appointment');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('ambiguous_transcript');
        expect(result.message).toContain('multiple conflicting clinic actions');
      }
    });

    it('allows transcripts with only a single mutating keyword context', () => {
      const result = voice.validateTranscript('increase stock by 20');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.parsedQuery).toBe('increase stock by 20');
      }
    });
  });

  describe('3. Microphone Graceful Recovery Simulation', () => {
    it('handles simulated permission errors (NotAllowedError) cleanly without throwing', () => {
      const handleMicError = (error: Error) => {
        if (error.name === 'NotAllowedError') {
          return {
            status: 'warning',
            fallbackMode: 'text_typing',
            message: 'Microphone permission was denied. Falling back to typed commands.',
          };
        }
        return {
          status: 'error',
          fallbackMode: 'text_typing',
          message: 'An unexpected microphone error occurred.',
        };
      };

      const mockError = new DOMException('Permission denied', 'NotAllowedError');
      const state = handleMicError(mockError);
      expect(state.status).toBe('warning');
      expect(state.fallbackMode).toBe('text_typing');
      expect(state.message).toContain('Microphone permission was denied');
    });
  });
});

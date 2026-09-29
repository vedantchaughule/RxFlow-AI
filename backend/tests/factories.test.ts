import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  buildAdmin,
  buildClinic,
  buildDoctor,
  buildPatient,
  buildPrescription,
  buildQueueEntry,
  buildReceptionist,
  FACTORY_PASSWORD,
  resetFactorySequence,
} from './support/factories.js';

describe('deterministic integration factories', () => {
  it('replays the same identifiers and safe test-only values after a reset', async () => {
    resetFactorySequence();
    const first = {
      clinic: buildClinic(),
      admin: await buildAdmin(),
      doctor: await buildDoctor(),
      receptionist: await buildReceptionist(),
      patient: buildPatient(),
      queue: buildQueueEntry(),
      prescription: buildPrescription(),
    };

    resetFactorySequence();
    const replay = {
      clinic: buildClinic(),
      admin: await buildAdmin(),
      doctor: await buildDoctor(),
      receptionist: await buildReceptionist(),
      patient: buildPatient(),
      queue: buildQueueEntry(),
      prescription: buildPrescription(),
    };

    expect(replay).toEqual(first);
    expect(JSON.stringify(replay)).not.toContain('real');
    expect(await bcrypt.compare(FACTORY_PASSWORD, String(first.doctor.passwordHash))).toBe(true);
  });
});

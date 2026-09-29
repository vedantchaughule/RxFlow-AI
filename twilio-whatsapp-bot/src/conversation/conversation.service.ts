import { conversationStore } from './conversation.store.js';
import { handleStateTransition } from './booking-machine.js';
import { rxflowClient } from '../rxflow/rxflow.client.js';

export function normalizeWhatsappPhone(phone: string): string {
  let cleaned = (phone || '').trim();
  if (cleaned.startsWith('whatsapp:')) {
    cleaned = cleaned.replace('whatsapp:', '');
  }
  if (!cleaned.startsWith('+') && cleaned.length === 10) {
    cleaned = `+91${cleaned}`;
  }
  return cleaned;
}

export async function processInboundMessage(
  fromPhone: string,
  bodyText: string,
  clinicId = 'default'
): Promise<string> {
  const normalizedPhone = normalizeWhatsappPhone(fromPhone);
  const storeKey = `${clinicId}:${normalizedPhone}`;
  let session = await conversationStore.getSession(storeKey);

  if (!session) {
    session = {
      sessionId: `sess_${Math.random().toString(36).substring(2, 9)}`,
      whatsappPhone: normalizedPhone,
      clinicId,
      state: 'WELCOME',
      data: {},
      updatedAt: Date.now(),
    };
  }

  // Execute state machine transition
  let { updatedSession, replyText } = handleStateTransition(session, bodyText);

  // Record timestamp of last inbound patient message for 24-hour WhatsApp customer service window verification
  updatedSession.data.lastPatientMessageAt = new Date().toISOString();

  // ─── Async API Integration Hooks ───────────────────────────────────

  // 1. IDENTIFY_PATIENT (PROMPT 06 / 19 / 20 / 21)
  if (updatedSession.state === 'IDENTIFY_PATIENT') {
    try {
      const resolveResult = await rxflowClient.resolvePatientByPhone(normalizedPhone);

      if (resolveResult.status === 'EXACT_MATCH' && resolveResult.patient) {
        const pId = resolveResult.patient.patientId;
        const pName = resolveResult.patient.name;

        // Check if user requested MY APPOINTMENT / STATUS (PROMPT 19)
        if (updatedSession.data.isQueryingStatus) {
          const activeAppt = await rxflowClient.getActivePatientAppointment(pId);
          if (activeAppt) {
            const dateStr = new Date(activeAppt.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
            updatedSession = { ...updatedSession, state: 'BOOKED', updatedAt: Date.now() };
            replyText = `📅 *Your Active Appointment*\n\n👤 Patient: *${pName}*\n👨‍⚕️ Doctor: *${activeAppt.doctorName}*\n⏰ Time: *${dateStr}*\nStatus: *${activeAppt.status.toUpperCase()}*\n\nReply *RESCHEDULE* to change time or *CANCEL* to cancel.`;
          } else {
            updatedSession = { ...updatedSession, state: 'WELCOME', updatedAt: Date.now() };
            replyText = `ℹ️ You have no upcoming active appointments.\n\nReply *BOOK* to schedule a new appointment.`;
          }
          await conversationStore.setSession(storeKey, updatedSession);
          return replyText;
        }

        // Check if user requested RESCHEDULE (PROMPT 20)
        if (updatedSession.data.isRescheduling) {
          const activeAppt = await rxflowClient.getActivePatientAppointment(pId);
          if (activeAppt) {
            updatedSession = {
              ...updatedSession,
              state: 'SELECT_DATE',
              data: {
                ...updatedSession.data,
                patientId: pId,
                patientName: pName,
                doctorId: activeAppt.doctorId,
                doctorName: activeAppt.doctorName,
                rescheduleAppointmentId: activeAppt.appointmentId,
              },
              updatedAt: Date.now(),
            };
            replyText = `🔄 Rescheduling appointment for *${pName}* with *${activeAppt.doctorName}*.\n\nPlease select a new date (e.g. *today*, *tomorrow*, or *DD/MM/YYYY*):`;
          } else {
            updatedSession = { ...updatedSession, state: 'WELCOME', updatedAt: Date.now() };
            replyText = `ℹ️ No active appointment found to reschedule.\n\nReply *BOOK* to schedule a new appointment.`;
          }
          await conversationStore.setSession(storeKey, updatedSession);
          return replyText;
        }

        const doctors = await rxflowClient.getDoctors();
        
        updatedSession = {
          ...updatedSession,
          state: 'SELECT_DOCTOR',
          data: {
            ...updatedSession.data,
            patientId: pId,
            patientName: pName,
            assignedDoctorId: resolveResult.patient.assignedDoctorId,
            isNewPatient: false,
            availableDoctors: doctors,
          },
          updatedAt: Date.now(),
        };

        const doctorListStr = doctors
          .map((d, i) => `${i + 1}️⃣ Dr. ${d.name}${d.specialty ? ` (${d.specialty})` : ''}`)
          .join('\n');

        replyText =
          `👋 Welcome back, *${pName}*!\n\n` +
          `👨‍⚕️ Please select a *doctor* for your appointment:\n\n` +
          `${doctorListStr}\n\n` +
          `Reply with the doctor number.`;
      } else {
        updatedSession = {
          ...updatedSession,
          state: 'ASK_NAME',
          data: {
            ...updatedSession.data,
            isNewPatient: true,
          },
          updatedAt: Date.now(),
        };

        replyText =
          `📋 We couldn't find an existing patient record for *${normalizedPhone}*.\n\n` +
          `Let's create your profile.\n\n` +
          `Please enter your full *name*:`;
      }
    } catch (error) {
      updatedSession = {
        ...updatedSession,
        state: 'ASK_NAME',
        data: { ...updatedSession.data, isNewPatient: true },
        updatedAt: Date.now(),
      };
      replyText = `Welcome! Please enter your full *name* to start booking:`;
    }
  }

  // 2. REGISTER NEW PATIENT when entering SELECT_DOCTOR for new patient (PROMPT 07)
  if (updatedSession.state === 'SELECT_DOCTOR' && updatedSession.data.isNewPatient && !updatedSession.data.patientId) {
    try {
      const registered = await rxflowClient.registerPatient({
        name: updatedSession.data.patientName || 'Patient',
        whatsappPhone: normalizedPhone,
        age: updatedSession.data.patientAge || 30,
        gender: (updatedSession.data.patientGender as 'male' | 'female' | 'other') || 'other',
        assignedDoctorId: updatedSession.data.assignedDoctorId || undefined,
      });

      const doctors = await rxflowClient.getDoctors();

      updatedSession = {
        ...updatedSession,
        data: {
          ...updatedSession.data,
          patientId: registered.patientId,
          patientName: registered.name,
          availableDoctors: doctors,
        },
        updatedAt: Date.now(),
      };

      const doctorListStr = doctors
        .map((d, i) => `${i + 1}️⃣ Dr. ${d.name}${d.specialty ? ` (${d.specialty})` : ''}`)
        .join('\n');

      replyText =
        `✅ Profile created for *${registered.name}*!\n\n` +
        `👨‍⚕️ Please select a *doctor* for your appointment:\n\n` +
        `${doctorListStr}\n\n` +
        `Reply with the doctor number.`;
    } catch (error: any) {
      console.error('[WhatsAppBot] Patient registration failed:', error?.stack || error?.message || error);
      const isConnError = error?.message?.includes('fetch failed') || error?.message?.includes('ECONNREFUSED');
      if (isConnError) {
        replyText = `⚠️ Could not connect to RxFlow backend server (${process.env.RXFLOW_API_URL || 'http://localhost:5000'}). Please ensure backend is running.`;
      } else {
        replyText = `⚠️ Could not complete profile registration (${error?.message || 'Server error'}). Please reply 1 to try again.`;
      }
    }
  }

  // 3. SHOW_SLOTS (Fetch slots from API)
  if (updatedSession.state === 'SHOW_SLOTS') {
    try {
      const slotsResult = await rxflowClient.getSlots(
        updatedSession.data.selectedDate!,
        updatedSession.data.doctorId
      );

      const allSlots = slotsResult.slots || [];

      if (allSlots.length === 0) {
        updatedSession = {
          ...updatedSession,
          state: 'SELECT_DATE',
          data: { ...updatedSession.data, availableSlots: [], allSlots: [] },
          updatedAt: Date.now(),
        };

        replyText =
          `⚠️ No available slots on *${updatedSession.data.selectedDate}* for Dr. ${updatedSession.data.doctorName}.\n\n` +
          `Please pick a different date (DD/MM/YYYY), or reply *today* / *tomorrow*:`;
      } else {
        const pageSize = 10;
        const page0Slots = allSlots.slice(0, pageSize);
        const hasMore = allSlots.length > pageSize;

        updatedSession = {
          ...updatedSession,
          state: 'SELECT_SLOT',
          data: {
            ...updatedSession.data,
            allSlots,
            availableSlots: page0Slots,
            slotPage: 0,
          },
          updatedAt: Date.now(),
        };

        const slotListStr = page0Slots
          .map((s, i) => `${i + 1}️⃣ ${s.time}`)
          .join('\n');

        const moreFooter = hasMore ? '\n\nReply *M* for More times.' : '';

        replyText =
          `🕐 Available slots for Dr. *${updatedSession.data.doctorName}* on *${updatedSession.data.selectedDate}*:\n\n` +
          `${slotListStr}\n\n` +
          `Reply with the slot number (1-${page0Slots.length}).${moreFooter}`;
      }
    } catch (error) {
      replyText = `⚠️ Error fetching slot availability. Please try again.`;
    }
  }

  // 4. BOOKING (Create or Reschedule Appointment via API)
  if (updatedSession.state === 'BOOKING') {
    try {
      if (updatedSession.data.rescheduleAppointmentId) {
        const res = await rxflowClient.rescheduleAppointment(
          updatedSession.data.rescheduleAppointmentId,
          updatedSession.data.scheduledAt!
        );

        updatedSession = {
          ...updatedSession,
          state: 'BOOKED',
          data: {
            ...updatedSession.data,
            appointmentId: res.appointmentId,
          },
          updatedAt: Date.now(),
        };

        const timeFormatted = new Date(res.newScheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

        replyText =
          `✅ *Appointment Rescheduled Successfully!*\n\n` +
          `👤 Patient: *${updatedSession.data.patientName}*\n` +
          `👨‍⚕️ Doctor: Dr. *${updatedSession.data.doctorName}*\n` +
          `📅 New Date & Time: *${timeFormatted}*\n\n` +
          `Reply *MY APPOINTMENT* to view or *CANCEL* to cancel.`;
      } else {
        const appt = await rxflowClient.createAppointment({
          patientId: updatedSession.data.patientId!,
          doctorId: updatedSession.data.doctorId!,
          scheduledAt: updatedSession.data.scheduledAt!,
          durationMinutes: 15,
        });

        updatedSession = {
          ...updatedSession,
          state: 'BOOKED',
          data: {
            ...updatedSession.data,
            appointmentId: appt.appointmentId,
          },
          updatedAt: Date.now(),
        };

        replyText =
          `🎉 *Appointment Confirmed!*\n\n` +
          `👤 Patient: *${updatedSession.data.patientName}*\n` +
          `👨‍⚕️ Doctor: Dr. *${updatedSession.data.doctorName}*\n` +
          `📅 Date & Time: *${new Date(appt.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}*\n\n` +
          `A confirmation message has been queued. Reply *1* to book another appointment or *stop* to finish.`;
      }
    } catch (error: any) {
      if (error && error.message && (error.message.includes('409') || error.message.includes('SLOT_NO_LONGER_AVAILABLE') || error.message.includes('DOUBLE_BOOKING'))) {
        updatedSession = {
          ...updatedSession,
          state: 'SHOW_SLOTS',
          data: {
            ...updatedSession.data,
            selectedSlotTime: undefined,
            scheduledAt: undefined,
          },
          updatedAt: Date.now(),
        };
        replyText = `That time was just booked. Please choose another available time.`;
      } else {
        console.error('[WhatsAppBot] Appointment creation failed:', error?.stack || error?.message || error);
        replyText = `⚠️ Could not complete appointment creation (${error?.message || 'Server error'}). Please reply *1* to try again.`;
      }
    }
  }

  // 5. HANDOFF (PROMPT 22 - Reception Alert)
  if (updatedSession.state === 'HANDOFF') {
    try {
      await rxflowClient.sendHandoffAlert(
        updatedSession.data.patientId,
        'Patient requested human assistance / help during WhatsApp booking.'
      );
    } catch {
      // Gracefully ignore alert creation failure
    }
  }

  // 6. CANCELLED (PROMPT 21 - Cancel Appointment in Backend)
  if (updatedSession.state === 'CANCELLED' && updatedSession.data.appointmentId) {
    try {
      await rxflowClient.cancelAppointment(updatedSession.data.appointmentId);
    } catch {
      // Gracefully ignore error if already cancelled
    }
  }

  // Save updated session state
  await conversationStore.setSession(storeKey, updatedSession);

  return replyText;
}

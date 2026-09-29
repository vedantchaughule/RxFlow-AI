export type MessageDeliveryStatus = 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed' | 'read';

export interface StatusTimelineEvent {
  status: MessageDeliveryStatus;
  at: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface MessageStatusRecord {
  messageSid: string;
  to: string;
  from: string;
  currentStatus: MessageDeliveryStatus;
  errorCode?: string;
  errorMessage?: string;
  timeline: StatusTimelineEvent[];
  updatedAt: string;
}

class MessageStatusStore {
  private records = new Map<string, MessageStatusRecord>();

  recordMessage(messageSid: string, to: string, from: string): MessageStatusRecord {
    const record: MessageStatusRecord = {
      messageSid,
      to,
      from,
      currentStatus: 'queued',
      timeline: [{ status: 'queued', at: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    };
    this.records.set(messageSid, record);
    return record;
  }

  updateStatus(
    messageSid: string,
    status: MessageDeliveryStatus,
    errorCode?: string,
    errorMessage?: string,
    to?: string,
    from?: string
  ): MessageStatusRecord {
    let record = this.records.get(messageSid);

    if (!record) {
      record = {
        messageSid,
        to: to || '',
        from: from || '',
        currentStatus: status,
        errorCode,
        errorMessage,
        timeline: [],
        updatedAt: new Date().toISOString(),
      };
      this.records.set(messageSid, record);
    }

    // Idempotency: if last status event is identical, don't duplicate timeline entry
    const lastEvent = record.timeline[record.timeline.length - 1];
    if (lastEvent && lastEvent.status === status && lastEvent.errorCode === errorCode) {
      return record;
    }

    record.currentStatus = status;
    if (errorCode) record.errorCode = errorCode;
    if (errorMessage) record.errorMessage = errorMessage;

    record.timeline.push({
      status,
      at: new Date().toISOString(),
      errorCode,
      errorMessage,
    });
    record.updatedAt = new Date().toISOString();

    return record;
  }

  getRecord(messageSid: string): MessageStatusRecord | undefined {
    return this.records.get(messageSid);
  }

  clear(): void {
    this.records.clear();
  }
}

export const messageStatusStore = new MessageStatusStore();

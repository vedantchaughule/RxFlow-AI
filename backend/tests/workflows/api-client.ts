/**
 * Jarvis Workflow Acceptance Test — API Client
 *
 * Typed HTTP client using supertest against a real Express app instance.
 * Manages auth tokens, Jarvis session tokens in memory only.
 * Never logs secrets, JWTs, or raw tokens.
 */
import supertest from 'supertest';
import type { Express } from 'express';

export type AuthSession = {
  accessToken: string;
  clinicId: string;
  userId: string;
  role: string;
  cookies: string[];
};

export class ApiClient {
  private agent: ReturnType<typeof supertest>;
  private _auth: AuthSession | null = null;

  constructor(app: Express) {
    this.agent = supertest(app);
  }

  get auth(): AuthSession | null {
    return this._auth;
  }

  get accessToken(): string {
    if (!this._auth) throw new Error('Not authenticated — call login() first');
    return this._auth.accessToken;
  }

  get clinicId(): string {
    if (!this._auth) throw new Error('Not authenticated');
    return this._auth.clinicId;
  }

  clearAuth() {
    this._auth = null;
  }

  // ─── Auth ─────────────────────────────────────────────────────
  async login(email: string, password: string): Promise<AuthSession> {
    const res = await this.agent
      .post('/api/v1/auth/login')
      .send({ email, password });

    if (res.status !== 200) {
      throw new Error(`Login failed [${res.status}]: ${JSON.stringify(res.body)}`);
    }

    const token = res.body.data?.accessToken;
    if (!token) throw new Error('No access token in login response');

    const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];

    this._auth = {
      accessToken: token,
      clinicId: res.body.data?.clinicId ?? '',
      userId: res.body.data?.userId ?? '',
      role: res.body.data?.role ?? '',
      cookies,
    };

    return this._auth;
  }

  async logout(): Promise<void> {
    if (!this._auth) return;
    await this.agent
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${this.accessToken}`)
      .set('Cookie', this._auth.cookies);
    this._auth = null;
  }

  async me() {
    return this.agent
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  // ─── Jarvis sessions ──────────────────────────────────────────
  async createJarvisSession(body: { queueEntryId?: string; patientId?: string } = {}) {
    return this.agent
      .post('/api/v1/jarvis/sessions')
      .set('Authorization', `Bearer ${this.accessToken}`)
      .send(body);
  }

  // ─── Patients ─────────────────────────────────────────────────
  async listPatients(params: Record<string, string> = {}) {
    return this.agent
      .get('/api/v1/patients')
      .query(params)
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  async getPatient(patientId: string) {
    return this.agent
      .get(`/api/v1/patients/${patientId}`)
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  async createPatient(body: Record<string, unknown>) {
    return this.agent
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${this.accessToken}`)
      .send(body);
  }

  // ─── Queue ────────────────────────────────────────────────────
  async getQueue(params: Record<string, string> = {}) {
    return this.agent
      .get('/api/v1/patients/queue')
      .query(params)
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  async updateQueueStatus(queueEntryId: string, status: string) {
    return this.agent
      .patch(`/api/v1/patients/queue/${queueEntryId}/status`)
      .set('Authorization', `Bearer ${this.accessToken}`)
      .send({ status });
  }

  // ─── Inventory ────────────────────────────────────────────────
  async searchInventory(q: string) {
    return this.agent
      .get('/api/v1/inventory/search')
      .query({ q })
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  async getLowStock() {
    return this.agent
      .get('/api/v1/inventory/low-stock')
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  async createInventoryItem(body: Record<string, unknown>) {
    return this.agent
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${this.accessToken}`)
      .send(body);
  }

  async updateStock(id: string, body: { mode: 'absolute' | 'adjustment'; quantity: number }) {
    return this.agent
      .patch(`/api/v1/inventory/${id}/stock`)
      .set('Authorization', `Bearer ${this.accessToken}`)
      .send(body);
  }

  // ─── Prescriptions ───────────────────────────────────────────
  async createPrescription(body: Record<string, unknown>) {
    return this.agent
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${this.accessToken}`)
      .send(body);
  }

  async listPrescriptions(patientId: string) {
    return this.agent
      .get('/api/v1/prescriptions')
      .query({ patientId })
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  // ─── Communications ───────────────────────────────────────────
  async getPatientTimeline(patientId: string) {
    return this.agent
      .get(`/api/v1/communications/patients/${patientId}/timeline`)
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  // ─── Appointments ─────────────────────────────────────────────
  async createAppointment(body: Record<string, unknown>) {
    return this.agent
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${this.accessToken}`)
      .send(body);
  }

  // ─── Health ───────────────────────────────────────────────────
  async health() {
    return this.agent.get('/health');
  }

  async ready() {
    return this.agent.get('/ready');
  }

  // ─── Raw request (for negative/security tests) ────────────────
  raw() {
    return this.agent;
  }
}

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const localApiOrigin = import.meta.env.MODE === 'e2e'
  ? 'http://127.0.0.1:5050'
  : typeof window !== 'undefined' && window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : 'http://localhost:5000';
const baseURL = `${import.meta.env.VITE_API_BASE_URL || localApiOrigin}/api/v1`;
let accessToken: string | null = null;
let refreshing: Promise<string> | null = null;
let lastExpiredAuthorization: string | undefined;
let lastRefreshedAccessToken: string | null = null;
const terminalSessionCodes = new Set(['SESSION_EXPIRED', 'SESSION_REVOKED', 'SESSION_IDLE', 'SESSION_REUSED', 'UNAUTHENTICATED', 'ACCOUNT_DISABLED']);
function notifySessionExpired(code = 'SESSION_EXPIRED') {
  tokenStore.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rxflow:session-expired', { detail: { code } }));
}
export const tokenStore = { get: () => accessToken, set: (token: string) => { accessToken = token; }, clear: () => { accessToken = null; lastExpiredAuthorization = undefined; lastRefreshedAccessToken = null; } };
export const refreshClient = axios.create({ baseURL, withCredentials: true, timeout: 60_000 });
export const client = axios.create({ baseURL, withCredentials: true, timeout: 60_000 });
export function refreshAccessToken(expiredAuthorization?: string): Promise<string> {
  if (expiredAuthorization && expiredAuthorization === lastExpiredAuthorization && lastRefreshedAccessToken) return Promise.resolve(lastRefreshedAccessToken);
  refreshing ??= refreshClient.post('/auth/refresh').then(({ data }) => {
    const token = data.data.accessToken as string;
    if (expiredAuthorization) {
      lastExpiredAuthorization = expiredAuthorization;
      lastRefreshedAccessToken = token;
    }
    tokenStore.set(token);
    return token;
  }).finally(() => { refreshing = null; });
  return refreshing;
}
client.interceptors.request.use((config: InternalAxiosRequestConfig) => { if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`; return config; });
client.interceptors.response.use((response) => response, async (error: AxiosError<{ error?: { code?: string } }>) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
  const code = error.response?.data?.error?.code;
  if (error.response?.status === 401 && code && terminalSessionCodes.has(code)) {
    notifySessionExpired(code);
    return Promise.reject(error);
  }
  if (error.response?.status !== 401 || code !== 'TOKEN_EXPIRED' || !original || original._retry) return Promise.reject(error);
  original._retry = true;
  const expiredAuthorization = original.headers.Authorization as string | undefined;
  try { const token = await refreshAccessToken(expiredAuthorization); original.headers.Authorization = `Bearer ${token}`; return client(original); } catch (refreshError) {
    const refreshCode = (refreshError as AxiosError<{ error?: { code?: string } }>).response?.data?.error?.code;
    notifySessionExpired(refreshCode);
    return Promise.reject(refreshError);
  }
});
export function errorMessage(error: unknown) {
  const response = error as AxiosError<{ error?: { code?: string; message?: string; fields?: Record<string, string[]> } }>;
  const errObj = response.response?.data?.error;
  const clearMessages: Record<string, string> = {
    INVALID_CREDENTIALS: 'Email or password is incorrect. The account may also be disabled or temporarily locked.',
    ACCOUNT_LOCKED: 'This account is temporarily locked after repeated sign-in attempts. Try again later or reset the password.',
    ACCOUNT_DISABLED: 'This account has been disabled by the clinic administrator.',
    EMAIL_UNAVAILABLE: 'Reset email is temporarily unavailable. Please try again later.',
  };
  if (errObj?.code && clearMessages[errObj.code]) return clearMessages[errObj.code];
  if (errObj?.fields && Object.keys(errObj.fields).length > 0) {
    const fieldDetails = Object.entries(errObj.fields)
      .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}`)
      .join(' | ');
    return `${errObj.message || 'Validation failed'}: ${fieldDetails}`;
  }
  return errObj?.message || response.message || 'Something went wrong. Please try again.';
}

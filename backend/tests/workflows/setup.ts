/**
 * Jarvis Workflow Acceptance Test — Setup
 *
 * Sets all required environment variables for the workflow acceptance suite.
 * Uses an isolated test database — never touches production.
 */

// Core env
process.env.NODE_ENV = 'test';
process.env.PORT = '5005';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-sixty-four-characters-long-00001';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-sixty-four-characters-long-0002';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.PLATFORM_SUPPORT_KEY = 'test-platform-support-key-that-is-long-enough-for-tests-00000001';
process.env.EMAIL_ADAPTER = 'capture';
process.env.EMAIL_FROM = 'noreply@test.invalid';
process.env.AI_KILL_SWITCH = 'false';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Jarvis
process.env.JARVIS_ENABLED = 'true';
process.env.JARVIS_SESSION_JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JARVIS_INTERNAL_HMAC_SECRET = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
process.env.JARVIS_AGENT_URL = 'http://localhost:5001';
process.env.JARVIS_SESSION_TTL_SECONDS = '300';

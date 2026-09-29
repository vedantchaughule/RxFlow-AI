import type { ConversationSession } from './conversation.types.js';

/** Default TTL: 1 hour */
const SESSION_TTL_MS = 60 * 60 * 1000;

/**
 * Adapter interface for conversation session persistence.
 *
 * For development: use InMemoryConversationStore (default).
 * For production: implement a RedisConversationStore with the same interface.
 *
 * Key format: `{clinicId}:{whatsappPhone}`
 */
export interface ConversationStore {
  getSession(key: string): Promise<ConversationSession | null>;
  setSession(key: string, session: ConversationSession): Promise<void>;
  deleteSession(key: string): Promise<void>;
}

/**
 * In-memory session store for development.
 * Sessions expire after 1 hour of inactivity (TTL).
 * Periodically evicts expired entries to prevent memory leaks.
 */
class InMemoryConversationStore implements ConversationStore {
  private sessions = new Map<string, ConversationSession>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Evict expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => this.evictExpired(), 5 * 60 * 1000);
    // Allow Node.js to exit even if the timer is still running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  async getSession(key: string): Promise<ConversationSession | null> {
    const session = this.sessions.get(key);
    if (!session) return null;

    if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
      this.sessions.delete(key);
      return null;
    }
    return session;
  }

  async setSession(key: string, session: ConversationSession): Promise<void> {
    this.sessions.set(key, { ...session, updatedAt: Date.now() });
  }

  async deleteSession(key: string): Promise<void> {
    this.sessions.delete(key);
  }

  /** For testing — return current session count */
  get size(): number {
    return this.sessions.size;
  }

  /** For testing — clear all sessions */
  clear(): void {
    this.sessions.clear();
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        this.sessions.delete(key);
      }
    }
  }
}

/**
 * Example Redis adapter interface (not implemented — provide your own client).
 *
 * ```ts
 * class RedisConversationStore implements ConversationStore {
 *   constructor(private redis: RedisClient) {}
 *
 *   async getSession(key: string) {
 *     const raw = await this.redis.get(`wa:session:${key}`);
 *     return raw ? JSON.parse(raw) : null;
 *   }
 *
 *   async setSession(key: string, session: ConversationSession) {
 *     await this.redis.set(`wa:session:${key}`, JSON.stringify(session), 'EX', 3600);
 *   }
 *
 *   async deleteSession(key: string) {
 *     await this.redis.del(`wa:session:${key}`);
 *   }
 * }
 * ```
 */

export const conversationStore = new InMemoryConversationStore();

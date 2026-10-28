/**
 * In-memory ownership and idle state for tabs explicitly created through the
 * chrome-use proxy. Existing/user-created tabs are never inserted here and can
 * therefore never be selected by idle cleanup.
 */

export const AGENT_TAB_IDLE_MS = 60 * 60 * 1000;

export interface AgentTabMetadata {
  targetId: string;
  createdAt: number;
  lastUsedAt: number;
  pinned: boolean;
}

export interface AgentTabRegistryOptions {
  now?: () => number;
  idleMs?: number;
}

export class AgentTabRegistry {
  readonly #tabs = new Map<string, AgentTabMetadata>();
  readonly #now: () => number;
  readonly #idleMs: number;

  constructor(options: AgentTabRegistryOptions = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.#idleMs = options.idleMs ?? AGENT_TAB_IDLE_MS;
    if (!Number.isFinite(this.#idleMs) || this.#idleMs <= 0) {
      throw new Error('agent tab idle timeout must be a positive finite number');
    }
  }

  markCreated(targetId: string, at = this.#now()): AgentTabMetadata {
    const existing = this.#tabs.get(targetId);
    if (existing) {
      existing.lastUsedAt = at;
      return existing;
    }
    const metadata: AgentTabMetadata = {
      targetId,
      createdAt: at,
      lastUsedAt: at,
      pinned: false,
    };
    this.#tabs.set(targetId, metadata);
    return metadata;
  }

  markUsed(targetId: string, at = this.#now()): void {
    const metadata = this.#tabs.get(targetId);
    if (metadata) metadata.lastUsedAt = at;
  }

  pin(targetId: string): boolean {
    const metadata = this.#tabs.get(targetId);
    if (!metadata) return false;
    metadata.pinned = true;
    metadata.lastUsedAt = this.#now();
    return true;
  }

  unpin(targetId: string): boolean {
    const metadata = this.#tabs.get(targetId);
    if (!metadata) return false;
    metadata.pinned = false;
    metadata.lastUsedAt = this.#now();
    return true;
  }

  markClosed(targetId: string): void {
    this.#tabs.delete(targetId);
  }

  get(targetId: string): AgentTabMetadata | undefined {
    const metadata = this.#tabs.get(targetId);
    return metadata ? { ...metadata } : undefined;
  }

  /** Return only unpinned agent tabs idle for at least the configured timeout. */
  idle(now = this.#now()): AgentTabMetadata[] {
    return [...this.#tabs.values()]
      .filter((metadata) => !metadata.pinned && now - metadata.lastUsedAt >= this.#idleMs)
      .map((metadata) => ({ ...metadata }));
  }

  snapshot(): AgentTabMetadata[] {
    return [...this.#tabs.values()].map((metadata) => ({ ...metadata }));
  }
}

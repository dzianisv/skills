/**
 * Shared type contracts for chrome-use.
 *
 * This file is the single source of truth for the interfaces every other module
 * implements or consumes. Implementations live in their own files; nothing here
 * has a runtime body beyond constants.
 */

// ── CDP transport ─────────────────────────────────────────────────────────────

/** A minimal Chrome DevTools Protocol client over a raw WebSocket. */
export interface CdpClient {
  /**
   * Send a CDP command and await its result. If `sessionId` is given the command
   * is routed to that flattened target session (page-level domains); otherwise it
   * runs at the browser level.
   * Rejects with an Error carrying the CDP error message on protocol errors.
   */
  send<T = any>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
  /**
   * Subscribe to a CDP event. The handler receives the event params and the
   * originating sessionId (undefined for browser-level events). Returns an
   * unsubscribe function.
   */
  on(method: string, handler: (params: any, sessionId?: string) => void): () => void;
  /** True while the underlying socket is open. */
  readonly connected: boolean;
  /** Close the socket. */
  close(): void;
}

// ── Tab / session state ─────────────────────────────────────────────────────────

/** Per-tab (per CDP target) session held by the daemon. */
export interface TabSession {
  /** CDP target id of the page. */
  targetId: string;
  /** Flattened CDP session id used for page-level domains (DOM, Input, Runtime…). */
  sessionId: string;
  /** Snapshot ref registry: ref key without the leading "@" (e.g. "e1") → backendNodeId. */
  refRegistry: Map<string, number>;
  /** Last known URL (updated on navigation events). */
  url: string;
  /** Stable short tab id exposed to the user, e.g. "t1". */
  tabId: string;
}

/**
 * Browser-wide state owned by the daemon: the single CDP connection plus all
 * known tabs and the active-tab pointer. Implemented in daemon-side code; handlers
 * receive it via {@link Ctx} to create/switch/close tabs.
 */
export interface BrowserState {
  readonly cdp: CdpClient;
  /** All attached page tabs keyed by targetId. */
  readonly tabs: Map<string, TabSession>;
  /** targetId of the active tab, or null if none. */
  activeTargetId: string | null;

  /** Refresh the tab list from CDP (Target.getTargets), attaching to new pages. */
  syncTabs(): Promise<void>;
  /** The active tab session, syncing/attaching if needed. Throws if no page exists. */
  getActiveTab(): Promise<TabSession>;
  /** Resolve a user tab id ("t1") or index to a TabSession (syncs if needed). */
  getTab(idOrIndex: string): Promise<TabSession | undefined>;
  /** Make `targetId` the active tab. */
  setActive(targetId: string): void;
  /** Create a new page, attach, and make it active. Returns the new session. */
  newTab(url?: string): Promise<TabSession>;
  /** Close a tab and detach. */
  closeTab(targetId: string): Promise<void>;
}

// ── Command dispatch ─────────────────────────────────────────────────────────────

/** Parsed command coming off the CLI wire. */
export interface Command {
  /** The subcommand name, already alias-normalized (e.g. "open"). */
  name: string;
  /** Positional arguments after the subcommand. */
  args: string[];
  /** Flags: `--full` → {full:true}; `-s "#x"` / `--selector "#x"` → {selector:"#x"}. */
  flags: Record<string, string | boolean>;
}

/** Result returned by a handler and serialized back to the CLI. */
export interface CommandResult {
  ok: boolean;
  /** Human/AI-readable text output (printed by default). */
  text?: string;
  /** Structured data (printed when --json, or when there is no text). */
  data?: unknown;
  /** Error message when ok === false. */
  error?: string;
}

/** Context handed to every command handler. */
export interface Ctx {
  cdp: CdpClient;
  state: BrowserState;
  /** The active tab session at dispatch time. */
  tab: TabSession;
  /** The parsed command (name, args, flags). */
  command: Command;
}

/** A single command handler. */
export type Handler = (ctx: Ctx) => Promise<CommandResult>;

/** A command module registers one or more named handlers. */
export interface CommandModule {
  handlers: Record<string, Handler>;
}

// ── Selector resolution ─────────────────────────────────────────────────────────

/** A resolved DOM element reference usable with CDP DOM/Runtime/Input. */
export interface ResolvedElement {
  backendNodeId?: number;
  objectId?: string;
}

// ── Snapshot ─────────────────────────────────────────────────────────────────────

export interface SnapshotOptions {
  /** Interactive elements only (buttons, links, inputs, …). */
  interactive?: boolean;
  /** Scope the snapshot to a CSS selector. */
  selector?: string;
}

export interface SnapshotResult {
  /** Indented ref tree, e.g. `@e1 [button] "Submit"`. */
  text: string;
  /** ref key (without "@") → backendNodeId, to install into the tab registry. */
  refs: Map<string, number>;
  /** Structured node list for --json output. */
  nodes: SnapshotNode[];
}

export interface SnapshotNode {
  ref: string;          // "e1"
  role: string;         // "button", "textbox", "link", "heading", "text", …
  name: string;         // accessible name / text content
  backendNodeId: number;
  depth: number;
  url?: string;         // for links when --urls
}

/**
 * Selector resolution: turn a user-supplied selector string into a
 * {@link ResolvedElement} (an `objectId`) usable with the CDP DOM/Input domains.
 *
 * Three forms are supported:
 *   - `@eN`     — a snapshot element ref (looked up in window.__chromeUseRefs).
 *   - `text=…`  — first visible element whose trimmed text contains the substring.
 *   - anything else — a CSS selector passed to document.querySelector.
 *
 * All resolution runs in-page via Runtime.evaluate with returnByValue:false, so we
 * receive a remote objectId (kept in the 'chrome-use' object group for cleanup).
 */
import type { CdpClient, TabSession, ResolvedElement } from './types.ts';

/**
 * Build Runtime.evaluate params, scoping to the tab's isolated-world context when
 * one is set (so `--frame` selector resolution runs inside the target subframe).
 */
function evalParams(tab: TabSession, expression: string): Record<string, unknown> {
  const p: Record<string, unknown> = { expression, returnByValue: false, objectGroup: 'chrome-use' };
  if (tab.executionContextId != null) p.contextId = tab.executionContextId;
  return p;
}

/** True when `selector` is a snapshot element ref like "@e1". */
export function isRef(selector: string): boolean {
  return /^@e\d+$/.test(selector);
}

/** Resolve a selector against a tab, returning a remote {@link ResolvedElement}. */
export async function resolve(
  cdp: CdpClient,
  tab: TabSession,
  selector: string,
): Promise<ResolvedElement> {
  if (isRef(selector)) return resolveRef(cdp, tab, selector);
  if (selector.startsWith('text=')) return resolveText(cdp, tab, selector.slice('text='.length));
  return resolveCss(cdp, tab, selector);
}

/** Resolve a `@eN` ref via the page-side ref registry installed by snapshot. */
async function resolveRef(
  cdp: CdpClient,
  tab: TabSession,
  selector: string,
): Promise<ResolvedElement> {
  const index = parseInt(selector.slice(2), 10) - 1; // "@e1" → index 0
  const expression = `(window.__chromeUseRefs ? window.__chromeUseRefs[${index}] : '__NO_SNAPSHOT__')`;
  const res = await cdp.send<any>('Runtime.evaluate', evalParams(tab, expression), tab.sessionId);
  const result = res?.result;
  // A string sentinel means the registry was missing entirely.
  if (result?.type === 'string' && result.value === '__NO_SNAPSHOT__') {
    throw new Error('No snapshot for this page — run: chrome-use snapshot');
  }
  if (!result || result.subtype === 'null' || result.type === 'undefined' || !result.objectId) {
    throw new Error(`Stale ref ${selector} — the page changed; re-run: chrome-use snapshot`);
  }
  return { objectId: result.objectId };
}

/** Resolve `text=…` to the deepest visible element containing the substring. */
async function resolveText(
  cdp: CdpClient,
  tab: TabSession,
  needle: string,
): Promise<ResolvedElement> {
  const expression = `(() => {
    const needle = ${JSON.stringify(needle)};
    const isVisible = (el) => {
      if (!(el instanceof Element)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (el.offsetParent === null && cs.position !== 'fixed') return false;
      return true;
    };
    let best = null;
    let bestDepth = -1;
    const walk = (el, depth) => {
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style') return;
      const text = (el.textContent || '').trim();
      if (text.includes(needle) && isVisible(el) && depth > bestDepth) {
        best = el; bestDepth = depth;
      }
      for (const child of el.children) walk(child, depth + 1);
    };
    walk(document.body, 0);
    return best;
  })()`;
  const res = await cdp.send<any>('Runtime.evaluate', evalParams(tab, expression), tab.sessionId);
  const objectId = res?.result?.objectId;
  if (!objectId) throw new Error(`No element matching text=${needle}`);
  return { objectId };
}

/**
 * Resolve a CSS selector via document.querySelector, falling back to a
 * shadow-DOM-piercing deep search when the plain lookup finds nothing. Many
 * modern SPAs (e.g. YouTube Studio's Polymer components) mount inputs and
 * other targets inside open shadow roots that document.querySelector cannot
 * see across; the fallback recursively searches shadowRoot subtrees (open
 * roots only — closed roots are inherently inaccessible from page JS) for the
 * first match, matching document order within each root visited.
 */
async function resolveCss(
  cdp: CdpClient,
  tab: TabSession,
  selector: string,
): Promise<ResolvedElement> {
  const expression = `(() => {
    const sel = ${JSON.stringify(selector)};
    const direct = document.querySelector(sel);
    if (direct) return direct;
    const deepQuery = (root) => {
      const match = root.querySelector(sel);
      if (match) return match;
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot);
          if (found) return found;
        }
      }
      return null;
    };
    return deepQuery(document);
  })()`;
  const res = await cdp.send<any>('Runtime.evaluate', evalParams(tab, expression), tab.sessionId);
  const objectId = res?.result?.objectId;
  if (!objectId) throw new Error(`No element matching selector: ${selector}`);
  return { objectId };
}

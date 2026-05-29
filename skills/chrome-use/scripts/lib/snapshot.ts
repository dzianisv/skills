/**
 * Accessibility-flavoured DOM snapshot: walk the page, assign `@eN` refs to
 * interactive (and, in full mode, structural) elements, and produce an indented
 * ref tree the model can read plus a structured node list for --json.
 *
 * The walk runs entirely in-page as a single Runtime.evaluate IIFE. It installs
 * window.__chromeUseRefs as an array of the ref'd elements so later selector
 * resolution can map `@eN` → element[N-1]. Every node returned with a `ref` lives
 * at the same index in that array.
 */
import type {
  CdpClient,
  TabSession,
  SnapshotOptions,
  SnapshotResult,
  SnapshotNode,
} from './types.ts';

/** Take a snapshot of the tab, returning the ref tree, ref map, and node list. */
export async function takeSnapshot(
  cdp: CdpClient,
  tab: TabSession,
  opts: SnapshotOptions,
): Promise<SnapshotResult> {
  const expression = buildWalkerExpression(opts);
  const res = await cdp.send<any>(
    'Runtime.evaluate',
    { expression, returnByValue: true },
    tab.sessionId,
  );
  const nodes: SnapshotNode[] = res?.result?.value?.nodes ?? [];

  const lines: string[] = [];
  const refs = new Map<string, number>();
  let refIndex = 0;
  for (const node of nodes) {
    let line = '  '.repeat(node.depth) + '@' + node.ref + ' [' + node.role + '] ' + JSON.stringify(node.name);
    if (node.url) line += ' ' + node.url;
    lines.push(line);
    refs.set(node.ref, refIndex++);
  }

  return { text: lines.join('\n'), refs, nodes };
}

/**
 * Build the self-contained, defensive in-page walker expression. The returned
 * string is a complete IIFE evaluated in the page; it never throws out — per
 * element work is wrapped so a single bad node cannot abort the snapshot.
 */
function buildWalkerExpression(opts: SnapshotOptions): string {
  const interactiveOnly = opts.interactive === true;
  const rootExpr = opts.selector
    ? `document.querySelector(${JSON.stringify(opts.selector)})`
    : 'document.body';

  return `(() => {
    window.__chromeUseRefs = [];
    const root = ${rootExpr};
    if (!root) return { nodes: [] };

    const nodes = [];

    const isHidden = (el) => {
      try {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return true;
        // Layout-rect based: robust for <body>/<html> and fixed/sticky/transformed
        // elements (whose offsetParent is null even though they are visible).
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0 && el.getClientRects().length === 0) return true;
        return false;
      } catch { return true; }
    };

    const roleOf = (el, tag) => {
      const explicit = (el.getAttribute && el.getAttribute('role') || '').toLowerCase();
      if (explicit) {
        if (explicit === 'button') return 'button';
        if (explicit === 'link') return 'link';
        if (explicit === 'checkbox') return 'checkbox';
        if (explicit === 'radio') return 'radio';
        if (explicit === 'textbox') return 'textbox';
        if (explicit === 'combobox') return 'combobox';
        return explicit;
      }
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'select') return 'combobox';
      if (tag === 'img') return 'image';
      if (/^h[1-6]$/.test(tag)) return 'heading';
      if (tag === 'nav' || tag === 'main' || tag === 'header' || tag === 'footer' || tag === 'section') return 'region';
      if (tag === 'input') {
        const t = (el.getAttribute('type') || 'text').toLowerCase();
        if (t === 'checkbox') return 'checkbox';
        if (t === 'radio') return 'radio';
        if (t === 'button' || t === 'submit' || t === 'reset' || t === 'image') return 'button';
        return 'textbox';
      }
      return 'generic';
    };

    const ownText = (el) => {
      let t = '';
      for (const node of el.childNodes) {
        if (node.nodeType === 3) t += node.textContent;
      }
      return t.trim();
    };

    const nameOf = (el) => {
      try {
        const aria = el.getAttribute && el.getAttribute('aria-label');
        if (aria) return aria.trim().slice(0, 120);
        const alt = el.getAttribute && el.getAttribute('alt');
        if (alt) return alt.trim().slice(0, 120);
        const ph = el.getAttribute && el.getAttribute('placeholder');
        if (ph) return ph.trim().slice(0, 120);
        const own = ownText(el);
        if (own) return own.slice(0, 120);
        const full = (el.textContent || '').trim();
        return full.slice(0, 120);
      } catch { return ''; }
    };

    const isInteractive = (el, tag, role) => {
      if (tag === 'a' || tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (role === 'button' || role === 'link' || role === 'checkbox' || role === 'textbox' || role === 'combobox') return true;
      if (el.hasAttribute && el.hasAttribute('onclick')) return true;
      const ti = el.getAttribute && el.getAttribute('tabindex');
      if (ti != null && parseInt(ti, 10) >= 0) return true;
      return false;
    };

    const interactiveOnly = ${interactiveOnly ? 'true' : 'false'};

    const walk = (el, depth) => {
      try {
        if (!(el instanceof Element)) return;
        const tag = el.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return;
        if (isHidden(el)) return;

        const role = roleOf(el, tag);
        const interactive = isInteractive(el, tag, role);
        const heading = role === 'heading';
        const name = nameOf(el);

        let include = false;
        if (interactiveOnly) {
          include = interactive;
        } else {
          // Interactive elements, headings, and non-trivial standalone text blocks.
          const ownTrivial = ownText(el);
          include = interactive || heading || (ownTrivial.length > 1 && role !== 'generic') || (ownTrivial.length > 1 && interactive);
          if (!include && !interactive && !heading) {
            // Include generic blocks that carry their own visible text.
            if (ownTrivial.length > 1) include = true;
          }
        }

        if (include) {
          const idx = window.__chromeUseRefs.length;
          window.__chromeUseRefs.push(el);
          const ref = 'e' + (idx + 1);
          const node = { ref: ref, role: role, name: name, backendNodeId: 0, depth: depth };
          if (tag === 'a') {
            const href = el.getAttribute('href');
            if (href) node.url = el.href || href;
          }
          nodes.push(node);
        }

        for (const child of el.children) walk(child, depth + 1);
      } catch { /* skip this element, keep walking siblings */ }
    };

    walk(root, 0);
    return { nodes: nodes };
  })()`;
}

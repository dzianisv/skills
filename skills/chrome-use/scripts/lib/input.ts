/**
 * Trusted input helpers built on the CDP Input domain. Unlike synthetic
 * dispatchEvent, Input.* produces trusted events that pass on sites which reject
 * scripted interaction. Elements are addressed by a resolved {@link ResolvedElement}
 * (objectId or backendNodeId).
 */
import type { CdpClient, ResolvedElement } from './types.ts';

/** Modifier bitmask values used by Input.dispatchKeyEvent. */
const MOD = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Shift: 8 } as const;

interface KeyDef {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
}

/** Named (non-printable) keys recognized by `pressKey`. */
const NAMED_KEYS: Record<string, KeyDef> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
};

/** Build the {objectId} | {backendNodeId} addressing object for CDP DOM/Input. */
function nodeAddr(el: ResolvedElement): Record<string, unknown> {
  if (el.objectId) return { objectId: el.objectId };
  if (el.backendNodeId != null) return { backendNodeId: el.backendNodeId };
  throw new Error('ResolvedElement has neither objectId nor backendNodeId');
}

/** Scroll the element into view (centered) so it has a renderable box. */
async function scrollIntoView(cdp: CdpClient, sessionId: string, el: ResolvedElement): Promise<void> {
  if (el.objectId) {
    await cdp.send(
      'Runtime.callFunctionOn',
      {
        objectId: el.objectId,
        functionDeclaration: "function(){ this.scrollIntoView({block:'center', inline:'center'}); }",
      },
      sessionId,
    );
    return;
  }
  // backendNodeId path: resolve to an object first, then call on it.
  const { object } = await cdp.send<any>(
    'DOM.resolveNode',
    { backendNodeId: el.backendNodeId },
    sessionId,
  );
  if (object?.objectId) {
    await cdp.send(
      'Runtime.callFunctionOn',
      {
        objectId: object.objectId,
        functionDeclaration: "function(){ this.scrollIntoView({block:'center', inline:'center'}); }",
      },
      sessionId,
    );
  }
}

/**
 * Compute the viewport center point of an element. Falls back to scrolling it into
 * view and retrying once if the box model is initially unavailable.
 */
async function centerOf(
  cdp: CdpClient,
  sessionId: string,
  el: ResolvedElement,
): Promise<{ x: number; y: number }> {
  const getBox = async () => {
    const res = await cdp.send<any>('DOM.getBoxModel', nodeAddr(el), sessionId);
    const quad = res?.model?.content;
    if (!quad || quad.length < 8) return null;
    return { x: (quad[0] + quad[4]) / 2, y: (quad[1] + quad[5]) / 2 };
  };

  try {
    const c = await getBox();
    if (c) return c;
  } catch {
    /* fall through to scroll + retry */
  }

  await scrollIntoView(cdp, sessionId, el);
  const c2 = await getBox();
  if (c2) return c2;
  throw new Error('Element is not rendered (no box model)');
}

/** Click an element with a trusted left mouse press/release at its center. */
export async function clickElement(
  cdp: CdpClient,
  sessionId: string,
  el: ResolvedElement,
): Promise<void> {
  await scrollIntoView(cdp, sessionId, el);
  const { x, y } = await centerOf(cdp, sessionId, el);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
  await cdp.send(
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 },
    sessionId,
  );
  await cdp.send(
    'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 1 },
    sessionId,
  );
}

/** Move the mouse to the element center (hover). */
export async function hoverElement(
  cdp: CdpClient,
  sessionId: string,
  el: ResolvedElement,
): Promise<void> {
  const { x, y } = await centerOf(cdp, sessionId, el);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
}

/** Focus an element via DOM.focus. */
export async function focusElement(
  cdp: CdpClient,
  sessionId: string,
  el: ResolvedElement,
): Promise<void> {
  await cdp.send('DOM.focus', nodeAddr(el), sessionId);
}

/**
 * Clear an element and insert `text`. Clears any existing value first (for
 * inputs/textareas/contenteditable) then inserts as trusted text and fires an
 * input event so frameworks (React, Vue, …) observe the change.
 */
export async function fillElement(
  cdp: CdpClient,
  sessionId: string,
  el: ResolvedElement,
  text: string,
): Promise<void> {
  await focusElement(cdp, sessionId, el);
  if (el.objectId) {
    await cdp.send(
      'Runtime.callFunctionOn',
      {
        objectId: el.objectId,
        functionDeclaration:
          "function(){ if ('value' in this) { this.value=''; } else if (this.isContentEditable) { this.textContent=''; } }",
      },
      sessionId,
    );
  }
  await cdp.send('Input.insertText', { text }, sessionId);
  if (el.objectId) {
    await cdp.send(
      'Runtime.callFunctionOn',
      {
        objectId: el.objectId,
        functionDeclaration:
          "function(){ this.dispatchEvent(new Event('input', {bubbles:true})); this.dispatchEvent(new Event('change', {bubbles:true})); }",
      },
      sessionId,
    );
  }
}

/** Focus an element and insert `text` as trusted input (fast path, no per-key events). */
export async function typeText(
  cdp: CdpClient,
  sessionId: string,
  el: ResolvedElement,
  text: string,
): Promise<void> {
  await focusElement(cdp, sessionId, el);
  await cdp.send('Input.insertText', { text }, sessionId);
}

/**
 * Press a key chord like `Enter`, `Control+a`, `Meta+Enter`, or `Shift+Tab`.
 * Modifiers are held (keyDown) before the main key and released (keyUp) after.
 */
export async function pressKey(cdp: CdpClient, sessionId: string, key: string): Promise<void> {
  const parts = key.split('+').map((p) => p.trim()).filter(Boolean);
  const main = parts.pop() ?? '';
  const modifiers = parts;

  let mask = 0;
  for (const m of modifiers) {
    const v = (MOD as Record<string, number>)[normalizeMod(m)];
    if (v) mask |= v;
  }

  const def = resolveKeyDef(main);

  // Hold modifier keys down.
  for (const m of modifiers) {
    const md = modifierKeyDef(normalizeMod(m));
    if (md) await sendKey(cdp, sessionId, 'keyDown', md, mask);
  }

  // Editing chords (Ctrl/Cmd+A/C/V/X/Z) must be passed as explicit CDP editing
  // commands — synthetic key events alone don't trigger Chrome's editor.
  const commands = editingCommands(mask, main);
  await sendKey(cdp, sessionId, 'keyDown', def, mask, commands);
  await sendKey(cdp, sessionId, 'keyUp', def, mask);

  // Release modifier keys (reverse order).
  for (const m of [...modifiers].reverse()) {
    const md = modifierKeyDef(normalizeMod(m));
    if (md) await sendKey(cdp, sessionId, 'keyUp', md, mask);
  }
}

/** Normalize modifier spellings to the canonical MOD keys. */
function normalizeMod(m: string): string {
  const lower = m.toLowerCase();
  if (lower === 'ctrl' || lower === 'control') return 'Control';
  if (lower === 'alt' || lower === 'option') return 'Alt';
  if (lower === 'meta' || lower === 'cmd' || lower === 'command' || lower === 'super') return 'Meta';
  if (lower === 'shift') return 'Shift';
  return m;
}

/** KeyDef for a held modifier key (so it generates its own key events). */
function modifierKeyDef(mod: string): KeyDef | null {
  switch (mod) {
    case 'Control':
      return { key: 'Control', code: 'ControlLeft', keyCode: 17 };
    case 'Alt':
      return { key: 'Alt', code: 'AltLeft', keyCode: 18 };
    case 'Meta':
      return { key: 'Meta', code: 'MetaLeft', keyCode: 91 };
    case 'Shift':
      return { key: 'Shift', code: 'ShiftLeft', keyCode: 16 };
    default:
      return null;
  }
}

/** Resolve a key token to a KeyDef (named key, or a single printable char). */
function resolveKeyDef(token: string): KeyDef {
  if (NAMED_KEYS[token]) return NAMED_KEYS[token];
  // Case-insensitive match for named keys (e.g. "enter").
  const found = Object.keys(NAMED_KEYS).find((k) => k.toLowerCase() === token.toLowerCase());
  if (found) return NAMED_KEYS[found];

  // Single printable character.
  if (token.length === 1) {
    const ch = token;
    const upper = ch.toUpperCase();
    const code = /[a-zA-Z]/.test(ch) ? `Key${upper}` : /[0-9]/.test(ch) ? `Digit${ch}` : '';
    return { key: ch, code, keyCode: upper.charCodeAt(0), text: ch };
  }
  // Fallback: treat token as the key name verbatim.
  return { key: token, code: token, keyCode: 0 };
}

/**
 * Map an editing chord (Ctrl/Cmd + key, optionally Shift) to the CDP editing
 * command(s) Chrome's editor expects. Empty when the chord isn't an editor action.
 */
function editingCommands(mask: number, key: string): string[] {
  if (!(mask & (MOD.Control | MOD.Meta))) return [];
  const k = key.toLowerCase();
  const shift = mask & MOD.Shift;
  switch (k) {
    case 'a':
      return ['selectAll'];
    case 'c':
      return ['copy'];
    case 'v':
      return ['paste'];
    case 'x':
      return ['cut'];
    case 'z':
      return shift ? ['redo'] : ['undo'];
    case 'y':
      return ['redo'];
    default:
      return [];
  }
}

/** Dispatch a single key event with the given modifier mask and optional editor commands. */
async function sendKey(
  cdp: CdpClient,
  sessionId: string,
  type: 'keyDown' | 'keyUp',
  def: KeyDef,
  modifiers: number,
  commands: string[] = [],
): Promise<void> {
  const params: Record<string, unknown> = {
    type,
    key: def.key,
    code: def.code,
    windowsVirtualKeyCode: def.keyCode,
    nativeVirtualKeyCode: def.keyCode,
    modifiers,
  };
  // Printable text only on keyDown, and only when no Ctrl/Meta is held.
  if (type === 'keyDown' && def.text && !(modifiers & (MOD.Control | MOD.Meta))) {
    params.text = def.text;
  }
  // Editor commands (selectAll, copy, …) ride on the keyDown event.
  if (type === 'keyDown' && commands.length) {
    params.commands = commands;
  }
  await cdp.send('Input.dispatchKeyEvent', params, sessionId);
}

/** Scroll the page by `px` pixels in the given direction via a wheel event. */
export async function scrollBy(
  cdp: CdpClient,
  sessionId: string,
  dir: 'up' | 'down' | 'left' | 'right',
  px: number,
): Promise<void> {
  const amount = px || 400;
  let deltaX = 0;
  let deltaY = 0;
  if (dir === 'down') deltaY = amount;
  else if (dir === 'up') deltaY = -amount;
  else if (dir === 'right') deltaX = amount;
  else if (dir === 'left') deltaX = -amount;

  await cdp.send(
    'Input.dispatchMouseEvent',
    { type: 'mouseWheel', x: 0, y: 0, deltaX, deltaY },
    sessionId,
  );
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AgentTabRegistry, AGENT_TAB_IDLE_MS } from '../lib/agent-tabs.ts';

test('agent tabs record creation and last-used metadata without claiming user tabs', () => {
  let now = 1_000;
  const tabs = new AgentTabRegistry({ now: () => now });

  tabs.markCreated('agent-1');
  assert.deepEqual(tabs.get('agent-1'), {
    targetId: 'agent-1',
    createdAt: 1_000,
    lastUsedAt: 1_000,
    pinned: false,
  });
  assert.equal(tabs.get('user-1'), undefined, 'unseen user tabs must never enter ownership state');

  now = 2_000;
  tabs.markUsed('agent-1');
  assert.equal(tabs.get('agent-1')?.lastUsedAt, 2_000);
});

test('agent tabs become idle at exactly one hour and recent use postpones cleanup', () => {
  let now = 10_000;
  const tabs = new AgentTabRegistry({ now: () => now });
  tabs.markCreated('agent-1');

  now += AGENT_TAB_IDLE_MS - 1;
  assert.deepEqual(tabs.idle(), [], 'a tab used less than one hour ago must survive');

  now += 1;
  assert.deepEqual(tabs.idle(), [
    { targetId: 'agent-1', createdAt: 10_000, lastUsedAt: 10_000, pinned: false },
  ]);

  now += 5_000;
  tabs.markUsed('agent-1');
  assert.deepEqual(tabs.idle(), [], 'activity must refresh last-used time');
});

test('pinned task tabs are never selected for idle cleanup until explicitly unpinned', () => {
  let now = 20_000;
  const tabs = new AgentTabRegistry({ now: () => now });
  tabs.markCreated('agent-pinned');
  assert.equal(tabs.pin('agent-pinned'), true);

  now += AGENT_TAB_IDLE_MS * 2;
  assert.deepEqual(tabs.idle(), [], 'pinned agent tabs must be preserved');
  assert.equal(tabs.unpin('agent-pinned'), true);
  now += AGENT_TAB_IDLE_MS;
  assert.deepEqual(tabs.idle(), [
    { targetId: 'agent-pinned', createdAt: 20_000, lastUsedAt: now - AGENT_TAB_IDLE_MS, pinned: false },
  ]);
});

test('closing an agent tab removes its ownership metadata', () => {
  const tabs = new AgentTabRegistry({ now: () => 30_000 });
  tabs.markCreated('agent-closed');
  tabs.markClosed('agent-closed');
  assert.equal(tabs.get('agent-closed'), undefined);
  assert.deepEqual(tabs.snapshot(), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TYPES, DEFAULT_EVENT_TYPE, isEventType, isContainerType, resolveEventType,
  sessionKinds, publicDescriptor, eventTypeOptions,
} from '../src/lib/server/event-types.js';

test('every event type declares ordered sessions, cards, and a default format', () => {
  for (const [id, t] of Object.entries(EVENT_TYPES)) {
    assert.ok(Array.isArray(t.sessions) && t.sessions.length, `${id} has sessions`);
    for (const s of t.sessions) assert.ok(s.kind && s.label, `${id} session has kind+label`);
    assert.ok(t.defaultFormat, `${id} has a default format`);
    assert.ok(Array.isArray(t.display.cards), `${id} declares a card list`);
  }
});

test('isEventType / resolveEventType fall back to the default', () => {
  assert.ok(isEventType('league-fast-four'));
  assert.equal(isEventType('nope'), false);
  assert.equal(resolveEventType('nope'), EVENT_TYPES[DEFAULT_EVENT_TYPE]);
});

test('sessionKinds returns internal kinds in order (heat maps to sprint)', () => {
  assert.deepEqual(sessionKinds('league-fast-four'), ['qualifying', 'sprint', 'feature']);
  assert.deepEqual(sessionKinds('hosted-qual-race'), ['qualifying', 'feature']);
});

test('publicDescriptor is JSON-safe and normalizes unknown ids to the default', () => {
  const d = publicDescriptor('league-fast-four');
  assert.equal(d.id, 'league-fast-four');
  assert.equal(d.sessions.find((s) => s.kind === 'sprint').label, 'Heat');
  assert.deepEqual(d.display.cards, ['fast-four', 'heat-feature-winners']);
  assert.equal(publicDescriptor('nope').id, DEFAULT_EVENT_TYPE);
  assert.doesNotThrow(() => JSON.stringify(d));
});

test('eventTypeOptions expose id, name, defaultFormat, and container flag', () => {
  const opts = eventTypeOptions();
  assert.ok(opts.length === Object.keys(EVENT_TYPES).length);
  for (const o of opts) assert.ok(o.id && o.name && o.defaultFormat && 'container' in o);
});

test('a hosted qual+race is a one-off, not a series container', () => {
  assert.equal(isContainerType('league-fast-four'), true);
  assert.equal(isContainerType('hosted-qual-race'), false);
  assert.equal(isContainerType('nope'), false);
  // At least one type must be able to back a series.
  assert.ok(eventTypeOptions().some((t) => t.container));
});

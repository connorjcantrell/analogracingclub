// Event-type catalog: the single source of truth for what an event *is* — its
// session structure, how it displays, and how it feeds standings. A series
// stores an `eventType` id (plus its points `format`); everything downstream —
// admin validation, the public series descriptor, the results page, and the
// standings buckets — resolves from here.
//
// A session slot's `kind` is the internal simsession kind produced by the
// iRacing mapper (src/import/mappers.js) and is never renamed; `label` is only
// how it is shown. A league "Heat" therefore reuses the existing `sprint` kind,
// so no stored result needs migrating.
export const EVENT_TYPES = {
  'league-fast-four': {
    name: 'League · Fast Four',
    category: 'league',
    // `container: true` means this type can back a multi-round series (the
    // league championship). A one-off-only type (see below) never can.
    container: true,
    sessions: [
      { kind: 'qualifying', label: 'Qualifying' },
      { kind: 'sprint', label: 'Heat' },
      { kind: 'feature', label: 'Feature' },
    ],
    defaultFormat: 'fast-four',
    // display drives the results page: which extra summary cards to show, and
    // whether a combined "Overall" (points across the round) tab makes sense.
    display: { overall: true, cards: ['fast-four', 'heat-feature-winners'] },
  },
  'hosted-qual-race': {
    name: 'Hosted · Qual + Race',
    category: 'hosted',
    // A hosted session is a standalone one-off; it is never a series.
    container: false,
    sessions: [
      { kind: 'qualifying', label: 'Qualifying' },
      { kind: 'feature', label: 'Race' },
    ],
    defaultFormat: 'fast-four',
    // No cards: with a single race the feature finish already names the winner.
    display: { overall: true, cards: [] },
  },
};

export const DEFAULT_EVENT_TYPE = 'hosted-qual-race';

export const isEventType = (id) => Object.prototype.hasOwnProperty.call(EVENT_TYPES, id);

// Whether an event type can back a multi-round series (a container). A hosted
// qual+race is a standalone one-off and cannot.
export const isContainerType = (id) => !!EVENT_TYPES[id]?.container;

// The event type for an id, falling back to the default so old/unknown data
// never renders a blank page.
export const resolveEventType = (id) => EVENT_TYPES[id] ?? EVENT_TYPES[DEFAULT_EVENT_TYPE];

// The internal session kinds an event type runs, in order.
export const sessionKinds = (id) => resolveEventType(id).sessions.map((s) => s.kind);

// A pure-data descriptor safe to JSON-serialize to the browser. The `id` is the
// shared contract: the backend defines structure here, the frontend maps card
// ids to renderers.
export const publicDescriptor = (id) => {
  const t = resolveEventType(id);
  const resolvedId = isEventType(id) ? id : DEFAULT_EVENT_TYPE;
  return {
    id: resolvedId,
    name: t.name,
    category: t.category,
    sessions: t.sessions.map((s) => ({ ...s })),
    display: { overall: t.display.overall, cards: [...t.display.cards] },
  };
};

// Admin form options: id + label + the format each type defaults to, and
// whether it can back a series (so the create form can offer only those).
export const eventTypeOptions = () =>
  Object.entries(EVENT_TYPES).map(([id, t]) => ({ id, name: t.name, category: t.category, defaultFormat: t.defaultFormat, container: !!t.container }));

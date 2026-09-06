// Series model: a scored competition and its lifecycle. What an event *looks
// like* — its sessions, cards, and standings buckets — is declared by its event
// type (see src/event-types.js); a series stores that type's id plus a points
// `format`. Several series can be active at once (a special event mid-season; a
// season's rounds also counting toward an annual championship — upload the same
// result to each, scored under each one's format).
export { EVENT_TYPES, DEFAULT_EVENT_TYPE, isEventType, eventTypeOptions } from './event-types.js';
export const SERIES_STATUSES = ['upcoming', 'active', 'complete'];
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

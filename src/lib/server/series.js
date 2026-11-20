// Series model: a scored competition and its lifecycle. What an event *looks
// like* — its sessions, cards, and standings buckets — is declared by its event
// type (see src/event-types.js); a series stores that type's id plus a points
// `format`, applied to every one of its rounds. Only one series is `active` at
// a time: it is the season, and every session uploaded while it runs (its own
// rounds and any special event not excluded at upload) pays into its stake
// (see ./season.js, ./stake). A special event carries its own points format.
export { EVENT_TYPES, DEFAULT_EVENT_TYPE, isEventType, eventTypeOptions } from './event-types.js';
export const SERIES_STATUSES = ['upcoming', 'active', 'complete'];
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

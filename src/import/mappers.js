// Map iRacing simsession metadata to a session kind, and normalize iRacing's
// 0-indexed positions (winner = 0; negatives = not classified) to 1-indexed,
// with null for non-classified.

export function sessionKind({ simsession_type, simsession_name } = {}) {
  const name = (simsession_name ?? '').toUpperCase();
  const type = simsession_type;
  if (type === 5 || name.includes('QUAL')) return 'qualifying';
  if (type === 6 || name.includes('HEAT') || name.includes('SPRINT') || name.includes('FEATURE') || name.includes('RACE')) {
    return name.includes('HEAT') || name.includes('SPRINT') ? 'sprint' : 'feature';
  }
  return 'practice';
}

export function normalizePosition(raw) {
  if (raw == null || raw < 0) return null;
  return raw + 1;
}

// Unwrap the iRacing `{ type, data }` download envelope (or accept a bare
// event-result). Returns { eventResult, rawType }; rawType is null when bare.
export function unwrapEnvelope(parsed) {
  const enveloped = parsed && typeof parsed === 'object' && parsed.data && 'type' in parsed;
  const eventResult = enveloped ? parsed.data : parsed;
  if (!eventResult || typeof eventResult.subsession_id !== 'number') {
    throw new Error('not an iRacing event-result (missing subsession_id)');
  }
  return { eventResult, rawType: enveloped ? parsed.type : null };
}

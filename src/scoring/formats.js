// Named points formats. A series picks one at creation (its pointsConfig is a
// copy, so a series can be tuned later without touching others — points are
// never universal across series).
//
// pointsConfig shape, per session kind (qualifying | sprint | feature | practice):
//   { base: { <finish position>: points, ... }, lapLedBonus?: points }
const scale = (pts) => Object.fromEntries(pts.map((p, i) => [i + 1, p]));

export const FORMATS = {
  'arc-standard': {
    name: 'ARC standard',
    description: 'Qualifying 7-5-3-1 · Sprint: 1 pt for leading a lap · Feature 20-18-16-14-12-11-10-9-8-7-6-5-4-3-2-1',
    pointsConfig: {
      qualifying: { base: scale([7, 5, 3, 1]) },
      sprint: { base: {}, lapLedBonus: 1 },
      feature: { base: scale([20, 18, 16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) },
      practice: { base: {} },
    },
  },
  'feature-only': {
    name: 'Feature only',
    description: 'No qualifying or sprint points · Feature 20-18-16-14-12-11-10-9-8-7-6-5-4-3-2-1',
    pointsConfig: {
      qualifying: { base: {} },
      sprint: { base: {} },
      feature: { base: scale([20, 18, 16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) },
      practice: { base: {} },
    },
  },
};

export const DEFAULT_FORMAT = 'arc-standard';
export const KINDS = ['qualifying', 'sprint', 'feature', 'practice'];

// Deep copy so a series never shares an object with the preset.
export const pointsConfigFor = (format) => structuredClone(FORMATS[format]?.pointsConfig ?? FORMATS[DEFAULT_FORMAT].pointsConfig);

// Validate a user-supplied pointsConfig; returns a normalized copy or throws.
export function validatePointsConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('pointsConfig must be an object');
  const out = {};
  for (const kind of KINDS) {
    const c = input[kind] ?? { base: {} };
    if (typeof c !== 'object' || Array.isArray(c)) throw new Error(`${kind} must be an object`);
    const base = {};
    for (const [pos, pts] of Object.entries(c.base ?? {})) {
      if (!/^[1-9]\d*$/.test(pos) || typeof pts !== 'number' || !Number.isFinite(pts)) throw new Error(`${kind}.base: positions must be integers >= 1 with numeric points`);
      base[pos] = pts;
    }
    out[kind] = { base };
    if (c.lapLedBonus != null) {
      if (typeof c.lapLedBonus !== 'number' || !Number.isFinite(c.lapLedBonus)) throw new Error(`${kind}.lapLedBonus must be a number`);
      out[kind].lapLedBonus = c.lapLedBonus;
    }
  }
  return out;
}

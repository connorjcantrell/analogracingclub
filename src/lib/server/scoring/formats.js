// Named points formats. A series picks one at creation (its pointsConfig is a
// copy, so a series can be tuned later without touching others — points are
// never universal across series).
//
// pointsConfig shape, per session kind (qualifying | sprint | feature | practice):
//   { base: { <finish position>: points, ... }, lapLedBonus?: points }
//
// lapLedBonus is a flat award for leading at least one lap, and is paid at
// most once per round — see build-document.js, which strips the duplicate when
// a driver leads in both the sprint and the feature.
const scale = (pts) => Object.fromEntries(pts.map((p, i) => [i + 1, p]));

// The Fast Four feature scale, v2: 22 for the win, then 19-17-15-13 and down
// by one to two points at 16th; every place from 17th to 32nd scores one, so
// finishing the feature always pays. v1 paid 20 for the win and nothing past
// 16th.
const FEATURE_V1 = [20, 18, 16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const FEATURE_V2 = [22, 19, 17, 15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, ...Array(16).fill(1)];

export const FORMATS = {
  'fast-four-v2': {
    name: 'Fast Four v2',
    description: 'Qualifying 7-5-3-1 · Feature 22-19-17-15-13-12-11-10-9-8-7-6-5-4-3-2, then 1 pt per place from 17th to 32nd · 1 pt for leading a lap in the sprint or feature (once per round)',
    pointsConfig: {
      qualifying: { base: scale([7, 5, 3, 1]) },
      sprint: { base: {}, lapLedBonus: 1 },
      feature: { base: scale(FEATURE_V2), lapLedBonus: 1 },
      practice: { base: {} },
    },
  },
  'fast-four': {
    name: 'Fast Four v1',
    description: 'Qualifying 7-5-3-1 · Feature 20-18-16-14-12-11-10-9-8-7-6-5-4-3-2-1 · 1 pt for leading a lap in the sprint or feature (once per round)',
    pointsConfig: {
      qualifying: { base: scale([7, 5, 3, 1]) },
      sprint: { base: {}, lapLedBonus: 1 },
      feature: { base: scale(FEATURE_V1), lapLedBonus: 1 },
      practice: { base: {} },
    },
  },
  'feature-only': {
    name: 'Feature only',
    description: 'No qualifying or sprint points · Feature 20-18-16-14-12-11-10-9-8-7-6-5-4-3-2-1 · 1 pt for leading a lap (once per round)',
    pointsConfig: {
      qualifying: { base: {} },
      sprint: { base: {} },
      feature: { base: scale(FEATURE_V1), lapLedBonus: 1 },
      practice: { base: {} },
    },
  },
  'unscored': {
    name: 'Unscored (special event)',
    description: 'No points at all — for one-off races that do not feed a championship',
    pointsConfig: {
      qualifying: { base: {} },
      sprint: { base: {} },
      feature: { base: {} },
      practice: { base: {} },
    },
  },
};

// New series score under the current Fast Four scale; existing series keep
// the copy they were created with until the admin switches them.
export const DEFAULT_FORMAT = 'fast-four-v2';
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

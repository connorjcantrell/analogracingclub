// Series model: the three kinds of competition the club runs, and their
// lifecycle. They may overlap in time (a special event mid-season; a season's
// rounds also counting toward the annual championship — upload the same result
// to both, each scored under its own format).
export const SERIES_TYPES = {
  event: 'Special event',
  season: 'Seasonal series',
  championship: 'Annual championship',
};
export const SERIES_STATUSES = ['upcoming', 'active', 'complete'];
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

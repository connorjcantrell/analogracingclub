// Default points config (the ARC standard format). Series carry their own copy;
// this is only the fallback for results stored without a series.
import { FORMATS, DEFAULT_FORMAT } from './formats.js';
export const DEFAULT_POINTS_CONFIG = FORMATS[DEFAULT_FORMAT].pointsConfig;

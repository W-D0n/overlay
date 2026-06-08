// @ts-check
/**
 * component-registry.js — `ComponentName` → factory (S3).
 *
 * Map résolue par le runtime au montage d'une couche. Agrégation intentionnelle
 * des 5 factories de `components/index.js` (pas un barrel de ré-export passif).
 *
 * Voir docs/specs/scene-runtime-engine.md §Format de données.
 */

import { GoldBar, StatBlock, ChatFeed, PomodoroBar, AlertBanner } from './components/index.js';

/**
 * Les factories ont des signatures hétérogènes ; le registry expose la vue unifiée
 * `ComponentInstance` consommée par le runtime (les types précis vivent sur les factories).
 * @type {Record<import('./types.js').ComponentName, (options: Record<string, unknown>) => import('./types.js').ComponentInstance>}
 */
export const COMPONENT_REGISTRY = /** @type {*} */ ({ GoldBar, StatBlock, ChatFeed, PomodoroBar, AlertBanner });

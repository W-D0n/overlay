// @ts-check
/**
 * component-registry.js — `ComponentName` → factory (S3, étoffé S8).
 *
 * Map résolue par le runtime au montage d'une couche. Agrégation intentionnelle des factories de
 * `components/index.js` + `DotGridAnimated` (S8 : rejoint le modèle de composant standard, voir
 * docs/specs/scene-definition-v2.md — toujours une seule instance permanente dans `#bg-layer`,
 * pas un système multi-animations).
 *
 * Voir docs/specs/scene-runtime-engine.md §Format de données.
 */

import {
  GoldBar, StatBlock, ChatFeed, PomodoroBar, AlertBanner,
  Box, Divider, TextLabel, TextList, PollBar, Badge, Image,
} from './components/index.js';
import { DotGridAnimated } from './components/DotGridAnimated.js';

/**
 * Les factories ont des signatures hétérogènes ; le registry expose la vue unifiée
 * `ComponentInstance` consommée par le runtime (les types précis vivent sur les factories).
 * @type {Record<import('./types.js').ComponentName, (options: Record<string, unknown>) => import('./types.js').ComponentInstance>}
 */
export const COMPONENT_REGISTRY = /** @type {*} */ ({
  GoldBar, StatBlock, ChatFeed, PomodoroBar, AlertBanner,
  Box, Divider, TextLabel, TextList, PollBar, Badge, Image,
  DotGridBackground: DotGridAnimated,
});

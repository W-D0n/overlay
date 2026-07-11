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
import { COMPONENT_NAMES } from './component-names.js';
import { DotGridAnimated } from './components/DotGridAnimated.js';
import { RainBackground } from './components/RainBackground.js';
import { MatrixGridBackground } from './components/MatrixGridBackground.js';
import { BubbleBackground } from './components/BubbleBackground.js';
import { FirefliesBackground } from './components/FirefliesBackground.js';
import { FloatingSymbolsBackground } from './components/FloatingSymbolsBackground.js';
import { GeometricPatternBackground } from './components/GeometricPatternBackground.js';
import { ColorDropsBackground } from './components/ColorDropsBackground.js';
import { StarsParallaxBackground } from './components/StarsParallaxBackground.js';
import { OrbitingShapesBackground } from './components/OrbitingShapesBackground.js';
import { ShapeMorphBackground } from './components/ShapeMorphBackground.js';

/**
 * Les factories ont des signatures hétérogènes ; le registry expose la vue unifiée
 * `ComponentInstance` consommée par le runtime (les types précis vivent sur les factories).
 * @type {Record<import('./types.js').ComponentName, (options: Record<string, unknown>) => import('./types.js').ComponentInstance>}
 */
export const COMPONENT_REGISTRY = /** @type {*} */ ({
  GoldBar, StatBlock, ChatFeed, PomodoroBar, AlertBanner,
  Box, Divider, TextLabel, TextList, PollBar, Badge, Image,
  DotGridBackground: DotGridAnimated,
  RainBackground,
  MatrixGridBackground,
  BubbleBackground,
  FirefliesBackground,
  FloatingSymbolsBackground,
  GeometricPatternBackground,
  ColorDropsBackground,
  StarsParallaxBackground,
  OrbitingShapesBackground,
  ShapeMorphBackground,
});

/**
 * Vérifie que `COMPONENT_REGISTRY` expose exactement le vocabulaire de `component-names.js` — ni
 * clé manquante (composant déclaré mais jamais implémenté), ni clé en trop (implémenté mais oublié
 * dans la source unique). Ne lève jamais (AD-1, même convention que `validateSceneConfig`) ;
 * appelée une fois au bootstrap réel (`scene-runtime.js` init), pas à chaque montage de scène.
 * @returns {import('./types.js').ValidationResult}
 */
export function validateComponentRegistry() {
  /** @type {string[]} */
  const errors = [];
  const registryKeys = Object.keys(COMPONENT_REGISTRY);

  for (const name of COMPONENT_NAMES) {
    if (!registryKeys.includes(name)) errors.push(`composant déclaré sans factory : ${name}`);
  }
  for (const key of registryKeys) {
    if (!COMPONENT_NAMES.includes(key)) errors.push(`factory sans déclaration dans component-names.js : ${key}`);
  }

  return { ok: errors.length === 0, errors };
}

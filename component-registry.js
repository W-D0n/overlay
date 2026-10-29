// @ts-check
/**
 * component-registry.js — `ComponentName` → factory d'effet de fond.
 *
 * Map résolue par `background-mount.js` au montage de l'effet courant, pour l'URL OBS
 * (`background.html`) comme pour l'aperçu du Studio. `DotGridBackground` reste l'alias de
 * `DotGridAnimated`, seul effet à exposer une réaction native (`trigger()`).
 *
 * Voir docs/specs/background-standalone.md.
 */

import { DotGridAnimated } from './components/DotGridAnimated.js';
import { RainBackground } from './components/RainBackground.js';
import { BubbleBackground } from './components/BubbleBackground.js';
import { FirefliesBackground } from './components/FirefliesBackground.js';
import { FloatingSymbolsBackground } from './components/FloatingSymbolsBackground.js';
import { GeometricPatternBackground } from './components/GeometricPatternBackground.js';
import { ColorDropsBackground } from './components/ColorDropsBackground.js';
import { StarsParallaxBackground } from './components/StarsParallaxBackground.js';
import { OrbitingShapesBackground } from './components/OrbitingShapesBackground.js';
import { ShapeMorphBackground } from './components/ShapeMorphBackground.js';
import { WaterRippleBackground } from './components/WaterRippleBackground.js';

/**
 * Les factories ont des signatures hétérogènes ; le registry expose la vue unifiée
 * `ComponentInstance` consommée par le runtime (les types précis vivent sur les factories).
 * Typé `Record<LayerKindId, …>` : une fabrique oubliée ou en trop fait échouer `bun dev/typecheck.js`.
 * @type {Record<import('./layer-kinds.js').LayerKindId, (options: any, environment?: any) => import('./types.js').ComponentInstance>}
 */
export const COMPONENT_REGISTRY = ({
  DotGridBackground: DotGridAnimated,
  RainBackground,
  BubbleBackground,
  FirefliesBackground,
  FloatingSymbolsBackground,
  GeometricPatternBackground,
  ColorDropsBackground,
  StarsParallaxBackground,
  OrbitingShapesBackground,
  ShapeMorphBackground,
  WaterRippleBackground,
});


---
created: 2026-06-07
updated: 2026-10-29
---

# Specs — Index

| Feature | Statut | Créée | Session |
|---|---|---|---|
| [background-effects-library](background-effects-library.md) | Fait | 2026-07-07 | Track B (8/8) |
| [dotgrid-event-triggers](dotgrid-event-triggers.md) | Draft | 2026-07-10 | Session 1/3 |
| [background-standalone](background-standalone.md) | Fait | 2026-07-14 | — |
| [background-reactive-events](background-reactive-events.md) | Fait | 2026-07-24 | ① Fonds réactifs |
| [background-audio-reactivity](background-audio-reactivity.md) | Fait | 2026-07-25 | ② Réactivité audio |
| [obs-scene-preset-mapping](obs-scene-preset-mapping.md) | Fait | 2026-07-25 | ③ Preset par scène OBS |
| [background-preset-transitions](background-preset-transitions.md) | Fait | 2026-07-26 | ④ Transition entre presets |
| [background-branding-layer](background-branding-layer.md) | Fait | 2026-07-26 | ⑤ Couche branding |
| [background-preset-thumbnails](background-preset-thumbnails.md) | Fait | 2026-07-26 | ⑥ Vignettes de presets |
| [zero-install-local-first](zero-install-local-first.md) | Draft | 2026-10-29 | Zéro installation, local-first |
| [studio-cadrage](studio-cadrage.md) | Draft | 2026-10-29 | Cadrage du Studio d'overlays |
| [socle-rendu-etapes-1-2](socle-rendu-etapes-1-2.md) | Fait (contrôle OBS à passer) | 2026-10-29 | Contrat d'URL, transport, horloge unique |
| [layer-kind-etape-3](layer-kind-etape-3.md) | Fait (migration du fichier au prochain redémarrage) | 2026-10-29 | Définition unique d'un type de couche, valeurs neutres |
| [studio-trois-zones](studio-trois-zones.md) | Fait | 2026-10-29 | Refonte de l'écran du tuner (cadre 16:9, bibliothèque unique, scènes lisibles) |
| [scene-doc-etape-4](scene-doc-etape-4.md) | Draft | 2026-10-29 | Document de scène (couches), moteur de scène |

## Archive

`archive/` conserve les specs du moteur de scènes, retiré du working tree le 2026-07-25. Le code
correspondant reste restaurable via le tag git `scene-engine-v1` :

- scene-config-protocol, scene-runtime-engine, scene-definition-v2, scene-placement-protocol,
  scene-history-protocol, scene-transition-library ;
- relay-bun-s4, obs-scene-control (relais OBS WebSocket).

# Guide — Harmoniser les noms de scènes OBS avec l'overlay

## Le problème

L'overlay a 9 scènes internes (`discussion`, `codage`, `brb`, `jeu`, `interview`, `react`,
`creation`, `fin`, `starting`). Le relais (`relay/server.js`) écoute les changements de scène OBS et
doit traduire le nom EXACT de ta scène OBS (`"Coding"`, `"Just Chatting"`, etc.) vers l'identifiant
interne correspondant — cette traduction vit dans `relay/obs-scene-map-data.js`.

Si tu renommes une scène dans OBS, ou si tes noms de scènes ne correspondent pas à ceux utilisés par
défaut, le relais ne saura plus faire le lien : la scène s'affichera dans OBS mais l'overlay ne
changera pas de scène en même temps.

## Comment le savoir

Le relais logue **toujours** un avertissement clair quand une scène OBS lui est inconnue :

```
[relay] scène OBS "Nom Que Tu As Utilisé" absente de la table de correspondance — ignorée
```

Si tu vois ce message dans le terminal de `start-stream.bat`/`start-dev.bat`, c'est le signal qu'il
faut mettre à jour le mapping.

## Comment corriger — méthode recommandée (panneau, aucun code)

1. Lancer `bun dev/start-dev.js` (jamais pendant un live).
2. Dans `dev/placement-panel.html`, section **OBS** → sous-section **"Renommer les scènes OBS"**.
3. Chaque ligne correspond à une scène overlay (`discussion`, `codage`, ...) avec un champ texte
   pré-rempli du nom OBS actuellement associé.
4. Remplace le texte par le nom **exact** de ta scène dans OBS (respecte la casse, les espaces).
5. Bouton **"Enregistrer les noms"** — réécrit `relay/obs-scene-map-data.js`.
6. **Relance `relay/server.js`** (ou tout `start-stream.bat`/`start-dev.bat`) — le fichier est
   importé une seule fois au démarrage, pas de rechargement à chaud.

## Pourquoi ce n'est pas 100% automatique

OBS WebSocket ne pousse pas d'événement "cette scène a été renommée, voici l'ancien et le nouveau
nom" que le relais pourrait exploiter pour se mettre à jour tout seul de façon fiable (et même s'il
le faisait, laisser un process modifier silencieusement son propre fichier de config en plein live
serait plus risqué que rassurant). Le panneau ci-dessus est le compromis retenu : zéro édition de
code à la main, un clic pour sauvegarder, mais une action explicite de ta part — jamais une
correspondance changée sans que tu le voies.

## Éditer à la main (si tu préfères)

`relay/obs-scene-map-data.js` est un objet JS trivial :

```js
export const OBS_SCENE_MAP = {
  'Nom Exact Dans OBS': 'discussion',
  // ...
};
```

Éditable directement si tu es à l'aise avec — attention : si le panneau est utilisé ensuite, sa
prochaine sauvegarde réécrira le fichier en entier (pas de fusion), donc les deux méthodes ne se
mélangent pas silencieusement, mais la dernière sauvegarde du panneau écrase une édition manuelle
antérieure non re-synchronisée dans le panneau lui-même.

## Une scène OBS sans équivalent overlay ?

Si tu crées une scène OBS pour un usage qui n'a pas encore de scène overlay correspondante (ex: une
nouvelle activité), il faut d'abord créer la scène overlay elle-même (panneau → "+ scène", voir
`docs/guides/utiliser-le-panneau.md`) avant de pouvoir la mapper ici.

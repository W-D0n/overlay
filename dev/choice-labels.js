// @ts-check
/**
 * dev/choice-labels.js — What the Studio shows for each choice of a list setting: the stored value (`flat`, `easeInOut`) is an identifier of the scene file, the label is French text.
 * One entry per `<type>.<réglage>`; `dev/choice-labels.test.js` checks that every list of every type has its labels, all of them, and nothing else.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
export const CHOICE_LABELS = Object.freeze({
  'dotgrid.mode': { discussion: 'Discussion', codage: 'Codage', brb: 'Pause (BRB)', interview: 'Interview', react: 'Réaction', creation: 'Création', fin: 'Fin de stream', starting: 'Démarrage' },
  'dotgrid.colorMode': { flat: 'Uni', noise: 'Dégradé animé', glow: 'Halo' },
  'dotgrid.reactionMode': { none: 'Aucune', ambient: 'Ambiance', follow: 'Follow', sub: 'Abonnement', raid: 'Raid', bits: 'Bits' },
  'geometric-pattern.pattern': { diamonds: 'Losanges', dots: 'Points', chevrons: 'Chevrons', eyes: 'Yeux' },
  'geometric-pattern.direction': { left: 'Vers la gauche', right: 'Vers la droite', up: 'Vers le haut', down: 'Vers le bas' },
  'orbiting-shapes.shape': { circle: 'Cercle', triangle: 'Triangle' },
  'shape-morph.shape': { pizza: 'Pizza', ninjaStar: 'Étoile ninja', helmet: 'Casque', shell: 'Carapace', batmanMask: 'Masque Batman' },
  'shape-morph.style': { outline: 'Contour', fill: 'Plein', mixed: 'Mixte' },
  'shape-morph.morphEasing': { easeInOut: 'Douce au départ et à l’arrivée', easeIn: 'Douce au départ', easeOut: 'Douce à l’arrivée', linear: 'Constante' },
  'text.font': { serif: 'Avec empattements', sans: 'Sans empattements', mono: 'Chasse fixe', display: 'Titrage' },
  'text.align': { left: 'À gauche', center: 'Centré', right: 'À droite' },
  'text.verticalAlign': { top: 'En haut', middle: 'Au milieu', bottom: 'En bas' },
  'text.fit': { shrink: 'Réduire pour tenir', none: 'Taille fixe' },
  'shape.shape': { rectangle: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', diamond: 'Losange', line: 'Ligne' },
  'shape.fill': { solid: 'Uni', gradient: 'Dégradé', none: 'Aucun' },
  'image.fit': { contain: 'Contenir', cover: 'Couvrir', fill: 'Étirer' },
  'shader.quality': { full: 'Complète', half: 'Moitié', quarter: 'Quart' },
  'water-ripple.shape': { circle: 'Cercle', ellipse: 'Ellipse', diamond: 'Losange' },
});

/**
 * types.js — Types JSDoc partagés
 *
 * Pas de TypeScript ici (Browser Source = JS pur),
 * mais les JSDoc permettent l'autocomplétion dans VS Code
 * et documentent la forme des données attendues.
 *
 * USAGE : importer dans store.js et les composants.
 *   // @ts-check
 *   /// <reference path="../types.js" />
 */

/**
 * @typedef {Object} StreamState
 * État global du stream, mis à jour via WebSocket ou fallback statique.
 *
 * @property {string}   streamerName    - Pseudo affiché (ex: "D0n")
 * @property {number}   viewers         - Nombre de viewers actuels
 * @property {string}   duration        - Durée formatée "HH:MM:SS"
 * @property {string}   sessionId       - Identifiant de session (ex: "047")
 * @property {string}   currentActivity - Activité en cours (ex: "SvelteKit")
 * @property {string}   currentFile     - Fichier actif en codage (ex: "App.svelte")
 * @property {string}   currentBranch   - Branche git active
 * @property {string}   currentTool     - Outil actif en création 3D/dessin
 * @property {ChatMessage[]} chatMessages - Derniers messages du chat
 * @property {AlertEvent|null} latestAlert - Dernière alerte (follow, sub, raid)
 * @property {PollState|null}  activePoll  - Vote en cours
 * @property {PomodoroState}   pomodoro    - État du timer pomodoro
 * @property {string}   nextStream      - Prochain stream (ex: "Lundi · 20h")
 * @property {string}   nextStreamTopic - Sujet du prochain stream
 * @property {string}   currentSong     - Titre musique en cours (BRB)
 * @property {GuestInfo|null} guest      - Invité (scène Interview)
 * @property {SessionStats}   sessionStats - Stats fin de stream
 * @property {string}   sourceTitle     - Titre source (scène React)
 * @property {string}   sourceAuthor    - Auteur source (scène React)
 * @property {string}   sourcePlatform  - Plateforme source (ex: "YouTube")
 * @property {string}   subjectLine     - Sujet du moment (Discussion)
 * @property {string[]} recapLines      - Lignes de récap session (Fin)
 * @property {string[]} socialLinks     - Liens réseaux sociaux
 * @property {SceneId}         currentScene    - Scène active (axe scène)
 * @property {VisibilityLevel} visibilityLevel - Niveau de visibilité (axe orthogonal)
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} username  - Nom de l'utilisateur
 * @property {string} text      - Contenu du message
 * @property {number} timestamp - Timestamp Unix (ms)
 */

/**
 * @typedef {Object} AlertEvent
 * @property {'follow'|'sub'|'raid'|'bits'} type - Type d'alerte
 * @property {string} username  - Nom de l'utilisateur concerné
 * @property {number} timestamp - Timestamp Unix (ms)
 * @property {number} [amount]  - Montant (bits, mois de sub, viewers raid)
 */

/**
 * @typedef {Object} PollState
 * @property {string} question  - Question du vote
 * @property {number} yesRatio  - Ratio "oui" entre 0 et 1
 * @property {number} totalVotes - Nombre total de votes
 */

/**
 * @typedef {Object} PomodoroState
 * @property {number}  secondsLeft  - Secondes restantes
 * @property {number}  totalSeconds - Durée totale de la session (ex: 1500 pour 25min)
 * @property {number}  sessionIndex - Session en cours (ex: 3)
 * @property {number}  totalSessions - Total de sessions prévues (ex: 4)
 * @property {'focus'|'break'|'idle'} phase - Phase actuelle
 */

/**
 * @typedef {Object} GuestInfo
 * @property {string} name     - Nom affiché de l'invité
 * @property {string} role     - Rôle / titre (ex: "Designer · studio XYZ")
 * @property {string} link     - Lien Twitch ou profil
 */

/**
 * @typedef {Object} SessionStats
 * @property {number} maxViewers   - Pic de viewers
 * @property {number} newFollows   - Nouveaux follows
 * @property {string} duration     - Durée totale formatée
 */

// ─── Protocole de scène (S2) ────────────────────────────────────────────────

/**
 * Identifiant de scène — chaîne ouverte (S8), validée à l'existence dans le registre chargé au
 * runtime (`scenes/registry.js`), plus une union fermée compile-time. Permet de créer une scène
 * en écrivant une donnée plutôt qu'en éditant ce type. Voir docs/specs/scene-definition-v2.md.
 * @typedef {string} SceneId
 */

/**
 * Niveaux de visibilité de l'overlay (axe orthogonal à la scène).
 * - full    : toutes les couches visibles
 * - minimal : goldbar uniquement (+ DotGrid fond permanent)
 * - hidden  : aucune couche visible, body transparent (cinématique)
 * @typedef {'full'|'minimal'|'hidden'} VisibilityLevel
 */

/**
 * Mode ambiant de DotGridAnimated — chaîne ouverte (S8, miroir de `SceneId`), validée à
 * l'existence dans `GRID_MODES` (`components/DotGridAnimated.js`). null = scène sans DotGrid
 * (ex : jeu).
 * @typedef {string | null} DotGridMode
 */

/**
 * Type de transition entre deux scènes.
 * - crossfade : fondu croisé en opacité (comportement par défaut)
 * - cut       : changement instantané (duration et easing ignorés)
 * - slide     : glissement (entrante depuis `direction`, sortante vers l'opposé)
 * - wipe      : révélation par `clip-path` animé dans le sens de `direction`
 * - morph     : fond DotGrid interpolé entre modes (contenu en crossfade standard)
 * @typedef {'crossfade'|'cut'|'slide'|'wipe'|'morph'} TransitionType
 */

/**
 * Sens d'une transition `slide`/`wipe`.
 * @typedef {'left'|'right'|'up'|'down'} TransitionDirection
 */

/**
 * Easing des transitions entre scènes (ignoré si type === 'cut').
 * @typedef {'easeInOut'|'easeIn'|'easeOut'|'linear'} TransitionEasing
 */

/**
 * Noms des composants JS montables dans une couche.
 * Résolu via registry dans le runtime S3. Étendu en S8 (bibliothèque de primitifs génériques +
 * DotGridBackground) — voir docs/specs/scene-definition-v2.md.
 * Dérivé de `component-names.js` (source unique, review architecture 2026-07-11) — ne plus étendre
 * cette liste ici, éditer `COMPONENT_NAMES` dans `component-names.js`.
 * @typedef {typeof import('./component-names.js').COMPONENT_NAMES[number]} ComponentName
 */

/**
 * Valeur d'option liée à l'état live plutôt que littérale — résolue par `resolveBoundOptions`
 * (`scene-definition-resolve.js`, S8) au montage et à chaque changement d'état.
 * @typedef {Object} BoundValue
 * @property {string} $bind - Chemin dans `StreamState` (ex : 'subjectLine', 'sessionStats.maxViewers')
 * @property {*} [$default] - Repli si le chemin résout à `undefined`/`null`/chaîne vide (jamais
 *   pour `0`/`false`, données légitimes) — remplace le pattern `state.champ || 'repli'` des wire.js
 */

/**
 * Déclencheur impératif pour un comportement non-continu (ex : `AlertBanner.show()`).
 * Appelle `instance[method](state[when])` quand `state[when]` change (S8).
 * @typedef {Object} ComponentTrigger
 * @property {string} method - Nom de la méthode à appeler sur l'instance montée
 * @property {string} when - Chemin dans `StreamState` dont le changement déclenche l'appel
 */

/**
 * Une instance de composant à monter dans une couche.
 * @typedef {Object} ComponentMount
 * @property {ComponentName} component - Nom résolu par le registry
 * @property {Record<string, unknown|BoundValue>} options - Valeurs littérales ou liées (`$bind`)
 * @property {Placement} [placement] - Position individuelle du composant (S8, remplace le placement
 *   par couche de S7 pour les composants qui l'utilisent — modèle Figma, chaque élément indépendant)
 * @property {ComponentTrigger} [trigger] - Déclencheur impératif optionnel
 * @property {string} [role] - Identifiant du contrat fonctionnel adressé par un `*.wire.js` (ex :
 *   'chat', 'poll'). Unique par scène (validateSceneConfig V12). Un mount sans wire n'en a pas
 *   besoin. Remplace l'adressage par position (`componentsByLayer[i]`) ou par classe CSS
 *   (`querySelector`), tous deux fragiles au réordonnancement/renommage dans l'éditeur.
 */

/**
 * Règles de visibilité d'une couche selon le niveau d'overlay.
 *
 * Invariant (niveaux imbriqués) : hidden ⟹ minimal ⟹ full.
 * Combinaisons légales (4 seulement) :
 *   { full:false, minimal:false, hidden:false }  → jamais visible
 *   { full:true,  minimal:false, hidden:false }  → visible en full uniquement
 *   { full:true,  minimal:true,  hidden:false }  → visible en full + minimal
 *   { full:true,  minimal:true,  hidden:true  }  → toujours visible
 *
 * @typedef {Object} LayerVisibility
 * @property {boolean} full    - Visible en mode plein
 * @property {boolean} minimal - Visible en mode minimal (⟹ full doit être true)
 * @property {boolean} hidden  - Visible en mode caché (⟹ minimal doit être true)
 */

/**
 * Position et taille d'une couche, en pixels absolus dans le canvas 1920×1080.
 * Pas de système d'ancrage — le canvas ne change jamais de taille (contrainte projet),
 * un ancrage n'apporterait aucune valeur fonctionnelle ici.
 * Voir docs/specs/scene-placement-protocol.md.
 * @typedef {Object} Placement
 * @property {number} x - Distance en pixels depuis le bord gauche du canvas
 * @property {number} y - Distance en pixels depuis le bord haut du canvas
 * @property {number} [width] - Largeur en pixels (omis = dicté par le contenu/CSS existant)
 * @property {number} [height] - Hauteur en pixels (omis = dicté par le contenu/CSS existant)
 */

/**
 * Configuration d'une couche nommée dans une scène.
 * `name` devient la valeur de l'attribut `data-layer` en S3.
 * @typedef {Object} LayerConfig
 * @property {string} name - Identifiant unique dans la scène (ex : 'chat', 'goldbar')
 * @property {ComponentMount[]} components - Composants à monter (tableau vide = DOM pur)
 * @property {LayerVisibility} visibility
 * @property {Placement} [placement] - Position/taille en pixels absolus (omis = CSS scopé existant fait foi)
 */

/**
 * Paramètres de transition lors d'un changement de scène.
 * Déclarés par la scène ENTRANTE.
 * @typedef {Object} SceneTransition
 * @property {TransitionType} type
 * @property {number} duration - Durée en ms (ignoré si type === 'cut')
 * @property {TransitionEasing} easing - (ignoré si type === 'cut')
 * @property {TransitionDirection} [direction] - Sens (slide/wipe uniquement), défaut 'right'
 * @property {string} [color] - Couleur du bord de balayage (wipe uniquement), référence token CSS
 *   (ex. `var(--color-gold)`), défaut `var(--color-gold)`
 */

/**
 * Configuration complète et sérialisable d'une scène.
 * Format que le runtime S3 lit, et que l'éditeur de scènes écrira.
 * @typedef {Object} SceneConfig
 * @property {SceneId} id
 * @property {ComponentMount | null} background - Effet de fond monté dans #bg-layer (Track B,
 *   remplace `dotgridMode` — DotGridBackground est un effet parmi d'autres, plus un champ dédié).
 *   null si la scène n'utilise aucun effet de fond.
 * @property {SceneTransition} transition
 * @property {LayerConfig[]} layers
 */

/**
 * Données du message `morph.trigger`.
 * Sources LOCALES uniquement — aucun appel à une API externe.
 * @typedef {Object} MorphTriggerData
 * @property {object}  [sdf]      - Descripteur SDF mathématique, calculé localement (couche 3B)
 * @property {string}  [imageUrl] - URL bitmap PNG/SVG chargé localement (couche 3A)
 * @property {number}  [duration] - Durée morph-in en ms (défaut : 2000)
 * @property {number}  [hold]     - Durée maintien en ms (défaut : 3000)
 */

/**
 * Un événement DOM à émettre, décrit de façon pure (sans le dispatcher).
 * @typedef {Object} ProtocolEvent
 * @property {string} name   - Nom du CustomEvent (ex : 'overlay:scene-change')
 * @property {object} detail - Charge utile du CustomEvent
 */

/**
 * Jeton d'effet de bord que `reduceMessage` ne peut pas exécuter lui-même (pureté).
 * `store.js` traduit chaque jeton en effet concret.
 * - reset-duration-timer : remet le compteur de durée local à zéro (sur `session.start`)
 * @typedef {'reset-duration-timer'} EffectToken
 */

/**
 * Valeurs non-déterministes injectées dans `reduceMessage` pour le garder pur et testable.
 * @typedef {Object} ReduceContext
 * @property {number} now - Timestamp courant (ms), fourni par l'appelant (ex : `Date.now()`).
 */

/**
 * Résultat pur de `reduceMessage` : décrit QUOI faire, sans le faire.
 * @typedef {Object} ReduceResult
 * @property {Partial<StreamState>|null} patch - Changements d'état à appliquer (null = aucun)
 * @property {ProtocolEvent[]} events          - CustomEvents à dispatcher (vide = aucun)
 * @property {string[]} warnings               - Messages à logguer via console.warn (vide = aucun)
 * @property {EffectToken[]} effects           - Effets nommés à exécuter par store.js (vide = aucun)
 */

/**
 * Résultat de `validateSceneConfig`.
 * `errors` est vide si et seulement si `ok === true`.
 * @typedef {Object} ValidationResult
 * @property {boolean} ok        - true si la config respecte tous les invariants
 * @property {string[]} errors   - Liste exhaustive des violations (vide si ok)
 */

// ─── Runtime de scène (S3) ────────────────────────────────────────────────────

/**
 * Instance de composant montée — surface retournée par une factory de `components/index.js`.
 * Toutes les méthodes sont optionnelles : un composant DOM pur n'expose que `el`.
 *
 * Vue UNIFIÉE du registry pour 5 composants aux signatures hétérogènes : `update`/`show`
 * sont typés `unknown` (un wire qui a besoin de précision caste vers le type concret).
 * Les types précis vivent sur les factories de `components/index.js` (inchangées).
 *
 * @typedef {Object} ComponentInstance
 * @property {HTMLElement} el                       - Élément racine, inséré dans l'élément de couche
 * @property {(data: unknown) => void} [update]     - Rafraîchit le composant
 * @property {(alert: unknown) => void} [show]      - Affiche une alerte (AlertBanner)
 * @property {(options: unknown, duration: number, easing: TransitionEasing) => void} [morphTo] -
 *   Interpole visuellement vers de nouvelles options plutôt qu'un saut instantané (Track B, effets
 *   de fond). Optionnel : un composant sans `morphTo` dégrade en crossfade du contenu (AD-B3,
 *   `docs/specs/background-effects-library.md`). Implémenté par `DotGridBackground` depuis A3.
 * @property {() => void} [destroy]                 - Libère les ressources (observers, timers)
 * @property {(payload: unknown) => void} [trigger]  - Réaction impérative à un événement discret
 *   (ex: alerte stream). Optionnel : un composant sans `trigger` ignore silencieusement l'appel
 *   (`triggerBackground`, `scene-runtime.js`), même pattern que `morphTo` absent (AD-B3).
 *   Implémenté par `DotGridBackground` depuis la Couche 4 (`docs/specs/dotgrid-event-triggers.md`).
 */

/**
 * Scène montée dans le DOM par le runtime — résultat de `mountScene(id)`.
 * @typedef {Object} MountedScene
 * @property {SceneId} id
 * @property {HTMLElement} root                                       - Conteneur de la scène (enfant de #scene-root)
 * @property {Record<string, ComponentInstance[]>} componentsByLayer - Instances groupées par `name` de couche, dans l'ordre de la config
 * @property {Record<string, ComponentInstance>} componentsByRole    - Instance unique par `role`
 *   déclaré (voir `ComponentMount.role`) — c'est la seule surface qu'un `*.wire.js` doit lire pour
 *   adresser un composant précis.
 * @property {{ instance: ComponentInstance, mount: ComponentMount }[]} boundMounts - Interne à
 *   scene-runtime.js (S8) : composants ayant des options `$bind` ou un `trigger`, ré-évalués à
 *   chaque changement d'état. Les `*.wire.js` n'ont pas besoin d'y toucher.
 * @property {() => void} destroy                                     - Démontage complet : cleanup du wire, `destroy()` de chaque composant, retrait de `root`
 */

/**
 * Module de câblage d'une scène (AD-6) : abonne les composants montés au store.
 * `REQUIRED_ROLES` (optionnel, propriété statique sur la fonction) déclare les `role` que ce wire
 * lit dans `mounted.componentsByRole` — `scene-runtime.js` vérifie leur présence avant d'appeler
 * `wire()` ; si un rôle manque, le wiring de la scène est sauté entièrement (dégradé : la mise en
 * page s'affiche, l'interactivité de ce wire non — voir docs/inbox.md).
 * @typedef {{ (mounted: MountedScene): () => void, REQUIRED_ROLES?: string[] }} SceneWire
 */

// Export vide pour permettre l'import en module si besoin
export {};

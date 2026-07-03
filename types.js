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
 * Identifiants de scène valides.
 * @typedef {'discussion'|'codage'|'brb'|'interview'|'react'|'creation'|'fin'|'jeu'|'starting'} SceneId
 */

/**
 * Niveaux de visibilité de l'overlay (axe orthogonal à la scène).
 * - full    : toutes les couches visibles
 * - minimal : goldbar uniquement (+ DotGrid fond permanent)
 * - hidden  : aucune couche visible, body transparent (cinématique)
 * @typedef {'full'|'minimal'|'hidden'} VisibilityLevel
 */

/**
 * Modes ambiants de DotGridAnimated.
 * null = scène sans DotGrid (ex : jeu).
 * @typedef {'discussion'|'codage'|'brb'|'interview'|'react'|'creation'|'fin'|'starting'|null} DotGridMode
 */

/**
 * Type de transition entre deux scènes.
 * - crossfade : fondu croisé en opacité (comportement par défaut)
 * - cut       : changement instantané (duration et easing ignorés)
 * @typedef {'crossfade'|'cut'} TransitionType
 */

/**
 * Easing des transitions entre scènes (ignoré si type === 'cut').
 * @typedef {'easeInOut'|'easeIn'|'easeOut'|'linear'} TransitionEasing
 */

/**
 * Noms des composants JS montables dans une couche.
 * Résolu via registry dans le runtime S3.
 * @typedef {'GoldBar'|'StatBlock'|'ChatFeed'|'PomodoroBar'|'AlertBanner'} ComponentName
 */

/**
 * Une instance de composant à monter dans une couche.
 * @typedef {Object} ComponentMount
 * @property {ComponentName} component - Nom résolu par le registry
 * @property {Record<string, unknown>} options - Options statiques passées au constructeur
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
 * Configuration d'une couche nommée dans une scène.
 * `name` devient la valeur de l'attribut `data-layer` en S3.
 * @typedef {Object} LayerConfig
 * @property {string} name - Identifiant unique dans la scène (ex : 'chat', 'goldbar')
 * @property {ComponentMount[]} components - Composants à monter (tableau vide = DOM pur)
 * @property {LayerVisibility} visibility
 */

/**
 * Paramètres de transition lors d'un changement de scène.
 * Déclarés par la scène ENTRANTE.
 * @typedef {Object} SceneTransition
 * @property {TransitionType} type
 * @property {number} duration - Durée en ms (ignoré si type === 'cut')
 * @property {TransitionEasing} easing - (ignoré si type === 'cut')
 */

/**
 * Configuration complète et sérialisable d'une scène.
 * Format que le runtime S3 lit, et que l'éditeur de scènes écrira.
 * @typedef {Object} SceneConfig
 * @property {SceneId} id
 * @property {DotGridMode} dotgridMode - null si la scène n'utilise pas DotGrid
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
 * @property {() => void} [destroy]                 - Libère les ressources (observers, timers)
 */

/**
 * Scène montée dans le DOM par le runtime — résultat de `mountScene(id)`.
 * @typedef {Object} MountedScene
 * @property {SceneId} id
 * @property {HTMLElement} root                                       - Conteneur de la scène (enfant de #scene-root)
 * @property {Record<string, ComponentInstance[]>} componentsByLayer - Instances groupées par `name` de couche, dans l'ordre de la config
 * @property {() => void} destroy                                     - Démontage complet : cleanup du wire, `destroy()` de chaque composant, retrait de `root`
 */

/**
 * Module de câblage d'une scène (AD-6) : abonne les composants montés au store.
 * @callback SceneWire
 * @param {MountedScene} mounted
 * @returns {() => void} Fonction de désabonnement (cleanup), appelée au démontage
 */

// Export vide pour permettre l'import en module si besoin
export {};

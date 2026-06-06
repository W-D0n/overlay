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

// Export vide pour permettre l'import en module si besoin
export {};

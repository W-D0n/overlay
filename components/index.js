// @ts-check
import { canvasPixelRatio } from './canvas-runtime.js';
/**
 * components/index.js — Composants UI réutilisables
 *
 * Chaque composant est une fonction qui :
 *   1. Crée un élément DOM
 *   2. Expose une méthode update(data) pour le rafraîchir
 *   3. Retourne { el, update } pour l'intégration dans une scène
 *
 * USAGE dans une scène :
 *   import { DotGrid, GoldBar, StatBlock, ChatFeed, PomodoroBar } from '../components/index.js';
 *
 *   const grid = DotGrid();
 *   document.body.appendChild(grid.el);
 *
 *   const viewers = StatBlock({ label: 'VIEWERS', value: '0' });
 *   document.getElementById('stats').appendChild(viewers.el);
 *
 *   onStateChange(state => {
 *     viewers.update({ value: state.viewers.toLocaleString() });
 *   });
 */

// ─── DotGrid ──────────────────────────────────────────────────────────────────

/**
 * Fond grille de points — signature visuelle Atelier.
 * Rendu via canvas pour de meilleures performances que SVG répété.
 *
 * @returns {{ el: HTMLCanvasElement, destroy: () => void }}
 */
export function DotGrid() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: var(--z-bg, 0);
  `;

  /** Dessiner la grille sur le canvas. */
  function draw() {
    const dpr = canvasPixelRatio();
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;

    canvas.width  = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const spacing = 20;
    const radius  = 0.7;

    ctx.fillStyle = `rgba(200, 185, 122, 0.18)`;

    for (let x = spacing; x < w; x += spacing) {
      for (let y = spacing; y < h; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Redessiner si la fenêtre est redimensionnée
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);

  // Premier rendu après insertion dans le DOM
  requestAnimationFrame(draw);

  return {
    el: canvas,
    /** Arrêter l'observation (nettoyage mémoire). */
    destroy: () => observer.disconnect(),
  };
}

// ─── GoldBar ──────────────────────────────────────────────────────────────────

/**
 * Barre dorée signature — haut ou bas de chaque scène.
 *
 * @param {{ position?: 'top' | 'bottom', opacity?: number }} [options]
 * @returns {{ el: HTMLDivElement }}
 */
export function GoldBar({ position = 'top', opacity = 1 } = {}) {
  const el = document.createElement('div');

  const isTop = position === 'top';
  el.style.cssText = `
    position: absolute;
    ${isTop ? 'top: 0' : 'bottom: 0'};
    left: 0;
    right: 0;
    height: 2.5px;
    background: #C8B97A;
    opacity: ${isTop ? 0.85 * opacity : 0.3 * opacity};
    z-index: var(--z-overlay, 20);
    pointer-events: none;
  `;

  return { el };
}

// ─── StatBlock ────────────────────────────────────────────────────────────────

/**
 * Bloc label + valeur — utilisé pour Viewers, Durée, Session, etc.
 *
 * @param {{
 *   label: string,
 *   value: string,
 *   valueColor?: string,
 *   minWidth?: string
 * }} options
 * @returns {{ el: HTMLDivElement, update: (opts: { label?: string, value?: string }) => void }}
 */
export function StatBlock({ label, value, valueColor = '#F2F0EC', minWidth = 'auto' }) {
  const el = document.createElement('div');
  el.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: ${minWidth};
  `;

  const labelEl = document.createElement('span');
  labelEl.style.cssText = `
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 7px);
    color: var(--color-text-mid, #9A9890);
    letter-spacing: var(--tracking-label, 0.12em);
    text-transform: uppercase;
  `;
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.style.cssText = `
    font-family: var(--font-serif, 'Times New Roman', serif);
    font-size: var(--text-xl, 18px);
    font-weight: 700;
    color: ${valueColor};
    line-height: 1;
  `;
  valueEl.textContent = value;

  el.appendChild(labelEl);
  el.appendChild(valueEl);

  return {
    el,
    /**
     * Mettre à jour label et/ou valeur.
     * @param {{ label?: string, value?: string }} opts
     */
    update({ label: newLabel, value: newValue } = {}) {
      if (newLabel !== undefined) labelEl.textContent = newLabel;
      if (newValue !== undefined) valueEl.textContent = newValue;
    },
  };
}

// ─── ChatFeed ─────────────────────────────────────────────────────────────────

/**
 * Fil de chat — affiche les N derniers messages avec auto-scroll.
 *
 * @param {{ maxMessages?: number, fontSize?: string }} [options]
 * @returns {{
 *   el: HTMLDivElement,
 *   update: (messages: import('../types.js').ChatMessage[]) => void
 * }}
 */
export function ChatFeed({ maxMessages = 8, fontSize = '8px' } = {}) {
  const el = document.createElement('div');
  el.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
    height: 100%;
  `;

  /**
   * Créer une ligne de message.
   * @param {import('../types.js').ChatMessage} msg
   * @returns {HTMLDivElement}
   */
  function createMessageRow(msg) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      flex-direction: column;
      padding: 6px 0;
      border-bottom: 0.3px solid var(--color-rule, #1E1E22);
      flex-shrink: 0;
    `;

    const user = document.createElement('span');
    user.style.cssText = `
      font-family: var(--font-mono, monospace);
      font-size: ${fontSize};
      color: var(--color-gold, #C8B97A);
      margin-bottom: 2px;
    `;
    user.textContent = msg.username;

    const text = document.createElement('span');
    text.style.cssText = `
      font-family: var(--font-mono, monospace);
      font-size: ${fontSize};
      color: var(--color-text-primary, #F2F0EC);
    `;
    text.textContent = ` ${msg.text}`;

    row.appendChild(user);
    row.appendChild(text);
    return row;
  }

  return {
    el,
    /**
     * Remplacer la liste de messages.
     * @param {import('../types.js').ChatMessage[]} messages
     */
    update(messages) {
      el.innerHTML = '';
      const visible = messages.slice(0, maxMessages);
      visible.forEach(msg => el.appendChild(createMessageRow(msg)));
    },
  };
}

// ─── PomodoroBar ──────────────────────────────────────────────────────────────

/**
 * Timer Pomodoro — affiche le temps restant + barre de progression.
 *
 * @returns {{
 *   el: HTMLDivElement,
 *   update: (state: import('../types.js').PomodoroState) => void
 * }}
 */
export function PomodoroBar() {
  const el = document.createElement('div');
  el.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;

  // Label
  const labelEl = document.createElement('span');
  labelEl.style.cssText = `
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 7px);
    color: var(--color-text-mid, #9A9890);
    letter-spacing: var(--tracking-label, 0.12em);
    text-transform: uppercase;
  `;
  labelEl.textContent = 'POMODORO';

  // Temps
  const timeEl = document.createElement('span');
  timeEl.style.cssText = `
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xl, 18px);
    color: var(--color-gold, #C8B97A);
    line-height: 1;
  `;
  timeEl.textContent = '25:00';

  // Barre de progression
  const trackEl = document.createElement('div');
  trackEl.style.cssText = `
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--color-rule-mid, #2A2A32);
    overflow: hidden;
  `;

  const fillEl = document.createElement('div');
  fillEl.style.cssText = `
    height: 100%;
    border-radius: 2px;
    background: var(--color-gold-dim, rgba(200,185,122,0.5));
    width: 100%;
    transition: width 1s linear;
  `;
  trackEl.appendChild(fillEl);

  // Info session
  const infoEl = document.createElement('span');
  infoEl.style.cssText = `
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 7px);
    color: var(--color-text-mid, #9A9890);
  `;
  infoEl.textContent = 'focus · session 1/4';

  el.appendChild(labelEl);
  el.appendChild(timeEl);
  el.appendChild(trackEl);
  el.appendChild(infoEl);

  return {
    el,
    /**
     * Mettre à jour l'affichage du pomodoro.
     * @param {import('../types.js').PomodoroState} state
     */
    update(state) {
      // Formater MM:SS
      const m   = Math.floor(state.secondsLeft / 60).toString().padStart(2, '0');
      const s   = (state.secondsLeft % 60).toString().padStart(2, '0');
      timeEl.textContent = `${m}:${s}`;

      // Progression (inversée : plein au départ, vide à la fin)
      const ratio = state.totalSeconds > 0
        ? state.secondsLeft / state.totalSeconds
        : 0;
      fillEl.style.width = `${Math.round(ratio * 100)}%`;

      // Phase
      const phaseLabel = state.phase === 'break' ? 'pause' : 'focus';
      infoEl.textContent = `${phaseLabel} · session ${state.sessionIndex}/${state.totalSessions}`;
    },
  };
}

// ─── AlertBanner ──────────────────────────────────────────────────────────────

/**
 * Bannière d'alerte — apparaît pour les follows, subs, raids.
 * Se cache automatiquement après le délai spécifié.
 *
 * @param {{ displayDuration?: number }} [options] - Durée d'affichage en ms
 * @returns {{
 *   el: HTMLDivElement,
 *   show: (alert: import('../types.js').AlertEvent) => void,
 *   destroy: () => void
 * }}
 */
export function AlertBanner({ displayDuration = 5000 } = {}) {
  const el = document.createElement('div');
  el.style.cssText = `
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: var(--color-bg-widget, #0D0D0F);
    border: var(--border-gold, 0.5px solid #C8B97A);
    border-radius: var(--radius-md, 4px);
    padding: 16px 32px;
    text-align: center;
    opacity: 0;
    transition:
      opacity var(--transition-normal, 0.4s) ease,
      transform var(--transition-normal, 0.4s) ease;
    pointer-events: none;
    z-index: var(--z-alert, 30);
    white-space: nowrap;
  `;

  const typeEl = document.createElement('div');
  typeEl.style.cssText = `
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 7px);
    color: var(--color-gold, #C8B97A);
    letter-spacing: var(--tracking-label, 0.12em);
    text-transform: uppercase;
    margin-bottom: 6px;
  `;

  const nameEl = document.createElement('div');
  nameEl.style.cssText = `
    font-family: var(--font-serif, 'Times New Roman', serif);
    font-size: var(--text-2xl, 24px);
    font-weight: 700;
    color: var(--color-text-primary, #F2F0EC);
    margin-bottom: 4px;
  `;

  const subEl = document.createElement('div');
  subEl.style.cssText = `
    font-family: var(--font-mono, monospace);
    font-size: var(--text-sm, 8px);
    color: var(--color-text-mid, #9A9890);
  `;

  el.appendChild(typeEl);
  el.appendChild(nameEl);
  el.appendChild(subEl);

  /** @type {ReturnType<typeof setTimeout>|null} */
  let hideTimer = null;

  /** Labels par type d'alerte */
  const TYPE_LABELS = {
    follow: 'NOUVEAU FOLLOWER',
    sub:    'NOUVEAU SUBSCRIBER',
    raid:   'RAID',
    bits:   'BITS',
  };

  /** Sous-textes par type */
  const TYPE_SUBS = {
    follow: 'Merci de rejoindre l\'atelier.',
    sub:    (amount) => `Merci pour ${amount ?? 1} mois !`,
    raid:   (amount) => `${amount ?? 0} viewers arrivent !`,
    bits:   (amount) => `${amount ?? 0} bits — merci !`,
  };

  return {
    el,
    /**
     * Afficher une alerte.
     * @param {import('../types.js').AlertEvent} alert
     */
    show(alert) {
      if (hideTimer) clearTimeout(hideTimer);

      typeEl.textContent = TYPE_LABELS[alert.type] ?? alert.type.toUpperCase();
      nameEl.textContent = alert.username;

      const sub = TYPE_SUBS[alert.type];
      subEl.textContent = typeof sub === 'function' ? sub(alert.amount) : sub;

      // Animer l'apparition
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';

      // Cacher après displayDuration ms
      hideTimer = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(20px)';
      }, displayDuration);
    },

    /** Libérer le timer de masquage (cleanup au démontage de la scène, AC-39). */
    destroy() {
      if (hideTimer) clearTimeout(hideTimer);
    },
  };
}

// ─── Box (S8) ───────────────────────────────────────────────────────────────

/**
 * Rectangle bordé — placeholder visuel générique (caméra, capture, zone d'accueil OBS).
 * Statique (pas de `update`) : aucun cas d'usage lié aux données aujourd'hui.
 *
 * @param {{ borderRadius?: string, borderColor?: string, background?: string, className?: string }} [options]
 * @returns {{ el: HTMLDivElement }}
 *
 * `className` (S8, migration) : si fourni, le style (dimensions fixes, marges) vient à 100% d'une
 * classe CSS existante — utile quand la boîte n'occupe pas 100%/100% de son placement (ex. une
 * cam mini de taille fixe dans une colonne flex). `borderRadius`/`borderColor`/`background` sont
 * ignorés dans ce cas.
 */
export function Box({ borderRadius = 'var(--radius-md)', borderColor = 'var(--border-panel)', background = 'var(--color-bg-panel)', className } = {}) {
  const el = document.createElement('div');
  if (className !== undefined) {
    el.className = className;
  } else {
    el.style.cssText = `
      width: 100%;
      height: 100%;
      border-radius: ${borderRadius};
      border: ${borderColor};
      background: ${background};
      box-sizing: border-box;
    `;
  }
  return { el };
}

// ─── Divider (S8) ─────────────────────────────────────────────────────────────

/**
 * Ligne fine — séparateur horizontal ou vertical.
 * Statique (pas de `update`).
 *
 * @param {{ orientation?: 'horizontal' | 'vertical', thickness?: string, color?: string, className?: string }} [options]
 * @returns {{ el: HTMLDivElement }}
 *
 * `className` (S8, migration) : si fourni (même vide `''`), le style vient à 100% du CSS existant
 * de la scène (marges, dimensions déjà en place, y compris un sélecteur descendant type
 * `.parent div` qui ne dépend d'aucune classe sur l'élément lui-même) — `orientation`/`thickness`/
 * `color` sont ignorés dans ce cas. `className` absent (`undefined`) = comportement générique par
 * défaut (nouvelle scène sans CSS dédié).
 */
export function Divider({ orientation = 'horizontal', thickness = '1px', color = 'var(--color-rule)', className } = {}) {
  const el = document.createElement('div');
  if (className !== undefined) {
    el.className = className;
  } else {
    const isHorizontal = orientation === 'horizontal';
    el.style.cssText = isHorizontal
      ? `width: 100%; height: ${thickness}; background: ${color};`
      : `width: ${thickness}; height: 100%; background: ${color};`;
  }
  return { el };
}

// ─── TextLabel (S8) ───────────────────────────────────────────────────────────

/**
 * Texte stylé générique — titres, labels, valeurs.
 *
 * @param {{ text?: string, font?: 'serif' | 'mono', size?: string, color?: string, weight?: string, className?: string, tag?: string }} [options]
 * @returns {{ el: HTMLElement, update: (opts: { text?: string }) => void }}
 *
 * `className` (S8, migration) : si fourni (même vide `''`), le style (police, taille, couleur,
 * marges) vient à 100% du CSS existant de la scène — `font`/`size`/`color`/`weight` sont ignorés
 * dans ce cas. Une chaîne vide est utile quand le CSS d'origine cible l'élément via un sélecteur
 * descendant (ex. `.creation-name-block h1`), sans classe sur l'élément lui-même.
 * `tag` (défaut `'div'`) permet `'h1'`/`'span'` si la sémantique du CSS d'origine en dépend.
 */
export function TextLabel({ text = '', font = 'serif', size = '16px', color = 'var(--color-text-primary)', weight = '400', className, tag = 'div' } = {}) {
  const el = document.createElement(tag);
  if (className !== undefined) {
    el.className = className;
  } else {
    el.style.cssText = `
      font-family: var(--font-${font});
      font-size: ${size};
      color: ${color};
      font-weight: ${weight};
    `;
  }
  el.textContent = text;
  return {
    el,
    /** @param {{ text?: string }} opts */
    update({ text: newText } = {}) {
      if (newText !== undefined) el.textContent = newText;
    },
  };
}

// ─── TextList (S8) ────────────────────────────────────────────────────────────

/**
 * Liste de lignes de texte — la 1ère ligne pleine opacité (`itemClass` seul), les suivantes
 * atténuées (`itemClass dim`). Le style (couleur, police, taille) vient à 100% du CSS scopé de la
 * scène via `itemClass`/`.dim` — ce composant ne fixe aucune couleur en inline (chaque scène a des
 * couleurs de mise en avant différentes : or pour les liens sociaux, texte primaire pour un récap —
 * un inline unique casserait l'une des deux, corrigé après l'avoir constaté en migration S8).
 *
 * @param {{ lines?: string[], itemClass?: string }} [options]
 * @returns {{ el: HTMLDivElement, update: (lines: string[]) => void }}
 */
export function TextList({ lines = [], itemClass = '' } = {}) {
  const el = document.createElement('div');
  el.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

  /**
   * @param {string[]} items
   */
  function render(items) {
    el.innerHTML = '';
    if (!Array.isArray(items)) return;
    items.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = itemClass + (i > 0 ? ' dim' : '');
      row.textContent = line;
      el.appendChild(row);
    });
  }
  render(lines);

  return {
    el,
    /** @param {string[]} newLines */
    update(newLines) {
      render(newLines ?? []);
    },
  };
}

// ─── PollBar (S8) ─────────────────────────────────────────────────────────────

/**
 * Barre de vote — question + barre de progression + ratio.
 * Remplace le HTML en dur du vote chat de la scène `jeu`.
 *
 * @param {{ question?: string, yesRatio?: number }} [options]
 * @returns {{ el: HTMLDivElement, update: (opts: { question?: string, yesRatio?: number }) => void }}
 */
export function PollBar({ question = '', yesRatio = 0 } = {}) {
  const el = document.createElement('div');
  el.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

  const questionEl = document.createElement('span');
  questionEl.style.cssText = 'font-family: var(--font-mono); font-size: 22px; color: var(--color-text-primary);';

  const track = document.createElement('div');
  track.style.cssText = 'width: 240px; height: 6px; border-radius: 3px; background: var(--color-rule-mid); overflow: hidden;';

  const fill = document.createElement('div');
  fill.style.cssText = 'height: 100%; border-radius: 3px; background: var(--color-gold-dim); transition: width 0.6s ease;';
  track.appendChild(fill);

  const ratioEl = document.createElement('span');
  ratioEl.style.cssText = 'font-family: var(--font-mono); font-size: 18px; color: var(--color-text-mid);';

  el.appendChild(questionEl);
  el.appendChild(track);
  el.appendChild(ratioEl);

  /**
   * @param {{ question?: string, yesRatio?: number }} opts
   */
  function render({ question: q, yesRatio: r }) {
    const percent = Math.round((r ?? 0) * 100);
    questionEl.textContent = q ?? '';
    fill.style.width = `${percent}%`;
    ratioEl.textContent = `${percent}% oui`;
  }
  render({ question, yesRatio });

  return { el, update: render };
}

// ─── Badge (S8) ───────────────────────────────────────────────────────────────

/**
 * Pastille courte — texte + fond coloré (ex : "+follow", "LIVE").
 * Demande explicite owner (2026-07-04), pas d'occurrence dans les scènes actuelles.
 *
 * @param {{ text?: string, color?: string }} [options]
 * @returns {{ el: HTMLDivElement, update: (opts: { text?: string, color?: string }) => void }}
 */
export function Badge({ text = '', color = 'var(--color-gold)' } = {}) {
  const el = document.createElement('div');
  el.style.cssText = `
    display: inline-flex;
    padding: 4px 10px;
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: #0A0A0C;
  `;
  el.style.background = color;
  el.textContent = text;
  return {
    el,
    /** @param {{ text?: string, color?: string }} opts */
    update({ text: newText, color: newColor } = {}) {
      if (newText !== undefined) el.textContent = newText;
      if (newColor !== undefined) el.style.background = newColor;
    },
  };
}

// ─── Image (S8) ───────────────────────────────────────────────────────────────

/**
 * Un chemin d'asset est "externe" s'il porte un schéma d'URL (`http://`, `https://`, `data:`…).
 * Logique pure — testable sans DOM. Exportée pour `components/index.test.js`.
 * @param {string} src
 * @returns {boolean}
 */
export function isExternalAssetPath(src) {
  return /^[a-z][a-z0-9+.-]*:/i.test(src);
}

/**
 * Logo/icône — asset local uniquement (contrainte sécurité, voir
 * docs/specs/scene-config-protocol.md §Sécurité : jamais une URL externe arbitraire).
 * Demande explicite owner (2026-07-04), pas d'occurrence dans les scènes actuelles.
 *
 * @param {{ src: string, width?: string, height?: string }} options
 * @returns {{ el: HTMLImageElement }}
 */
export function Image({ src, width, height }) {
  if (isExternalAssetPath(src)) {
    throw new Error(`Image: src doit être un chemin local relatif, pas une URL externe : ${src}`);
  }
  const el = document.createElement('img');
  el.src = src;
  if (width) el.style.width = width;
  if (height) el.style.height = height;
  return { el };
}

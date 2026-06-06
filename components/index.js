// @ts-check
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
    const dpr = window.devicePixelRatio || 1;
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
 *   show: (alert: import('../types.js').AlertEvent) => void
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
  };
}

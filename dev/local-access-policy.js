// @ts-check
/**
 * dev/local-access-policy.js — Règles d'accès des serveurs de dev : boucle locale uniquement.
 *
 * Les serveurs écoutent sur `LOOPBACK_HOST` (jamais sur le réseau) ; ces règles couvrent le reste de
 * la surface : une page web ouverte dans le navigateur de l'owner (Origin étrangère, ou DNS
 * rebinding qui change le Host) ne doit ni lire ni modifier l'état, et le serveur statique ne sert
 * que les fichiers de l'overlay — jamais `.env`, `.git`, `docs/`, `src-tauri/` ni l'état persisté.
 */

export const LOOPBACK_HOST = '127.0.0.1';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', 'tauri.localhost']);

/** Extensions d'assets de l'overlay ; tout le reste (`.md`, `.bat`, `.toml`, `.env`…) est refusé. */
const SERVABLE_EXTENSIONS = new Set(['html', 'js', 'css', 'json', 'png', 'svg', 'ico', 'woff2']);
/** Dossiers servables ; à la racine, seuls les fichiers à extension autorisée le sont. */
const SERVABLE_DIRECTORIES = new Set(['src', 'dev']);
/** Sous-dossiers de `SERVABLE_DIRECTORIES` jamais servables. */
const PRIVATE_SUBPATHS = ['dev/data'];

/**
 * @param {string} pathname Chemin brut de la requête (encodé).
 * @returns {boolean}
 */
export function isServablePath(pathname) {
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes('%00')) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return false;

  const segments = decoded.split('/').slice(1);
  if (segments.some((segment) => segment === '' || segment.startsWith('.'))) return false;

  const relative = segments.join('/');
  if (PRIVATE_SUBPATHS.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) return false;
  if (segments.length > 1 && !SERVABLE_DIRECTORIES.has(segments[0])) return false;

  const name = segments[segments.length - 1];
  const dot = name.lastIndexOf('.');
  return dot > 0 && SERVABLE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** @param {string | null | undefined} hostHeader */
export function isLocalHost(hostHeader) {
  if (typeof hostHeader !== 'string' || hostHeader === '') return false;
  const hostname = hostHeader.startsWith('[')
    ? hostHeader.slice(0, hostHeader.indexOf(']') + 1)
    : hostHeader.split(':')[0];
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

/** @param {string} origin */
export function isLocalOrigin(origin) {
  try {
    const { protocol, host } = new URL(origin);
    return (protocol === 'http:' || protocol === 'https:') && isLocalHost(host);
  } catch {
    return false;
  }
}

/**
 * Refuse toute requête dont le Host ou l'Origin n'est pas local. Une requête sans Origin
 * (navigation, outil en ligne de commande) est acceptée : elle n'a pas pu partir d'une page tierce.
 * `anyOrigin` laisse l'Origin libre pour un point d'entrée qu'un site tiers doit pouvoir joindre et qui se protège autrement (le jeton du
 * canal Twitchat) ; le Host, lui, reste exigé local. `opaqueOrigin` accepte seulement l'Origin `null` — celle d'une page isolée (`sandbox`
 * sans `allow-same-origin`), qui n'en a pas d'autre : c'est ce que la lecture d'un fichier de la médiathèque par une couche Code exige.
 * @param {Request} req
 * @param {{ anyOrigin?: boolean, opaqueOrigin?: boolean }} [options]
 * @returns {Response | null} Une 403 à renvoyer telle quelle, ou `null` si la requête est acceptable.
 */
export function rejectNonLocalRequest(req, { anyOrigin = false, opaqueOrigin = false } = {}) {
  const origin = req.headers.get('origin');
  const originAllowed = anyOrigin || origin === null || (opaqueOrigin && origin === 'null') || isLocalOrigin(origin);
  const refused = !isLocalHost(req.headers.get('host') ?? new URL(req.url).host) || !originAllowed;
  return refused ? new Response('Forbidden', { status: 403 }) : null;
}

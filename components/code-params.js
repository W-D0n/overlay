// @ts-check
import { errorMessage } from '../dev/error-message.js';
import { CODE_PARAMS_MAX_CHARS } from '../layer-kinds.js';

/**
 * components/code-params.js — Les réglages qu'une couche Code expose : la déclaration (un texte JSON écrit par l'auteur du code), les valeurs
 * qu'on en tire, et la vue « formulaire » que le Studio présente. Pur : ni DOM ni réseau.
 *
 * La déclaration est de la **donnée**, lue par l'hôte : un réglage n'existe pas parce que du code l'a annoncé en s'exécutant (un script qui plante
 * ou qui boucle ne ferait alors apparaître aucun champ), mais parce que la déclaration est valide. Une déclaration invalide ne casse rien : elle donne
 * zéro réglage et la liste de ses défauts, que le Studio montre sous le champ.
 *
 * @typedef {'number' | 'text' | 'color' | 'boolean' | 'select'} ParamType
 * @typedef {{ key: string, label: string, type: ParamType, default: number | string | boolean, min?: number, max?: number, step?: number, choices?: string[] }} ParamDefinition
 * @typedef {Record<string, number | string | boolean>} ParamValues
 */

export const MAX_PARAMS = 24;
export const PARAM_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,31}$/;
export const PARAM_TYPES = /** @type {const} */ (['number', 'text', 'color', 'boolean', 'select']);
const MAX_LABEL = 60;
const MAX_TEXT_VALUE = 500;
const MAX_CHOICES = 24;
const MAX_CHOICE = 60;

/** @param {unknown} value @returns {value is number} */
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Lit la déclaration des réglages. Une entrée invalide est écartée avec son défaut ; les autres sont gardées.
 * @param {unknown} text
 * @returns {{ params: ParamDefinition[], errors: string[] }}
 */
export function parseParamSpec(text) {
  if (typeof text !== 'string' || text.trim() === '') return { params: [], errors: [] };
  if (text.length > CODE_PARAMS_MAX_CHARS) return { params: [], errors: [`la déclaration dépasse ${CODE_PARAMS_MAX_CHARS} caractères`] };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { params: [], errors: [`JSON invalide : ${errorMessage(error)}`] };
  }
  if (!Array.isArray(parsed)) return { params: [], errors: ['une liste de réglages est attendue : [ { "key": … }, … ]'] };
  /** @type {ParamDefinition[]} */
  const params = [];
  /** @type {string[]} */
  const errors = [];
  const seen = new Set();
  parsed.forEach((entry, index) => {
    const at = `réglage ${index + 1}`;
    if (params.length >= MAX_PARAMS) {
      if (index === MAX_PARAMS) errors.push(`${MAX_PARAMS} réglages au plus : les suivants sont ignorés`);
      return;
    }
    const definition = readDefinition(entry, at);
    if (typeof definition === 'string') { errors.push(definition); return; }
    if (seen.has(definition.key)) { errors.push(`${at} : la clé « ${definition.key} » est déjà prise`); return; }
    seen.add(definition.key);
    params.push(definition);
  });
  return { params, errors };
}

/**
 * @param {unknown} entry
 * @param {string} at
 * @returns {ParamDefinition | string} la définition, ou le défaut
 */
function readDefinition(entry, at) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return `${at} : un objet est attendu`;
  const { key, label, type, min, max, step, choices } = /** @type {Record<string, unknown>} */ (entry);
  const fallback = /** @type {Record<string, unknown>} */ (entry).default;
  if (typeof key !== 'string' || !PARAM_KEY_PATTERN.test(key)) return `${at} : la clé doit commencer par une minuscule et ne porter que des lettres, chiffres et _ (32 au plus)`;
  if (typeof type !== 'string' || !PARAM_TYPES.includes(/** @type {*} */ (type))) return `${at} (${key}) : type inconnu — number, text, color, boolean ou select`;
  const name = typeof label === 'string' && label.trim() !== '' ? label.trim().slice(0, MAX_LABEL) : key;
  if (type === 'number') {
    if (!isNumber(fallback)) return `${at} (${key}) : « default » doit être un nombre`;
    const low = isNumber(min) ? min : undefined;
    const high = isNumber(max) ? max : undefined;
    if (low !== undefined && high !== undefined && low > high) return `${at} (${key}) : « min » dépasse « max »`;
    return {
      key, label: name, type, default: clampNumber(fallback, low, high),
      ...(low === undefined ? {} : { min: low }),
      ...(high === undefined ? {} : { max: high }),
      ...(isNumber(step) && step > 0 ? { step } : {}),
    };
  }
  if (type === 'boolean') {
    if (typeof fallback !== 'boolean') return `${at} (${key}) : « default » doit être true ou false`;
    return { key, label: name, type, default: fallback };
  }
  if (type === 'select') {
    if (!Array.isArray(choices) || choices.length === 0 || choices.length > MAX_CHOICES || !choices.every((choice) => typeof choice === 'string' && choice !== '' && choice.length <= MAX_CHOICE)) {
      return `${at} (${key}) : « choices » est une liste de 1 à ${MAX_CHOICES} textes non vides`;
    }
    if (typeof fallback !== 'string' || !choices.includes(fallback)) return `${at} (${key}) : « default » doit être l'un des choix`;
    return { key, label: name, type, default: fallback, choices: [...choices] };
  }
  if (typeof fallback !== 'string') return `${at} (${key}) : « default » doit être un texte`;
  return { key, label: name, type: /** @type {'text' | 'color'} */ (type), default: fallback.slice(0, MAX_TEXT_VALUE) };
}

/** @param {number} value @param {number | undefined} low @param {number | undefined} high */
function clampNumber(value, low, high) {
  const raised = low === undefined ? value : Math.max(low, value);
  return high === undefined ? raised : Math.min(high, raised);
}

/**
 * Les valeurs complètes des réglages : celle qui est donnée si elle convient au type, sinon le défaut. Une clé que la déclaration ne connaît pas
 * est écartée (la déclaration a pu perdre un réglage depuis).
 * @param {readonly ParamDefinition[]} params
 * @param {unknown} raw
 * @returns {ParamValues}
 */
export function normalizeParamValues(params, raw) {
  const given = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {};
  /** @type {ParamValues} */
  const values = {};
  for (const definition of params) {
    const value = Object.hasOwn(given, definition.key) ? given[definition.key] : undefined;
    values[definition.key] = acceptable(definition, value) ? adjust(definition, value) : definition.default;
  }
  return values;
}

/** @param {ParamDefinition} definition @param {unknown} value @returns {value is number | string | boolean} */
function acceptable(definition, value) {
  switch (definition.type) {
    case 'number': return isNumber(value);
    case 'boolean': return typeof value === 'boolean';
    case 'select': return typeof value === 'string' && (definition.choices ?? []).includes(value);
    default: return typeof value === 'string';
  }
}

/** @param {ParamDefinition} definition @param {number | string | boolean} value */
function adjust(definition, value) {
  if (definition.type === 'number') return clampNumber(/** @type {number} */ (value), definition.min, definition.max);
  if (definition.type === 'text' || definition.type === 'color') return /** @type {string} */ (value).slice(0, MAX_TEXT_VALUE);
  return value;
}

/**
 * La vue « formulaire » des réglages, au format des champs du Studio (`layer-kinds.js`).
 * @param {readonly ParamDefinition[]} params
 * @returns {import('../layer-kinds.js').FieldSchema[]}
 */
export function paramFieldSchemas(params) {
  return params.map((definition) => {
    /** @type {import('../layer-kinds.js').FieldSchema} */
    const field = { key: definition.key, label: definition.label, type: definition.type === 'number' ? 'number' : definition.type === 'select' ? 'select' : definition.type === 'boolean' ? 'boolean' : definition.type === 'color' ? 'color' : 'text', default: definition.default };
    if (definition.type === 'number') {
      if (definition.min !== undefined) field.min = definition.min;
      if (definition.max !== undefined) field.max = definition.max;
      if (definition.step !== undefined) field.step = definition.step;
      if (definition.min !== undefined && definition.max !== undefined) field.control = 'slider';
    }
    if (definition.type === 'select') field.choices = [...(definition.choices ?? [])];
    return field;
  });
}

/**
 * Les variables CSS des réglages : `--param-<clé>`. Un nombre est sans unité, un booléen vaut 1 ou 0, un texte est mis entre guillemets (il
 * s'emploie dans `content:`), une couleur ou un choix reste tel quel (`color: var(--param-couleur)`).
 * @param {readonly ParamDefinition[]} params
 * @param {ParamValues} values
 * @returns {Record<string, string>}
 */
export function paramCssVariables(params, values) {
  /** @type {Record<string, string>} */
  const variables = {};
  for (const definition of params) {
    const value = values[definition.key];
    variables[`--param-${definition.key}`] = typeof value === 'boolean' ? (value ? '1' : '0')
      : typeof value === 'number' ? String(value)
        : definition.type === 'text' ? JSON.stringify(String(value).replace(/[\u0000-\u001f\u007f]/g, ' '))
          : String(value);
  }
  return variables;
}

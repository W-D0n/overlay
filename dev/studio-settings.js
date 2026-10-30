// @ts-check
/**
 * dev/studio-settings.js — Les réglages du Studio qui suivent l'utilisateur : ses commandes personnalisées et ses
 * préférences (unité de position, aides de vue…). Forme et validation, partagées par le serveur (qui les range dans le
 * fichier d'état, sous `studio`) et par le Studio.
 *
 * Pourquoi côté serveur : le navigateur de l'owner et l'application de bureau n'ont pas le même stockage local ; des
 * réglages gardés dans le navigateur se perdraient d'un client à l'autre. Le serveur ne connaît pas les commandes du Studio :
 * il valide la *forme* (taille, types, identifiants), pas le sens des étapes.
 *
 * @typedef {string | { op: string, args: Record<string, unknown>, target?: string, kind?: string }} CommandStep
 * @typedef {{ id: string, name: string, steps: CommandStep[], shortcut?: string }} StoredCommand
 * @typedef {Record<string, string | number | boolean>} Preferences
 * @typedef {{ id: string, name: string, layers: import('../scene-doc.js').Layer[] }} StoredTemplate
 * @typedef {{ customCommands: StoredCommand[], preferences: Preferences, templates: StoredTemplate[] }} StudioSettings
 */

import { MAX_LAYERS, validateSceneDoc } from '../scene-doc.js';

export const SETTINGS_LIMITS = Object.freeze({
  templates: 50,
  templateBytes: 60_000,
  commands: 200,
  steps: 30,
  nameLength: 40,
  shortcutLength: 40,
  stepBytes: 4000,
  preferences: 64,
  preferenceKeyLength: 64,
  preferenceValueLength: 200,
});

const TEMPLATE_ID = /^tpl\.[a-z0-9][a-z0-9-]{0,60}$/;
const COMMAND_ID = /^custom\.[a-z0-9][a-z0-9-]{0,60}$/;
const PREFERENCE_KEY = /^[a-z0-9][a-z0-9._-]*$/i;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @returns {StudioSettings} */
export function emptyStudioSettings() {
  return { customCommands: [], preferences: {}, templates: [] };
}

/**
 * @param {unknown} step
 * @param {string} where
 * @returns {string[]}
 */
function stepErrors(step, where) {
  if (typeof step === 'string') return step.length > 0 && step.length <= 80 ? [] : [`${where} : identifiant de commande invalide`];
  if (!isRecord(step)) return [`${where} : texte ou objet attendu`];
  /** @type {string[]} */
  const errors = [];
  if (typeof step.op !== 'string' || step.op.length === 0 || step.op.length > 40) errors.push(`${where}.op : nom d'opération attendu`);
  if (!isRecord(step.args)) errors.push(`${where}.args : objet attendu`);
  if (step.target !== undefined && (typeof step.target !== 'string' || step.target.length > 40)) errors.push(`${where}.target : texte attendu`);
  if (step.kind !== undefined && (typeof step.kind !== 'string' || step.kind.length > 40)) errors.push(`${where}.kind : texte attendu`);
  if (JSON.stringify(step).length > SETTINGS_LIMITS.stepBytes) errors.push(`${where} : étape trop volumineuse`);
  return errors;
}

/**
 * @param {unknown} commands
 * @returns {string[]}
 */
function commandsErrors(commands) {
  if (!Array.isArray(commands)) return ['customCommands : tableau attendu'];
  /** @type {string[]} */
  const errors = [];
  if (commands.length > SETTINGS_LIMITS.commands) errors.push(`customCommands : ${SETTINGS_LIMITS.commands} commandes au plus`);
  const ids = new Set();
  commands.forEach((command, index) => {
    const where = `customCommands[${index}]`;
    if (!isRecord(command)) {
      errors.push(`${where} : objet attendu`);
      return;
    }
    if (typeof command.id !== 'string' || !COMMAND_ID.test(command.id)) errors.push(`${where}.id : identifiant « custom.… » attendu`);
    else if (ids.has(command.id)) errors.push(`${where}.id : identifiant en double`);
    else ids.add(command.id);
    if (typeof command.name !== 'string' || command.name.trim() === '' || command.name.length > SETTINGS_LIMITS.nameLength) errors.push(`${where}.name : 1 à ${SETTINGS_LIMITS.nameLength} caractères attendus`);
    if (!Array.isArray(command.steps) || command.steps.length === 0 || command.steps.length > SETTINGS_LIMITS.steps) errors.push(`${where}.steps : 1 à ${SETTINGS_LIMITS.steps} étapes attendues`);
    else command.steps.forEach((step, stepIndex) => errors.push(...stepErrors(step, `${where}.steps[${stepIndex}]`)));
    if (command.shortcut !== undefined && (typeof command.shortcut !== 'string' || command.shortcut.length === 0 || command.shortcut.length > SETTINGS_LIMITS.shortcutLength)) errors.push(`${where}.shortcut : texte attendu`);
  });
  return errors;
}

/**
 * Un modèle : des couches enregistrées sous un nom, à insérer dans n'importe quelle scène. Les couches sont validées comme
 * celles d'une scène (types, options, placement) : un modèle corrompu n'est jamais gardé à moitié.
 * @param {unknown} templates
 * @returns {string[]}
 */
function templatesErrors(templates) {
  if (!Array.isArray(templates)) return ['templates : tableau attendu'];
  /** @type {string[]} */
  const errors = [];
  if (templates.length > SETTINGS_LIMITS.templates) errors.push(`templates : ${SETTINGS_LIMITS.templates} modèles au plus`);
  const ids = new Set();
  templates.forEach((template, index) => {
    const where = `templates[${index}]`;
    if (!isRecord(template)) {
      errors.push(`${where} : objet attendu`);
      return;
    }
    if (typeof template.id !== 'string' || !TEMPLATE_ID.test(template.id)) errors.push(`${where}.id : identifiant « tpl.… » attendu`);
    else if (ids.has(template.id)) errors.push(`${where}.id : identifiant en double`);
    else ids.add(template.id);
    if (typeof template.name !== 'string' || template.name.trim() === '' || template.name.length > SETTINGS_LIMITS.nameLength) errors.push(`${where}.name : 1 à ${SETTINGS_LIMITS.nameLength} caractères attendus`);
    if (!Array.isArray(template.layers) || template.layers.length === 0 || template.layers.length > MAX_LAYERS) {
      errors.push(`${where}.layers : 1 à ${MAX_LAYERS} couches attendues`);
    } else if (JSON.stringify(template.layers).length > SETTINGS_LIMITS.templateBytes) {
      errors.push(`${where} : modèle trop volumineux`);
    } else {
      const validation = validateSceneDoc({ version: 1, id: 'modele', name: 'modele', layers: template.layers }, { allowEmpty: true });
      if (!validation.ok) errors.push(...validation.errors.map((message) => `${where}.layers : ${message}`));
    }
  });
  return errors;
}

/**
 * @param {unknown} preferences
 * @returns {string[]}
 */
function preferencesErrors(preferences) {
  if (!isRecord(preferences)) return ['preferences : objet attendu'];
  /** @type {string[]} */
  const errors = [];
  const entries = Object.entries(preferences);
  if (entries.length > SETTINGS_LIMITS.preferences) errors.push(`preferences : ${SETTINGS_LIMITS.preferences} réglages au plus`);
  for (const [key, value] of entries) {
    if (key.length > SETTINGS_LIMITS.preferenceKeyLength || !PREFERENCE_KEY.test(key)) errors.push(`preferences.${key} : nom invalide`);
    else if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) errors.push(`preferences.${key} : texte, nombre ou booléen attendu`);
    else if (typeof value === 'string' && value.length > SETTINGS_LIMITS.preferenceValueLength) errors.push(`preferences.${key} : valeur trop longue`);
  }
  return errors;
}

/**
 * Valide des réglages complets (`customCommands` et `preferences` facultatifs : absents = vides).
 * @param {unknown} raw
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateStudioSettings(raw) {
  if (raw === undefined) return { ok: true };
  if (!isRecord(raw)) return { ok: false, errors: ['studio : objet attendu'] };
  /** @type {string[]} */
  const errors = [];
  if (raw.customCommands !== undefined) errors.push(...commandsErrors(raw.customCommands));
  if (raw.preferences !== undefined) errors.push(...preferencesErrors(raw.preferences));
  if (raw.templates !== undefined) errors.push(...templatesErrors(raw.templates));
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Les réglages à plat, complétés par leurs valeurs par défaut.
 * @param {unknown} raw un objet déjà validé (ou `undefined`)
 * @returns {StudioSettings}
 */
export function normalizeStudioSettings(raw) {
  const record = isRecord(raw) ? raw : {};
  return {
    customCommands: Array.isArray(record.customCommands) ? /** @type {StoredCommand[]} */ (structuredClone(record.customCommands)) : [],
    preferences: isRecord(record.preferences) ? /** @type {Preferences} */ ({ ...record.preferences }) : {},
    templates: Array.isArray(record.templates) ? /** @type {StoredTemplate[]} */ (structuredClone(record.templates)) : [],
  };
}

/**
 * Applique un changement partiel : les commandes sont remplacées en bloc, les préférences se fusionnent clé à clé, `null`
 * retirant une clé.
 * @param {StudioSettings} current
 * @param {{ customCommands?: StoredCommand[], preferences?: Record<string, string | number | boolean | null>, templates?: StoredTemplate[] }} patch
 * @returns {StudioSettings}
 */
export function applySettingsPatch(current, patch) {
  /** @type {Preferences} */
  const preferences = { ...current.preferences };
  for (const [key, value] of Object.entries(patch.preferences ?? {})) {
    if (value === null) delete preferences[key];
    else preferences[key] = value;
  }
  return {
    customCommands: patch.customCommands === undefined ? current.customCommands : structuredClone(patch.customCommands),
    preferences,
    templates: patch.templates === undefined ? current.templates : structuredClone(patch.templates),
  };
}

/**
 * Valide un changement partiel (avant de l'appliquer) : les valeurs `null` des préférences sont permises.
 * @param {unknown} patch
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateSettingsPatch(patch) {
  if (!isRecord(patch)) return { ok: false, errors: ['changement : objet attendu'] };
  const forShape = { ...patch };
  if (isRecord(patch.preferences)) forShape.preferences = Object.fromEntries(Object.entries(patch.preferences).filter(([, value]) => value !== null));
  return validateStudioSettings(forShape);
}

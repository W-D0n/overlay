// @ts-check
/**
 * Les réglages de connexion à OBS : on renseigne le mot de passe dans le Studio (champ masqué, bouton Afficher / Masquer), le serveur se
 * reconnecte aussitôt, sans être relancé. Un faux OBS WebSocket (`dev/e2e/fake-obs.js`) vérifie l'empreinte d'authentification comme le vrai :
 * un mauvais mot de passe est refusé (4009), le bon connecte et donne les scènes. Le mot de passe enregistré ne revient jamais du serveur.
 */
import { readFileSync } from 'node:fs';
import { startFakeObs } from '../fake-obs.js';
import { openStudio } from '../studio.js';

export const name = 'réglages de connexion à OBS';

/** @param {*} ctx */
export async function run({ page, stack, check, errors }) {
  const obs = startFakeObs({ password: 'le-bon-mot-de-passe' });
  try {
    await openStudio({ page, stack });

    const status = () => page.evaluate("document.getElementById('settings-obs-status').textContent");
    const field = () => page.evaluate(`(() => { const f = document.getElementById('settings-obs-password'); return { type: f.type, value: f.value, placeholder: f.placeholder }; })()`);
    const reveal = () => page.evaluate(`(() => { const b = document.getElementById('settings-obs-reveal'); return { pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'), text: b.textContent }; })()`);
    const antenna = () => page.evaluate("document.getElementById('antenna-items').textContent");
    const connectionsText = async () => (await fetch(`http://localhost:${stack.statePort}/connections`)).text();

    check('un bouton Réglages est dans la barre', (await page.evaluate("document.getElementById('settings-open')?.textContent")) === 'Réglages');
    await page.click('#settings-open');
    await page.waitFor("document.getElementById('settings-dialog').open && document.getElementById('settings-obs-status').textContent !== ''", 8000);
    check('au départ, rien n’est configuré et la fenêtre renvoie vers ces réglages (pas vers .env)', (await status()).includes('Non configuré') && !(await status()).includes('.env'));
    check('l’adresse proposée est celle d’OBS par défaut', (await page.evaluate("document.getElementById('settings-obs-url').value")) === 'ws://127.0.0.1:4455');
    check('le mot de passe est masqué au départ', (await field()).type === 'password' && (await reveal()).pressed === 'false');

    // Afficher / Masquer : agit sur la saisie en cours.
    await page.fill('#settings-obs-password', 'mauvais-mot-de-passe');
    await page.click('#settings-obs-reveal');
    check('« Afficher » montre les caractères saisis et le bouton le dit', (await field()).type === 'text' && (await field()).value === 'mauvais-mot-de-passe' && (await reveal()).pressed === 'true' && (await reveal()).label === 'Masquer le mot de passe' && (await reveal()).text === 'Masquer');
    await page.click('#settings-obs-reveal');
    check('« Masquer » les cache de nouveau, la saisie est gardée', (await field()).type === 'password' && (await field()).value === 'mauvais-mot-de-passe' && (await reveal()).label === 'Afficher le mot de passe');

    // Un mauvais mot de passe est refusé par OBS, et le Studio le dit.
    await page.fill('#settings-obs-url', obs.url);
    await page.click('#settings-obs-save');
    await page.waitFor("document.getElementById('settings-obs-status').textContent.includes('refusé')", 10_000);
    check('un mauvais mot de passe : « refusé par OBS », avec où le corriger', (await status()).includes('Mot de passe refusé') && (await status()).includes('Réglages'));
    check('le faux OBS a bien refusé l’empreinte (4009) et n’a rien accepté', obs.rejectedCount === 1 && obs.identifiedCount === 0);
    check('la saisie est oubliée et remasquée après l’enregistrement', (await field()).value === '' && (await field()).type === 'password');
    check('le champ dit qu’un mot de passe est enregistré, sans le montrer', (await field()).placeholder.includes('enregistré'));
    const afterWrong = await connectionsText();
    check('le serveur dit « un mot de passe est enregistré » mais ne le renvoie pas', JSON.parse(afterWrong).obs.passwordSet === true && !afterWrong.includes('mauvais-mot-de-passe'));
    await page.waitFor("document.getElementById('antenna-items').textContent.includes('mot de passe refusé')", 15_000);
    check('le bandeau d’antenne dit aussi « mot de passe refusé »', (await antenna()).includes('mot de passe refusé'));

    // Le bon mot de passe corrige, sans relancer le serveur.
    await page.fill('#settings-obs-password', 'le-bon-mot-de-passe');
    await page.click('#settings-obs-save');
    await page.waitFor("document.getElementById('settings-obs-status').textContent.includes('Connecté à OBS')", 10_000);
    check('le bon mot de passe connecte, avec les scènes d’OBS', (await status()).includes('Connecté à OBS — 2 scène(s)'));
    check('le faux OBS voit une connexion authentifiée', obs.connected === 1 && obs.identifiedCount === 1);
    await page.waitFor("document.getElementById('antenna-items').textContent.includes('Jeu')", 15_000);
    check('le bandeau d’antenne montre la scène active d’OBS', (await antenna()).includes('Jeu'));
    obs.changeScene('Pause');
    await page.waitFor("document.getElementById('antenna-items').textContent.includes('Pause')", 15_000);
    check('un changement de scène dans OBS arrive jusqu’au Studio', (await antenna()).includes('Pause'));

    const file = JSON.parse(readFileSync(`${stack.stateFile}.connections.json`, 'utf8'));
    check('le mot de passe est dans le fichier des connexions du serveur, à côté du fichier d’état', file.obs?.password === 'le-bon-mot-de-passe' && file.obs?.url === obs.url);
    const stateText = readFileSync(stack.stateFile, 'utf8');
    check('mais jamais dans le fichier d’état des scènes (qui s’exporte)', !stateText.includes('le-bon-mot-de-passe'));
    check('et jamais dans une réponse du serveur', !(await connectionsText()).includes('le-bon-mot-de-passe') && !JSON.stringify(await stack.api('/obs-status')).includes('le-bon-mot-de-passe'));

    // Rien à changer.
    await page.click('#settings-obs-save');
    await page.waitFor("document.getElementById('settings-status').textContent !== ''", 4000);
    check('enregistrer sans rien changer le dit', (await page.evaluate("document.getElementById('settings-status').textContent")) === 'Rien à changer.');
    check('et ne reconnecte pas', obs.identifiedCount === 1);

    // Fermer la fenêtre oublie la saisie.
    await page.fill('#settings-obs-password', 'saisie-oubliée');
    await page.click('#settings-obs-reveal');
    await page.click('#settings-close');
    check('fermer la fenêtre vide aussitôt la saisie et remasque le champ (rien ne reste dans la page)', (await field()).value === '' && (await field()).type === 'password' && (await reveal()).pressed === 'false');
    await page.click('#settings-open');
    await page.waitFor("document.getElementById('settings-dialog').open && document.getElementById('settings-obs-status').textContent !== ''", 8000);
    check('la rouvrir la montre vide et masquée', (await field()).value === '' && (await field()).type === 'password');
    await page.press('Escape');
    check('Échap ferme la fenêtre', (await page.evaluate("document.getElementById('settings-dialog').open")) === false);

    // Effacer le mot de passe déconnecte.
    await page.click('#settings-open');
    await page.waitFor("document.getElementById('settings-dialog').open", 4000);
    await page.click('#settings-obs-clear');
    await page.waitFor("document.getElementById('settings-obs-status').textContent.includes('Non configuré')", 10_000);
    check('effacer le mot de passe remet « non configuré »', (await status()).includes('Non configuré'));
    await page.waitFor(`${JSON.stringify(true)} && document.getElementById('settings-obs-clear').disabled === true`, 4000);
    check('et le bouton Effacer n’a plus rien à effacer', (await page.evaluate("document.getElementById('settings-obs-clear').disabled")) === true);
    check('le fichier ne garde plus de mot de passe', JSON.parse(readFileSync(`${stack.stateFile}.connections.json`, 'utf8')).obs?.password === undefined);
    await page.click('#settings-close');

    check('aucune erreur dans la console', errors.length === 0 ? true : errors.slice());
  } finally {
    obs.stop();
  }
}

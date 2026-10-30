// npm run update:go -- "message" : publie l'app sur EAS Update pour Expo Go (iPhone et Android).
//
// Les testeurs l'ouvrent dans Expo Go depuis un lien fixe (affiché à la fin), sans serveur de dev
// allumé ni Tailscale. Chaque publication remplace la précédente sur le canal « go ».
//
// - EXPO_GO_UPDATE=1 : version d'exécution « exposdk:<SDK>.0.0 », la seule qu'Expo Go accepte
//   (voir app.config.ts) ;
// - EXPO_PUBLIC_TEST_TOOLS=1 : la simulation de drive reste disponible (le code publié n'est pas en
//   mode développement) ;
// - variables Supabase : environnement « preview » d'EAS (pas besoin de .env.local).
// Prérequis : être connecté à EAS avec un compte membre de @hotlaphar (npx eas-cli@latest whoami).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const EAS_PROJECT_ID = '2917e236-175f-4b58-a141-f86c1179dd06';
const CHANNEL = 'go';
const sdk = `${require('expo/package.json').version.split('.')[0]}.0.0`;
const message = process.argv.slice(2).join(' ').trim() || `Expo Go ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

const env = { ...process.env, EXPO_GO_UPDATE: '1', EXPO_PUBLIC_TEST_TOOLS: '1', APP_VARIANT: 'preview' };
const args = ['eas-cli@latest', 'update', '--channel', CHANNEL, '--environment', 'preview', '--platform', 'all', '--message', message, '--non-interactive'];

console.log(`Publication pour Expo Go (SDK ${sdk}, canal « ${CHANNEL} ») : ${message}\n`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
// shell sous Windows (npx.cmd) : le message est passé entre guillemets.
const r = process.platform === 'win32'
  ? spawnSync([npx, ...args.slice(0, -2), `"${message.replace(/"/g, "'")}"`, '--non-interactive'].join(' '), { stdio: 'inherit', env, shell: true })
  : spawnSync(npx, args, { stdio: 'inherit', env });
if (r.status !== 0) process.exit(r.status ?? 1);

const link = `exp://u.expo.dev/${EAS_PROJECT_ID}?runtime-version=${encodeURIComponent(`exposdk:${sdk}`)}&channel-name=${CHANNEL}`;
console.log(`\nLien Expo Go (iPhone et Android) :\n${link}\n`);

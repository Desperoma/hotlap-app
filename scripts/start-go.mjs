// npm run start:go : lance Expo Go sur l'adresse Tailscale de la machine.
//
// Expo choisit sinon l'adresse du réseau local (192.168.x.x), injoignable pour les testeurs
// qui passent par Tailscale. Le script fixe REACT_NATIVE_PACKAGER_HOSTNAME, quel que soit le
// terminal (cmd, PowerShell, SSH), sauf si elle est déjà définie.
// Les options passées après `--` sont transmises à Expo : npm run start:go -- --clear
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13) || major === 23 || (major === 24 && minor < 3) || major === 25) {
  console.error(`Node ${process.versions.node} : Expo SDK 58 demande Node 22.13+, 24.3+ ou 26+ (versions paires).`);
  process.exit(1);
}

function tailscaleIp() {
  const candidates = ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  for (const bin of candidates) {
    if (bin.includes('\\') || bin.includes('/')) {
      if (!existsSync(bin)) continue;
    }
    try {
      const out = execFileSync(bin, ['ip', '-4'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
      const ip = out.split(/\r?\n/).map((l) => l.trim()).find((l) => /^100\.\d+\.\d+\.\d+$/.test(l));
      if (ip) return ip;
    } catch {
      // essai suivant
    }
  }
  return null;
}

const env = { ...process.env };
if (env.REACT_NATIVE_PACKAGER_HOSTNAME) {
  console.log(`Adresse imposée par REACT_NATIVE_PACKAGER_HOSTNAME : ${env.REACT_NATIVE_PACKAGER_HOSTNAME}`);
} else {
  const ip = tailscaleIp();
  if (ip) {
    env.REACT_NATIVE_PACKAGER_HOSTNAME = ip;
    console.log(`Adresse Tailscale : ${ip}`);
  } else {
    console.warn('Tailscale introuvable ou déconnecté : Expo utilisera l’adresse du réseau local.');
  }
}

// Expo CLI lancé directement avec ce Node : pas de shell (ni npx.cmd), arguments non réinterprétés.
const expoCli = createRequire(import.meta.url).resolve('expo/bin/cli');
const child = spawn(process.execPath, [expoCli, 'start', '--go', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));

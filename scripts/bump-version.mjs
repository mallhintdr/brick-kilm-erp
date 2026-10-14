// Bumps the app version in the root package.json (and the lockfile's root entry).
//   node scripts/bump-version.mjs          -> 1.2.1 -> 1.2.2   (patch, run on every commit by the git hook)
//   node scripts/bump-version.mjs minor    -> 1.2.9 -> 1.3.0
//   node scripts/bump-version.mjs major    -> 1.9.3 -> 2.0.0
//   node scripts/bump-version.mjs 1.4.0    -> set exactly
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = String(pkg.version || '1.0.0').split('.').map((n) => Number(n) || 0);
const arg = process.argv[2] || 'patch';

let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else if (arg === 'major') next = `${maj + 1}.0.0`;
else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
else next = `${maj}.${min}.${pat + 1}`;

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}
console.log(next);

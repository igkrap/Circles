import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const outArg = String(process.argv[2] || '').trim();
const outPath = outArg
  ? path.resolve(cwd, outArg)
  : path.join(cwd, 'public', 'version.json');
const rawBuildId = String(process.env.VITE_BUILD_ID || '').trim();
const buildId = rawBuildId || `local-${Date.now().toString(36)}`;
const payload = {
  buildId,
  builtAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`[build] wrote ${path.relative(cwd, outPath)} (${buildId})`);

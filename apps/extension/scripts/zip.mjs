// Packs dist/ into release/fill-by-kural-<version>.zip for the Chrome Web Store (`pnpm zip`).
// Checks the build first: production API address (the default is localhost:3000), icons, privacy link,
// no source maps.
// A small zip writer of its own: Windows PowerShell's Compress-Archive writes "\" in paths, which the
// store rejects, and Git Bash's tar can't write zips.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const allowNoIcons = process.argv.includes('--no-icons');

const files = (function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
})(dist);
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

const problems = [];
const warnings = [];
if (!manifest.icons?.['128']) {
  (allowNoIcons ? warnings : problems).push('No icons: add public/icons/icon-16.png, icon-32.png, icon-48.png and icon-128.png, then run again.');
}
for (const f of files) {
  const rel = relative(dist, f).replaceAll('\\', '/');
  if (rel.endsWith('.map')) problems.push(`Source map in the build: ${rel}`);
  if (/\.(js|html|json)$/.test(rel) && /localhost:3000/.test(readFileSync(f, 'utf8'))) {
    problems.push(`${rel} points at localhost: set VITE_API_BASE in .env.local to the production address.`);
  }
}
if ((manifest.host_permissions ?? []).some((h) => h.includes('localhost'))) problems.push('host_permissions include localhost.');
const popup = files.filter((f) => f.endsWith('.js')).some((f) => readFileSync(f, 'utf8').includes('/privacy"'));
if (popup) warnings.push('The privacy link is the default …/privacy: set VITE_PRIVACY_URL in .env.local.');

for (const w of warnings) console.warn(`! ${w}`);
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}

// Zip: one deflated entry per file, then the central directory.
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
const locals = [];
const central = [];
let offset = 0;
for (const f of files.sort()) {
  const name = Buffer.from(relative(dist, f).replaceAll('\\', '/'));
  const data = readFileSync(f);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4); // version needed
  head.writeUInt16LE(0x0800, 6); // UTF-8 names
  head.writeUInt16LE(8, 8); // deflate
  head.writeUInt16LE(dosTime, 10);
  head.writeUInt16LE(dosDate, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  locals.push(head, name, packed);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4); // made by
  head.copy(entry, 6, 4, 30); // same fields as the local header
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += head.length + name.length + packed.length;
}
const dir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(dir.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `fill-by-kural-${manifest.version}.zip`);
writeFileSync(out, Buffer.concat([...locals, dir, end]));
console.log(`✓ ${relative(root, out)} · ${files.length} files · ${(statSync(out).size / 1024).toFixed(0)} KB · v${manifest.version}`);
console.log(`  API: ${manifest.host_permissions.join(', ')}`);

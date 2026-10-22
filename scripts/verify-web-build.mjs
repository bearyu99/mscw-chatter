import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist-web');
const files = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links cannot be published');
    if (entry.isDirectory()) { await inspect(path); continue; }
    const name = relative(root, path).replaceAll('\\', '/');
    if (!/^(index\.html|mark\.svg|assets\/[\w.-]+\.(js|css|woff2)|licenses\/[\w.-]+\.txt)$/.test(name)) {
      throw new Error(`Unexpected public file: ${name}`);
    }
    if (!entry.isFile() || (await lstat(path)).size === 0) throw new Error(`Empty public file: ${name}`);
    if (/\.(html|js|css|txt)$/.test(name)) {
      const text = await readFile(path, 'utf8');
      if (/(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text)) throw new Error(`Potential credential in public file: ${name}`);
    }
    files.push(name);
  }
}
await inspect(root);
const html = await readFile(join(root, 'index.html'), 'utf8');
const connect = html.match(/connect-src ([^;]+);/)?.[1];
if (connect !== "'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com") throw new Error('Unexpected public API policy');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) {
  const file = match[1].slice(2);
  if (!files.includes(file)) throw new Error(`Missing public asset: ${file}`);
}
if (!html.includes('type="module"') || !files.some(file => file.endsWith('.woff2'))) throw new Error('Missing app or bundled font');
console.log(`PASS: ${files.length} static files; fixed cloud API origins; no source maps, settings or detected credentials`);

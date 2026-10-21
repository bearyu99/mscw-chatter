import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
const root = resolve('.');
const output = resolve('artifacts');
const ignored = new Set(['node_modules', 'dist', 'dist-electron', 'release', 'artifacts', '.git', '.DS_Store']);
async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith('.env') || entry.name.endsWith('.log')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile()) files.push(relative(root, path));
  }
  return files;
}
await mkdir(output, { recursive: true });
const files = (await collect(root)).sort();
await writeFile(resolve(output, 'changed-files.txt'), files.join('\n') + '\n', 'utf8');
const archive = resolve(output, 'mscw-chatter-source-0.1.0.zip');
// 7-Zip is provided with electron-builder, so packaging also works on Windows.
const sevenZip = await import('7zip-bin');
const binary = sevenZip.path7za ?? sevenZip.default.path7za;
const list = resolve(output, 'archive-files.txt');
await writeFile(list, [...files, 'artifacts/changed-files.txt'].join('\n') + '\n', 'utf8');
const result = spawnSync(binary, ['a', '-tzip', '-mx=7', '-scsUTF-8', archive, '@' + list], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Source archive: ${archive}`);

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import yazl from 'yazl';
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
const zip = new yazl.ZipFile();
for (const file of files) zip.addFile(resolve(root, file), file);
zip.addFile(resolve(output, 'changed-files.txt'), 'changed-files.txt');
const complete = new Promise((resolve, reject) => {
  zip.outputStream.on('error', reject);
  zip.outputStream.pipe(createWriteStream(archive)).on('error', reject).on('close', resolve);
});
zip.end({ compressionLevel: 7 });
await complete;
console.log(`Source archive: ${archive}`);

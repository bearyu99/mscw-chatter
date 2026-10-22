import { lstat, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const directory = process.env.MSCW_PACKAGE_DIR;
const archiveSuffix = process.env.MSCW_PACKAGE_ARCHIVE;
if (!directory || !archiveSuffix) throw new Error('Set MSCW_PACKAGE_DIR and MSCW_PACKAGE_ARCHIVE');
const root = resolve(directory);
const files = [];
const languages = new Set();
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    // Framework symlinks alias the same files; counting them twice inflates the app size.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.lproj')) languages.add(entry.name.slice(0, -6));
      await collect(path);
    } else if (entry.isFile()) {
      const name = relative(root, path).replaceAll('\\', '/');
      if (name.startsWith('locales/') && name.endsWith('.pak')) languages.add(entry.name.slice(0, -4));
      files.push({ path: name, bytes: (await lstat(path)).size });
    }
  }
}
await collect(root);
const allowed = process.platform === 'darwin' ? ['en', 'ko'] : ['en-US', 'ko'];
if (languages.size !== allowed.length || allowed.some(language => !languages.has(language))) {
  throw new Error(`Unexpected Electron languages: ${[...languages].join(', ')}`);
}
const archive = `mscw-chatter-${version}-${archiveSuffix}`;
const archiveBytes = (await lstat(join('release', archive))).size;
if (files.length === 0 || archiveBytes === 0) throw new Error('Empty package');
const result = {
  version, platform: process.platform, arch: process.arch, archive, archiveBytes,
  appBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  languages: [...languages].sort(),
  localesBytes: files.filter(file => /(^locales\/|\.lproj\/)/.test(file.path)).reduce((sum, file) => sum + file.bytes, 0),
  largestFiles: files.toSorted((a, b) => b.bytes - a.bytes).slice(0, 10),
};
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/package-size.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const mb = value => (value / 1_000_000).toFixed(1);
  await writeFile(process.env.GITHUB_STEP_SUMMARY,
    `## Package size (${result.platform} ${result.arch})\n\n| Download | Unpacked app | Electron languages |\n| --- | --- | --- |\n| ${mb(archiveBytes)} MB | ${mb(result.appBytes)} MB | ${result.languages.join(', ')} |\n`,
    { flag: 'a' });
}

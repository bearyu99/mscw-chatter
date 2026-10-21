import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist-electron', { recursive: true });
await build({ entryPoints: ['electron/main.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: 'dist-electron/main.cjs', external: ['electron'], sourcemap: false });
await copyFile('electron/preload.cjs', 'dist-electron/preload.cjs');

import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import electron from 'electron';

await mkdir('dist-electron', { recursive: true });
await build({ entryPoints: ['electron/main.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: 'dist-electron/main.cjs', external: ['electron'] });
await copyFile('electron/preload.cjs', 'dist-electron/preload.cjs');
const server = await createServer();
await server.listen();
server.printUrls();
const env = { ...process.env, MSCW_DEV_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

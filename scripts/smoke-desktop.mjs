// Native integration test. All AI responses come from an isolated loopback fixture.
// No paid API is called. Original clipboard formats are kept in memory and restored.
import { _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const directory = await mkdtemp(join(tmpdir(), 'mscw-desktop-test-'));
const requests = [];
const responses = { '안녕하세요': 'Hello!', 'HS pls': '홀심 부탁해요', 'WTB WG 1.5m': '노목 150만 메소에 삽니다', 'slow request': '이전 응답', 'fast request': '최신 응답' };
const server = createServer(async (request, response) => {
  try {
    let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 100000) throw new Error('large'); }
    const json = JSON.parse(body);
    const text = json.messages?.at(-1)?.content;
    requests.push(json);
    if (text === 'slow request') await new Promise(resolve => setTimeout(resolve, 1100));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: responses[text] ?? '모의 번역' } }));
  } catch { response.writeHead(400); response.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env, MSCW_USER_DATA: directory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.MSCW_DEV_URL;
let desktop;
let clipboardSaved = false;
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
try {
  const executablePath = process.env.MSCW_TEST_EXECUTABLE;
  desktop = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [resolve('.')] }), cwd: resolve('.'), env, timeout: 20000 });
  const page = await desktop.firstWindow();
  await page.waitForFunction(() => !!window.mscw);
  await desktop.evaluate(async ({ clipboard, ClipboardItem }) => {
    const stored = [];
    for (const item of await clipboard.read()) {
      // A fresh OS session may expose an empty placeholder ClipboardItem.
      if (item.types.length === 0) continue;
      const types = {};
      for (const type of item.types) {
        const value = await item.getType(type);
        types[type] = value instanceof Blob ? new Blob([await value.arrayBuffer()], { type: value.type }) : value;
      }
      stored.push(new ClipboardItem(types));
    }
    globalThis.__mscwSmokeClipboard = stored;
  });
  clipboardSaved = true;
  const call = (method, ...args) => page.evaluate(async ({ method, args }) => window.mscw[method](...args), { method, args });
  const get = () => call('getSnapshot');
  const copy = text => desktop.evaluate(async ({ clipboard }, value) => clipboard.writeText(value), text);
  const read = () => desktop.evaluate(({ clipboard }) => clipboard.readText());
  const waitUntil = async predicate => {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    throw new Error('Native state did not reach the expected test condition.');
  };
  const waitOriginal = original => waitUntil(async () => (await get()).runtime.history[0]?.original === original);
  check('native launch with monitoring disabled', (await get()).native && !(await get()).runtime.monitoring);
  const security = await desktop.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
  });
  check('sandbox, context isolation and no Node in renderer', security.sandbox && security.contextIsolation && !security.nodeIntegration);
  check('renderer has no Node.js require', await page.evaluate(() => typeof window.require === 'undefined'));
  const profile = { provider: 'local', model: 'smoke-fixture', localApi: 'ollama', endpoint };
  await call('saveProfile', profile);
  await call('testConnection', profile);
  check('native HTTP adapter connection test', requests.length === 1);
  await call('setMonitoring', true);
  await call('updateSettings', { provider: 'local' });
  check('reselecting the current provider keeps automatic translation enabled', (await get()).runtime.monitoring);
  let missingProviderKeyRejected = false;
  try { await call('updateSettings', { provider: 'google' }); } catch (error) { missingProviderKeyRejected = error.message.includes('API 키'); }
  check('missing provider key leaves native provider and monitoring unchanged', missingProviderKeyRejected && (await get()).settings.provider === 'local' && (await get()).runtime.monitoring);
  await copy('HS pls'); await waitOriginal('HS pls');
  check('clipboard -> native HTTP -> translated clipboard', await read() === '홀심 부탁해요');
  check('glossary instructions reach the selected adapter', requests.at(-1).messages[0].content.includes('홀리 심볼'));
  const count = requests.length;
  await new Promise(resolve => setTimeout(resolve, 700));
  check('own output does not retrigger translation', requests.length === count);
  await call('updateSettings', { glossaryEnabled: false });
  check('quick glossary toggle keeps monitoring active', (await get()).runtime.monitoring);
  await copy('WTB WG 1.5m'); await waitOriginal('WTB WG 1.5m');
  check('glossary toggle excludes glossary instructions', !requests.at(-1).messages[0].content.includes('Relevant glossary'));
  await copy('slow request');
  await waitUntil(async () => (await get()).runtime.pendingText === 'slow request');
  const fullBounds = await desktop.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()[0].getNormalBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
    return { width, height, x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))) };
  });
  await call('updateSettings', { miniMode: true });
  const miniBounds = await desktop.evaluate(({ BrowserWindow }) => ({ bounds: BrowserWindow.getAllWindows()[0].getBounds(), minimum: BrowserWindow.getAllWindows()[0].getMinimumSize() }));
  check('mini mode resizes the native window and its minimum', miniBounds.bounds.width === 420 && miniBounds.bounds.height === 420 && miniBounds.minimum[0] === 320 && miniBounds.minimum[1] === 320);
  check('switching to mini mode preserves monitoring and the in-flight request', (await get()).runtime.monitoring && (await get()).runtime.pendingText === 'slow request');
  await copy('fast request'); await waitOriginal('fast request');
  await new Promise(resolve => setTimeout(resolve, 1300));
  check('stale response never overwrites newer native clipboard', await read() === '최신 응답');
  const beforeRestore = (await get()).runtime.history;
  await call('updateSettings', { miniMode: false });
  const restoredBounds = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNormalBounds());
  assert.deepEqual(restoredBounds, fullBounds);
  check('full mode restores the native window size within the current work area', true);
  check('restoring full mode preserves history and monitoring', JSON.stringify((await get()).runtime.history) === JSON.stringify(beforeRestore) && (await get()).runtime.monitoring);
  await call('updateSettings', { autoCopy: false });
  await copy('안녕하세요'); await waitOriginal('안녕하세요');
  check('auto copy preference preserves the original', await read() === '안녕하세요');
  const latest = (await get()).runtime.history[0];
  await call('copyEntry', latest.id);
  check('explicit copy works while monitoring', await read() === 'Hello!');
  await call('setMonitoring', false);
  await call('clearHistory');
  check('history clears without persistence', (await get()).runtime.history.length === 0);
  await call('updateSettings', { miniMode: true });
  const config = await readFile(join(directory, 'configuration.json'), 'utf8');
  check('mini mode preference persists for the next app launch', JSON.parse(config).settings.miniMode === true);
  check('chat and translated text are absent from persisted settings', !config.includes('HS pls') && !config.includes('홀심 부탁해요') && !config.includes('WTB WG'));
  await call('updateSettings', { monitorShortcut: 'CommandOrControl+Alt+F9', translateShortcut: 'Alt+Enter' });
  check('custom global shortcut is registered and preferences are saved', await desktop.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Alt+F9')) && (await get()).settings.translateShortcut === 'Alt+Enter');
  const reserved = await desktop.evaluate(({ globalShortcut }) => globalShortcut.register('CommandOrControl+Alt+F10', () => {}));
  check('conflict fixture can reserve its shortcut', reserved);
  let conflictRejected = false;
  try { await call('updateSettings', { monitorShortcut: 'CommandOrControl+Alt+F10' }); } catch { conflictRejected = true; }
  check('shortcut conflict preserves prior binding and configuration', conflictRejected && (await get()).settings.monitorShortcut === 'CommandOrControl+Alt+F9' && await desktop.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Alt+F9')));
  await desktop.evaluate(({ globalShortcut }) => globalShortcut.unregister('CommandOrControl+Alt+F10'));
  // Temporary userData does not isolate the OS credential store. Never access it by default.
  // Credential integration is explicitly opt-in; ad-hoc macOS packages always skip it.
  // ConfigStore and UsageStore are also covered by isolated unit tests.
  const cloudChecks = process.env.MSCW_TEST_CREDENTIALS === '1' && (!executablePath || process.platform !== 'darwin');
  if (cloudChecks) {
    // Override the transport in this isolated test process, never send a key to a cloud provider.
    await desktop.evaluate(() => { globalThis.fetch = async () => Response.json({ model: 'gpt-4.1-mini', usage: { prompt_tokens: 1000, completion_tokens: 400, prompt_tokens_details: { cached_tokens: 250 } }, choices: [{ finish_reason: 'stop', message: { content: 'Fixture translation' } }] }); });
    const cloudProfile = { provider: 'openai', model: 'gpt-4.1-mini', endpoint: '', localApi: 'openai', apiKey: 'native-fixture-key-only' };
    await call('saveProfile', cloudProfile);
    await call('testConnection', cloudProfile);
    await call('translate', '요금 집계 검사');
    await call('clearHistory');
    const cloudUsage = (await get()).usage.openai;
    check('native usage includes connection tests and survives history clearing', cloudUsage.requests === 2 && Math.abs(cloudUsage.estimatedUsd - 0.00193) < 1e-12);
    await call('saveProfile', { ...cloudProfile, apiKey: 'another-native-fixture-key' });
    check('native usage isolates different API keys', (await get()).usage.openai.requests === 0);
    await call('saveProfile', cloudProfile);
    const usageFile = await readFile(join(directory, 'usage-totals.json'), 'utf8');
    check('usage persistence contains neither API keys nor chat text', !usageFile.includes('native-fixture') && !usageFile.includes('요금 집계 검사') && !usageFile.includes('Fixture translation'));
  }
  if (clipboardSaved) { await desktop.evaluate(async ({ clipboard }) => { const stored = globalThis.__mscwSmokeClipboard; if (stored?.length) await clipboard.write(stored); else clipboard.clear(); }); clipboardSaved = false; }
  await desktop.close(); desktop = null;
  desktop = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [resolve('.')] }), cwd: resolve('.'), env, timeout: 20000 });
  const reopened = await desktop.firstWindow();
  await reopened.waitForFunction(() => !!window.mscw);
  const reopenedSnapshot = await reopened.evaluate(() => window.mscw.getSnapshot());
  check('custom shortcuts restore after a full native restart', reopenedSnapshot.settings.monitorShortcut === 'CommandOrControl+Alt+F9' && reopenedSnapshot.settings.translateShortcut === 'Alt+Enter' && reopenedSnapshot.shortcutAvailable);
  if (cloudChecks) check('per-key usage restores after a full native restart', reopenedSnapshot.usage.openai.requests === 2 && Math.abs(reopenedSnapshot.usage.openai.estimatedUsd - 0.00193) < 1e-12 && !reopenedSnapshot.usageWarning);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/desktop-test-results.json', JSON.stringify({ testedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, packaged: !!executablePath, credentialChecks: cloudChecks, ai: 'isolated loopback and in-memory fixtures, no live AI', checks }, null, 2));
  console.log(`PASS: ${checks.length} native integration checks (${process.platform}/${process.arch}; isolated AI fixtures)`);
} finally {
  if (desktop) {
    try {
      if (clipboardSaved) await desktop.evaluate(async ({ clipboard }) => { const stored = globalThis.__mscwSmokeClipboard; if (stored?.length) await clipboard.write(stored); else clipboard.clear(); });
    } finally { await desktop.close(); }
  }
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}

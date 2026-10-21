import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, safeStorage, shell, Tray } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import type { ProfileInput, SettingsPatch, Snapshot } from '../src/shared/types';
import { GLOSSARY_URL } from '../src/shared/defaults';
import { ConfigStore } from './core/config';
import { TranslationController, type ClipboardPort } from './core/controller';
import { translateWithProvider, validateProfile } from './core/providers';

if (process.env.MSCW_USER_DATA) app.setPath('userData', process.env.MSCW_USER_DATA);
app.setName('글클메 채팅 번역기');
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let store: ConfigStore;
let controller: TranslationController;
let pollTimer: NodeJS.Timeout | undefined;
let shortcutAvailable = false;
const devUrl = !app.isPackaged && process.env.MSCW_DEV_URL === 'http://127.0.0.1:5173' ? process.env.MSCW_DEV_URL : undefined;
const iconPath = join(app.getAppPath(), 'build', 'icon.png');

// Electron 45's plain text helpers are async. Clipboard access stays in main.
const nativeClipboard: ClipboardPort = {
  readText: () => clipboard.readText(),
  writeText: text => clipboard.writeText(text),
};

function snapshot(): Snapshot {
  const keys = store.keyStatus();
  return { settings: store.settings, runtime: structuredClone(controller.state), keys, platform: process.platform, version: app.getVersion(), shortcutAvailable, native: true, storageWarning: store.warning };
}
function changed() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mscw:changed', snapshot());
  updateTray();
}
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow!.show();
  mainWindow!.focus();
}
function updateTray() {
  if (!tray || !controller) return;
  tray.setToolTip(`글클메 채팅 번역기 · ${controller.state.monitoring ? '자동 번역 켜짐' : '자동 번역 꺼짐'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '글클메 채팅 번역기 열기', click: showWindow },
    { label: controller.state.monitoring ? '자동 번역 중지' : '자동 번역 시작', click: () => { void controller.setMonitoring(!controller.state.monitoring).catch(error => { controller.state.error = error.message; changed(); showWindow(); }); } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240, height: 870, minWidth: 820, minHeight: 660,
    title: '글클메 채팅 번역기', backgroundColor: '#f7f8fa', icon: iconPath,
    alwaysOnTop: store.settings.alwaysOnTop, show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, webSecurity: true },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', event => {
    if (!quitting && store.settings.closeToTray && tray) { event.preventDefault(); mainWindow?.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'));
}
function trusted(event: IpcMainInvokeEvent) {
  return !!mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && (devUrl ? event.senderFrame?.url.startsWith(devUrl + '/') : event.senderFrame?.url.startsWith('file://'));
}
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) return { ok: false, error: '허용되지 않은 요청이에요.' };
    try { return { ok: true, value: await fn(...args) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : '작업을 완료하지 못했어요.' }; }
  });
}
function registerHandlers() {
  handle('mscw:snapshot', () => snapshot());
  handle('mscw:settings', async (patch: SettingsPatch) => {
    if (patch && typeof patch === 'object' && 'provider' in patch) await controller.setMonitoring(false);
    else if (patch && typeof patch === 'object' && ['direction', 'glossaryEnabled', 'autoCopy'].some(key => key in patch)) controller.cancel(false);
    await store.updateSettings(patch);
    mainWindow?.setAlwaysOnTop(store.settings.alwaysOnTop);
    changed();
    return snapshot();
  });
  handle('mscw:profile', async (input: ProfileInput) => {
    await controller.setMonitoring(false);
    await store.saveProfile(input);
    changed();
    return snapshot();
  });
  handle('mscw:test', async (input: ProfileInput) => {
    const profile = validateProfile(input);
    if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n\0]/.test(input.apiKey))) throw new Error('API 키 형식을 확인해 주세요.');
    const key = input.removeKey ? '' : input.apiKey?.trim() || store.getKey(input.provider);
    await translateWithProvider({ provider: input.provider, profile, apiKey: key, text: '안녕하세요', direction: 'ko-en', glossaryEnabled: false, signal: new AbortController().signal });
    return { message: '연결되었어요. 이 모델로 번역할 수 있어요.' };
  });
  handle('mscw:monitor', async (enabled: boolean) => { if (typeof enabled !== 'boolean') throw new Error('감시 상태가 올바르지 않아요.'); await controller.setMonitoring(enabled); return snapshot(); });
  handle('mscw:translate', (text: string) => controller.submit(text));
  handle('mscw:cancel', () => controller.cancel());
  handle('mscw:copy', (id: string, original = false) => { if (typeof id !== 'string' || typeof original !== 'boolean') throw new Error('복사 요청을 확인해 주세요.'); return controller.copyEntry(id, original); });
  handle('mscw:clear', () => controller.clearHistory());
  const links: Record<string, string> = { glossary: GLOSSARY_URL, openai: 'https://platform.openai.com/api-keys', anthropic: 'https://platform.claude.com/settings/keys', google: 'https://aistudio.google.com/apikey', ollama: 'https://ollama.com/download' };
  handle('mscw:external', async (target: unknown) => { if (typeof target !== 'string' || !Object.hasOwn(links, target)) throw new Error('허용되지 않은 링크예요.'); await shell.openExternal(links[target]); });
}

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', showWindow);
  app.whenReady().then(async () => {
    store = new ConfigStore(join(app.getPath('userData'), 'configuration.json'), {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: value => safeStorage.encryptString(value).toString('base64'),
      decrypt: value => safeStorage.decryptString(Buffer.from(value, 'base64')),
    });
    await store.load();
    controller = new TranslationController({ clipboard: nativeClipboard, settings: () => store.settings, getKey: provider => store.getKey(provider), onChange: changed });
    registerHandlers();
    const trayImage = nativeImage.createFromPath(iconPath);
    if (!trayImage.isEmpty()) {
      tray = new Tray(trayImage.resize({ width: process.platform === 'darwin' ? 18 : 24, height: process.platform === 'darwin' ? 18 : 24 }));
      tray.on('click', showWindow);
      updateTray();
    }
    shortcutAvailable = globalShortcut.register('CommandOrControl+Shift+Space', () => {
      void controller.setMonitoring(!controller.state.monitoring).catch(error => { controller.state.error = error.message; changed(); showWindow(); });
    });
    createWindow();
    pollTimer = setInterval(() => { void controller.poll(); }, 250);
    app.on('activate', showWindow);
  }).catch(() => { app.quit(); });
}
app.on('before-quit', () => { quitting = true; clearInterval(pollTimer); controller?.cancel(false); globalShortcut.unregisterAll(); tray?.destroy(); tray = null; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

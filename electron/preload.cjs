const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
  const reply = await ipcRenderer.invoke(channel, ...args);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
};
contextBridge.exposeInMainWorld('mscw', Object.freeze({
  getSnapshot: () => call('mscw:snapshot'),
  updateSettings: patch => call('mscw:settings', patch),
  saveProfile: profile => call('mscw:profile', profile),
  testConnection: profile => call('mscw:test', profile),
  setMonitoring: enabled => call('mscw:monitor', enabled),
  translate: text => call('mscw:translate', text),
  cancelTranslation: () => call('mscw:cancel'),
  copyEntry: (id, original) => call('mscw:copy', id, original),
  clearHistory: () => call('mscw:clear'),
  openExternal: target => call('mscw:external', target),
  onSnapshot: callback => {
    const handler = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('mscw:changed', handler);
    return () => ipcRenderer.removeListener('mscw:changed', handler);
  },
}));

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electron', {
  // Check if running in Electron
  isElectron: true,

  // WireGuard operations
  wireguard: {
    check: () => ipcRenderer.invoke('wireguard:check'),
    install: (instanceId, configBody) =>
      ipcRenderer.invoke('wireguard:install', { instanceId, configBody }),
    activate: (instanceId) => ipcRenderer.invoke('wireguard:activate', { instanceId }),
    deactivate: (instanceId) => ipcRenderer.invoke('wireguard:deactivate', { instanceId }),
    uninstall: (instanceId) => ipcRenderer.invoke('wireguard:uninstall', { instanceId }),
    status: (instanceId) => ipcRenderer.invoke('wireguard:status', { instanceId }),
    // One-click operations
    run: (instanceId, configBody) => ipcRenderer.invoke('wireguard:run', { instanceId, configBody }),
    stop: (instanceId) => ipcRenderer.invoke('wireguard:stop', { instanceId })
  }
});

console.log('Electron preload script loaded');

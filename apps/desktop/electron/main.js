const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let tray = null;

const isDev = process.env.NODE_ENV === 'development';
const devServerURL =
  process.env.DESKTOP_UI_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174';
const isWindows = process.platform === 'win32';

// WireGuard executable path (Windows)
const WIREGUARD_PATH = isWindows
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WireGuard', 'wireguard.exe')
  : null;

// Config storage path
const CONFIG_DIR = path.join(app.getPath('userData'), 'configs');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL(devServerURL);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = app.isPackaged
      ? path.join(process.resourcesPath, 'dist', 'index.html')
      : path.join(__dirname, '..', 'dist', 'index.html');

    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('Failed to load index.html:', err);
      dialog.showErrorBox(
        'Erreur de chargement',
        `Impossible de charger index.html:\n${err.message}\n\nPath: ${indexPath}\n__dirname: ${__dirname}`);
    });
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'tray-icon.png');
  tray = new Tray(trayIconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir VPN Manager',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('VPN Manager');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on window close (keep running in tray)
  if (process.platform !== 'darwin') {
    // Still keep app running in tray
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// IPC Handlers for WireGuard operations

/**
 * Check if WireGuard is installed
 */
async function checkWireGuardInstalled() {
  if (!isWindows) {
    return { installed: false, error: 'WireGuard automation is only supported on Windows' };
  }

  return new Promise((resolve) => {
    fs.access(WIREGUARD_PATH, fs.constants.X_OK, (err) => {
      if (err) {
        resolve({ installed: false, path: WIREGUARD_PATH });
      } else {
        resolve({ installed: true, path: WIREGUARD_PATH });
      }
    });
  });
}

ipcMain.handle('wireguard:check', checkWireGuardInstalled);

/**
 * Install WireGuard tunnel from config
 */
const installTunnel = async (event, { instanceId, configBody }) => {
  if (!isWindows) {
    throw new Error('WireGuard automation is only supported on Windows');
  }

  // Check if WireGuard is installed
  const checkResult = await checkWireGuardInstalled();
  if (!checkResult.installed) {
    throw new Error(
      'WireGuard is not installed. Please install from https://www.wireguard.com/install/'
    );
  }

  // Save config to file
  const configPath = path.join(CONFIG_DIR, `${instanceId}.conf`);
  fs.writeFileSync(configPath, configBody, 'utf8');

  // Install tunnel service
  return new Promise((resolve, reject) => {
    const installCmd = `"${WIREGUARD_PATH}" /installtunnelservice "${configPath}"`;

    exec(installCmd, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        console.error('Install error:', error, stderr);
        reject(new Error(`Failed to install tunnel: ${stderr || error.message}`));
      } else {
        console.log('Tunnel installed:', stdout);
        resolve({ success: true, instanceId, configPath });
      }
    });
  });
};

ipcMain.handle('wireguard:install', installTunnel);

/**
 * Activate VPN tunnel
 */
const activateTunnel = async (event, { instanceId }) => {
  if (!isWindows) {
    throw new Error('WireGuard automation is only supported on Windows');
  }

  return new Promise((resolve, reject) => {
    const activateCmd = `"${WIREGUARD_PATH}" /activate "${instanceId}"`;

    exec(activateCmd, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        console.error('Activate error:', error, stderr);
        reject(new Error(`Failed to activate tunnel: ${stderr || error.message}`));
      } else {
        console.log('Tunnel activated:', stdout);
        resolve({ success: true, instanceId });
      }
    });
  });
};

ipcMain.handle('wireguard:activate', activateTunnel);

/**
 * Deactivate VPN tunnel
 */
const deactivateTunnel = async (event, { instanceId }) => {
  if (!isWindows) {
    throw new Error('WireGuard automation is only supported on Windows');
  }

  return new Promise((resolve, reject) => {
    const deactivateCmd = `"${WIREGUARD_PATH}" /deactivate "${instanceId}"`;

    exec(deactivateCmd, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        console.error('Deactivate error:', error, stderr);
        reject(new Error(`Failed to deactivate tunnel: ${stderr || error.message}`));
      } else {
        console.log('Tunnel deactivated:', stdout);
        resolve({ success: true, instanceId });
      }
    });
  });
};

ipcMain.handle('wireguard:deactivate', deactivateTunnel);

/**
 * Uninstall VPN tunnel
 */
const uninstallTunnel = async (event, { instanceId }) => {
  if (!isWindows) {
    throw new Error('WireGuard automation is only supported on Windows');
  }

  return new Promise((resolve, reject) => {
    const uninstallCmd = `"${WIREGUARD_PATH}" /uninstalltunnelservice "${instanceId}"`;

    exec(uninstallCmd, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        console.error('Uninstall error:', error, stderr);
        // Don't reject - tunnel might not exist
        resolve({ success: false, instanceId, error: stderr || error.message });
      } else {
        console.log('Tunnel uninstalled:', stdout);

        // Also delete config file
        const configPath = path.join(CONFIG_DIR, `${instanceId}.conf`);
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }

        resolve({ success: true, instanceId });
      }
    });
  });
};

ipcMain.handle('wireguard:uninstall', uninstallTunnel);

/**
 * Get tunnel status
 */
ipcMain.handle('wireguard:status', async (event, { instanceId }) => {
  if (!isWindows) {
    throw new Error('WireGuard automation is only supported on Windows');
  }

  return new Promise((resolve, reject) => {
    const statusCmd = `"${WIREGUARD_PATH}" /status "${instanceId}"`;

    exec(statusCmd, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        // Tunnel not found or not active
        resolve({ active: false, instanceId });
      } else {
        resolve({ active: true, instanceId, output: stdout });
      }
    });
  });
});

/**
 * One-click Run: install + activate
 */
ipcMain.handle('wireguard:run', async (event, { instanceId, configBody }) => {
  try {
    // First uninstall if exists (cleanup)
    await uninstallTunnel(event, { instanceId });

    // Install tunnel
    const installResult = await installTunnel(event, {
      instanceId,
      configBody
    });
    console.log('Install result:', installResult);

    // Small delay to let service register
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Activate tunnel
    const activateResult = await activateTunnel(event, { instanceId });
    console.log('Activate result:', activateResult);

    return {
      success: true,
      message: 'VPN activé avec succès!',
      instanceId
    };
  } catch (error) {
    console.error('Run error:', error);
    return {
      success: false,
      error: error.message,
      instanceId
    };
  }
});

/**
 * One-click Stop: deactivate
 */
ipcMain.handle('wireguard:stop', async (event, { instanceId }) => {
  try {
    const deactivateResult = await deactivateTunnel(event, { instanceId });
    console.log('Deactivate result:', deactivateResult);

    return {
      success: true,
      message: 'VPN désactivé avec succès!',
      instanceId
    };
  } catch (error) {
    console.error('Stop error:', error);
    return {
      success: false,
      error: error.message,
      instanceId
    };
  }
});

console.log('Electron main process started');
console.log('Platform:', process.platform);
console.log('WireGuard path:', WIREGUARD_PATH);
console.log('Config directory:', CONFIG_DIR);

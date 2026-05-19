const { app, BrowserWindow, ipcMain, protocol, shell, nativeImage } = require('electron');
const settings = require('./settings');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const { title } = require('process');
const { autoUpdater } = require('electron-updater');

// automatic updates woohoo yaay
app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
});

let mainWindow;
let pluginScripts = [];
let pluginProcesses = [];

// there's so much shit idek if acrylic and vibrancy will work im on WINDOWS 10 DUDE
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    vibrancy: 'ultra-dark',
    visualEffectState: 'active',
    backgroundMaterial: 'acrylic',
    trafficLightPosition: { x: 14, y: 17 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:main',
    }
  });

  // this was for some reason like the hardest part
  mainWindow.webContents.session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    const headers = { ...details.responseHeaders };
    const url = details.url;

    if (url.includes('api-auth.soundcloud.com') || url.includes('secure.soundcloud.com') || url.includes('accounts.google.com')) {
      let requestOrigin = details.requestHeaders?.['Origin'] || details.requestHeaders?.['origin'];

      if (!requestOrigin) {
        if (url.includes('api-auth.soundcloud.com')) {
          requestOrigin = 'https://secure.soundcloud.com';
        } else {
          requestOrigin = 'https://soundcloud.com';
        }
      }

      const corsAllowOriginKey = Object.keys(headers).find(k => k.toLowerCase() === 'access-control-allow-origin');
      const corsAllowCredentialsKey = Object.keys(headers).find(k => k.toLowerCase() === 'access-control-allow-credentials');

      if (corsAllowOriginKey) {
        headers[corsAllowOriginKey] = [requestOrigin];
      } else {
        headers['Access-Control-Allow-Origin'] = [requestOrigin];
      }

      if (corsAllowCredentialsKey) {
        headers[corsAllowCredentialsKey] = ['true'];
      } else {
        headers['Access-Control-Allow-Credentials'] = ['true'];
      }
    }
    callback({ responseHeaders: headers });
  });

  mainWindow.setIcon(path.join(__dirname, 'assets/icon.png'))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'allow' };
  });

  settings.setupIpc(
    mainWindow,
    () => {
      const pluginsDir = path.join(app.getPath('userData'), 'plugins');
      if (!fs.existsSync(pluginsDir)) return [];
      return fs.readdirSync(pluginsDir).filter(f =>
        fs.statSync(path.join(pluginsDir, f)).isDirectory()
      );
    },
    loadPlugins
  );

  ipcMain.on('win-control', (_, action) => {
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'close') mainWindow.close();
    if (action === 'back') mainWindow.webContents.navigationHistory.goBack();
    if (action === 'forward') mainWindow.webContents.navigationHistory.goForward();
    if (action === 'refresh') mainWindow.reload();
  });

  const sendNavState = () => {
    const canGoBack = mainWindow.webContents.navigationHistory.canGoBack();
    const canGoForward = mainWindow.webContents.navigationHistory.canGoForward();
    mainWindow.webContents.send('nav-state', { canGoBack, canGoForward });
  };

  mainWindow.webContents.on('did-navigate', sendNavState);
  mainWindow.webContents.on('did-navigate-in-page', sendNavState);

  ipcMain.on('plugin:to-backend', (_, payload) => {
    pluginProcesses.forEach(proc => {
      if (proc && proc.connected) {
        try { proc.send(payload); } catch (_) { }
      }
    });
  });

  mainWindow.loadURL('https://soundcloud.com');

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('page loaded, injecting plugins');
    loadPlugins();

    pluginScripts.forEach(scriptPath => {
      try {
        const code = fs.readFileSync(scriptPath, 'utf8');
        mainWindow.webContents.executeJavaScript(code).catch(e => {
          console.error(`failed to inject plugin script ${scriptPath}:`, e);
        });
      } catch (e) {
        console.error(`failed to read plugin script ${scriptPath}:`, e);
      }
    });
  });
}

function loadPlugins() {
  terminatePluginProcesses();

  const pluginsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'plugins')
    : path.join(__dirname, 'plugins'); pluginScripts = [];

  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
    console.log('created new plugins directory at:', pluginsDir);
    return;
  }

  const currentSettings = settings.get();
  console.log('loading active plugins...');

  fs.readdirSync(pluginsDir).forEach((folder) => {
    const pluginDir = path.join(pluginsDir, folder);

    if (!fs.statSync(pluginDir).isDirectory()) return;

    const isEnabled = currentSettings.plugins[folder]?.enabled ?? true;
    if (!isEnabled) {
      console.log(`plugin ${folder} is disabled via settings, skipping`);
      return;
    }

    const webviewPath = path.join(pluginDir, 'webview.js');
    const indexPath = path.join(pluginDir, 'index.js');

    if (fs.existsSync(webviewPath)) {
      pluginScripts.push(webviewPath);
    }

    if (fs.existsSync(indexPath)) {
      try {
        const plugin = fork(indexPath);
        pluginProcesses.push(plugin);

        plugin.on('message', (message) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('plugin:to-webview', message);
          }
        });

        plugin.on('exit', (code) => {
          console.log(`plugin ${folder} exited with code ${code}`);

          if (code !== 0 && code !== null) {
            const { Notification } = require('electron');
            new Notification({
              title: `audionode - plugin crashed`,
              body: `the plugin "${folder}" stopped unexpectedly (Code: ${code}).`,
              silent: false
            }).show();
          }
        });

        // handle internal runtime errors
        plugin.on('error', (err) => {
          console.error(`plugin ${folder} error:`, err);

          const { Notification } = require('electron');
          new Notification({
            title: `audionode - plugin error`,
            body: `the plugin "${folder}" encountered an error: ${err.message || err}`,
            silent: false
          }).show();
        });

      } catch (e) {
        console.error(`error loading plugin ${folder}:`, e);
      }
    }
  });
}

function terminatePluginProcesses() {
  pluginProcesses.forEach(proc => {
    try {
      if (proc.connected) {
        proc.kill('SIGKILL');
      }
    } catch (_) { }
  });
  pluginProcesses = [];
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

let isPlaying = false;

function updateThumbar() {
  mainWindow.setThumbarButtons([
    {
      tooltip: 'Previous',
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets/prev.png')),
      click() { mainWindow.webContents.executeJavaScript(`document.querySelector('.skipControl__previous').click()`); }
    },
    {
      tooltip: isPlaying ? 'Pause' : 'Play',
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets/' + (isPlaying ? 'pause.png' : 'play.png'))),
      click() { mainWindow.webContents.executeJavaScript(`document.querySelector('.playControl').click()`); }
    },
    {
      tooltip: 'Next',
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets/next.png')),
      click() { mainWindow.webContents.executeJavaScript(`document.querySelector('.skipControl__next').click()`); }
    },
  ]);
}

ipcMain.on('playback-state', (_, playing) => {
  if (playing !== isPlaying) {
    isPlaying = playing;
    updateThumbar();
  }
});

app.on('ready', () => {
  createWindow();
  updateThumbar();
});
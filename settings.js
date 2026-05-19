const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  roundedCorners: true,
  transparency: 0.1,
  customTopbar: true,
  topbarLabel: 'SoundCloud',
  accentColor: '#ff5500',
  autoLaunch: false,
  plugins: {},
};

function load() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      return { 
        ...DEFAULTS, 
        ...data, 
        plugins: { ...DEFAULTS.plugins, ...(data.plugins || {}) } 
      };
    }
  } catch (e) {
    console.error('failed to load settings:', e);
  }
  return { ...DEFAULTS };
}

function save(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('failed to save settings:', e);
  }
}

let _settings = load();

try {
  app.setLoginItemSettings({ openAtLogin: _settings.autoLaunch });
} catch (e) {
  console.error('failed to set initial launch settings:', e);
}

function get() { return _settings; }

function set(key, value) {
  _settings[key] = value;
  
  if (key === 'autoLaunch') {
    try {
      app.setLoginItemSettings({ openAtLogin: !!value });
    } catch (e) {
      console.error('failed to update native autoLaunch configuration:', e);
    }
  }

  save(_settings);
}

function setPlugin(name, enabled) {
  _settings.plugins[name] = { enabled };
  save(_settings);
}

function setupIpc(mainWindow, getPluginList, reloadPluginsCallback) {
  ipcMain.handle('settings:get', () => {
    return { settings: _settings, plugins: getPluginList ? getPluginList() : [] };
  });

  ipcMain.handle('settings:set', (_, key, value) => {
    set(key, value);
    mainWindow?.webContents?.send('settings:changed', _settings);
    return _settings;
  });

  ipcMain.handle('settings:setPlugin', (_, name, enabled) => {
    setPlugin(name, enabled);
    
    if (typeof reloadPluginsCallback === 'function') {
      reloadPluginsCallback();
    }
    
    mainWindow?.webContents?.send('settings:changed', _settings);
    return _settings;
  });
}

module.exports = { get, set, setPlugin, setupIpc, load };

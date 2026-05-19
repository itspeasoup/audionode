const { contextBridge, ipcRenderer } = require('electron');

// google sign-in doesnt even work either way lmfao
if (!window.chrome) {
  window.chrome = {
    app: { isInstalled: false, InstallState: {}, RunningState: {} },
    runtime: {},
    webstore: {},
    csi: () => { },
    loadTimes: () => { },
  };
}

contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // generic plugin communication lanes
  sendToBackend: (payload) => ipcRenderer.send('plugin:to-backend', payload),
  onBackendMessage: (callback) => ipcRenderer.on('plugin:to-webview', (event, msg) => callback(msg))
});

ipcRenderer.on('load-plugin-scripts', (event, scripts) => {
  scripts.forEach(script => {
    const tag = document.createElement('script');
    tag.src = script;
    tag.type = 'text/javascript';
    document.head.appendChild(tag);
  });
});

window.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.id = 'dynamic-style';
  style.textContent = getStyles(true);
  document.head.appendChild(style);

  const topbar = document.createElement('div');
  topbar.id = 'sc-topbar';
  topbar.innerHTML = `
    <div id="sc-win-buttons">
      <div class="sc-btn close" id="sc-close" title="close"></div>
      <div class="sc-btn min"   id="sc-min"   title="minimize"></div>
      <div class="sc-btn max" id="sc-max" title="maximize"></div>
    </div>
    <div id="sc-topbar-label">soundcloud</div>
    <div id="sc-nav-buttons">
      <div class="sc-nav" id="sc-back" title="back">&#8249;</div>
      <div class="sc-nav" id="sc-refresh" title="refresh">&#8635;</div>
      <div class="sc-nav" id="sc-forward" title="forward">&#8250;</div>
    </div>
  `;
  document.body.appendChild(topbar);

  document.getElementById('sc-close')?.addEventListener('click', () => ipcRenderer.send('win-control', 'close'));
  document.getElementById('sc-min')?.addEventListener('click', () => ipcRenderer.send('win-control', 'minimize'));

  document.getElementById('sc-back')?.addEventListener('click', () => ipcRenderer.send('win-control', 'back'));
  document.getElementById('sc-refresh')?.addEventListener('click', () => ipcRenderer.send('win-control', 'refresh'));
  document.getElementById('sc-forward')?.addEventListener('click', () => ipcRenderer.send('win-control', 'forward'));

  ipcRenderer.on('win-state', (_, state) => {
    const s = document.getElementById('dynamic-style');
    if (s) s.textContent = getStyles();
  });

  ipcRenderer.on('nav-state', (_, { canGoBack, canGoForward }) => {
    const back = document.getElementById('sc-back');
    const forward = document.getElementById('sc-forward');
    if (back) back.classList.toggle('sc-nav-disabled', !canGoBack);
    if (forward) forward.classList.toggle('sc-nav-disabled', !canGoForward);
  });

  setInterval(() => {
    const scroller = document.body.firstElementChild;
    if (scroller) scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, 500);

  setInterval(() => {
    const btn = document.querySelector('.playControl');
    if (btn) {
      const isPlaying = btn.classList.contains('playing');
      ipcRenderer.send('playback-state', isPlaying);
    }
  }, 500);

  function injectWrapperSettings() {
    const tabList = document.querySelector('.settingsMain__tabs');
    const tabContent = document.querySelector('.settingsMain__tabContent');
    if (!tabList || !tabContent) return;
    if (document.getElementById('sc-wrapper-tab')) return; // already injected

    // add tab
    const tab = document.createElement('li');
    tab.className = 'g-tabs-item';
    tab.innerHTML = `<a class="g-tabs-link" id="sc-wrapper-tab" href="#" style="cursor:pointer">Wrapper</a>`;
    tabList.appendChild(tab);

    tab.addEventListener('click', (e) => {
      e.preventDefault();
      // deactivate all tabs
      tabList.querySelectorAll('.g-tabs-link').forEach(t => t.classList.remove('active'));
      tab.querySelector('.g-tabs-link').classList.add('active');
      tabContent.innerHTML = '';
      tabContent.appendChild(buildWrapperPanel());
    });
  }

  function buildWrapperPanel() {
    const panel = document.createElement('div');
    panel.className = 'accountSettings';
    panel.style.cssText = 'padding: 8px 0;';

    ipcRenderer.invoke('settings:get').then(({ settings, plugins }) => {
      panel.innerHTML = `
      <div class="g-form-section">
        <div class="g-form-section-head sc-mb-2x"><h3>Appearance</h3></div>

        <div class="sc-wrapper-row">
          <label class="sc-wrapper-label">Rounded corners</label>
          <label class="sc-wrapper-toggle">
            <input type="checkbox" id="sw-rounded" ${settings.roundedCorners ? 'checked' : ''}>
            <span class="sc-wrapper-slider"></span>
          </label>
        </div>

        <div class="sc-wrapper-row sc-mt-2x">
          <label class="sc-wrapper-label">Window transparency</label>
          <div class="sc-wrapper-slider-row">
            <input type="range" id="sw-transparency" min="0" max="100" step="5" value="${Math.round(settings.transparency * 100)}">
            <span id="sw-transparency-val">${Math.round(settings.transparency * 100)}%</span>
          </div>
        </div>

        <div class="sc-wrapper-row sc-mt-2x">
          <label class="sc-wrapper-label">Topbar label</label>
          <input type="text" id="sw-label" class="textfield__input sc-input sc-input-medium" value="${settings.topbarLabel}" style="width:180px">
        </div>

        <div class="sc-wrapper-row sc-mt-2x">
          <label class="sc-wrapper-label">Accent color</label>
          <input type="color" id="sw-accent" value="${settings.accentColor}" style="width:40px;height:28px;border:none;border-radius:6px;cursor:pointer;background:none;">
        </div>
      </div>

      <div class="g-form-section">
        <div class="g-form-section-head sc-mb-2x"><h3>System</h3></div>
        <div class="sc-wrapper-row">
          <label class="sc-wrapper-label">Launch on startup</label>
          <label class="sc-wrapper-toggle">
            <input type="checkbox" id="sw-autolaunch" ${settings.autoLaunch ? 'checked' : ''}>
            <span class="sc-wrapper-slider"></span>
          </label>
        </div>
      </div>

      <div class="g-form-section">
        <div class="g-form-section-head sc-mb-2x"><h3>Plugins</h3></div>
        <div id="sw-plugins" style="max-height:220px;overflow-y:auto;">
          ${plugins.length === 0
          ? '<p class="sc-text-secondary sc-text-h4" style="margin:0">no plugins installed</p>'
          : plugins.map(p => `
              <div class="sc-wrapper-row sc-mb-1x">
                <span class="sc-wrapper-label">${p}</span>
                <label class="sc-wrapper-toggle">
                  <input type="checkbox" class="sw-plugin" data-plugin="${p}" ${(settings.plugins[p]?.enabled ?? true) ? 'checked' : ''}>
                  <span class="sc-wrapper-slider"></span>
                </label>
              </div>`).join('')
        }
        </div>
      </div>

      <style>
        .sc-wrapper-row { display:flex; align-items:center; justify-content:space-between; padding: 6px 0; }
        .sc-wrapper-label { font-size:14px; color: var(--secondary-color); }
        .sc-wrapper-slider-row { display:flex; align-items:center; gap:10px; }
        .sc-wrapper-toggle { position:relative; display:inline-block; width:36px; height:20px; }
        .sc-wrapper-toggle input { opacity:0; width:0; height:0; }
        .sc-wrapper-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:#555; border-radius:20px; transition:.2s; }
        .sc-wrapper-slider:before { position:absolute; content:""; height:14px; width:14px; left:3px; bottom:3px; background:white; border-radius:50%; transition:.2s; }
        .sc-wrapper-toggle input:checked + .sc-wrapper-slider { background:var(--special-color); }
        .sc-wrapper-toggle input:checked + .sc-wrapper-slider:before { transform:translateX(16px); }
        #sw-transparency { width:160px; accent-color:var(--special-color); }
      </style>
    `;

      // events
      panel.querySelector('#sw-rounded').addEventListener('change', e => {
        ipcRenderer.invoke('settings:set', 'roundedCorners', e.target.checked);
      });

      panel.querySelector('#sw-transparency').addEventListener('input', e => {
        const val = parseInt(e.target.value);
        panel.querySelector('#sw-transparency-val').textContent = val + '%';
        ipcRenderer.invoke('settings:set', 'transparency', val / 100);
      });

      panel.querySelector('#sw-label').addEventListener('change', e => {
        ipcRenderer.invoke('settings:set', 'topbarLabel', e.target.value);
        const label = document.getElementById('sc-topbar-label');
        if (label) label.textContent = e.target.value;
      });

      panel.querySelector('#sw-accent').addEventListener('change', e => {
        ipcRenderer.invoke('settings:set', 'accentColor', e.target.value);
      });

      panel.querySelector('#sw-autolaunch').addEventListener('change', e => {
        ipcRenderer.invoke('settings:set', 'autoLaunch', e.target.checked);
      });

      panel.querySelectorAll('.sw-plugin').forEach(el => {
        el.addEventListener('change', e => {
          ipcRenderer.invoke('settings:setPlugin', e.target.dataset.plugin, e.target.checked);
        });
      });
    });

    return panel;
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  }

  function hexToHue(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    if (max !== min) {
      const d = max - min;
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else if (max === b) h = (r - g) / d + 4;
      h /= 6;
    }
    return h * 360;
  }

  function applyAccentColor(hex) {
    _canvasAccent = hex;
    const existing = document.getElementById('sc-accent-style');
    if (existing) existing.remove();

    const accentStyle = document.createElement('style');
    accentStyle.id = 'sc-accent-style';

    const rgb = hexToRgb(hex);
    const targetHue = hexToHue(hex);
    const hueRotation = targetHue - 20; // soundcloud orange is ~20deg
    const saturation = 1.5; // increase saturation to compensate for desaturation in dark mode
    const brightness = 1.2; // increase brightness to compensate for dark mode

    accentStyle.textContent = `
    :root, html, body {
      --special-color: ${hex} !important;
      --font-special-color: ${hex} !important;
      --toggle-on-body-color: ${hex} !important;
      --toggle-on-body-hover-color: ${hex} !important;
      --button-special-background-color: ${hex} !important;
      --button-secondary-selected-font-color: ${hex} !important;
      --button-secondary-selected-active-font-color: ${hex} !important;
      --button-tertiary-selected-font-color: ${hex} !important;
      --button-secondary-selected-hover-font-color: rgba(${rgb}, 0.4) !important;
      --button-tertiary-selected-hover-font-color: rgba(${rgb}, 0.4) !important;
    }

    /* 1. force override the hardcoded inline fill attributes on the svg paths */
    .sc-button-selected svg path,
    .sc-button-tertiary.sc-button-selected svg path,
    button[class*="-selected"] svg path,
    svg[fill="#f50"] path,
    svg[fill="#F50"] path,
    path[fill="#f50"],
    path[fill="#F50"] {
      fill: ${hex} !important;
    }

    /* 2. some soundcloud buttons change the outer svg fill instead of the path */
    .sc-button-selected svg,
    .sc-button-tertiary.sc-button-selected svg,
    svg[fill="#f50"],
    svg[fill="#F50"] {
      fill: ${hex} !important;
    }

    .g-tabs-link.active, 
    .networkError__refreshLink {
      color: ${hex} !important;
      border-color: ${hex} !important;
    }
    
    .waveform__scene canvas {
      filter: hue-rotate(${hueRotation}deg) saturate(${saturation}) brightness(${brightness});
    }
  `;
    document.head.appendChild(accentStyle);
  }

  // watch for settings page navigation
  const settingsObserver = new MutationObserver(() => {
    if (window.location.pathname.startsWith('/settings')) {
      injectWrapperSettings();
    }
  });
  settingsObserver.observe(document.body, { childList: true, subtree: true });

  if (window.location.pathname.startsWith('/settings')) {
    injectWrapperSettings();
  }

  function loadSettings(settings) {
    // transparency
    document.documentElement.style.setProperty('--wrapper-transparency', Math.min(1 - settings.transparency, 0.998));

    // rounded corners toggle
    document.documentElement.classList.toggle('sc-rounded-window', !!settings.roundedCorners);

    // accent color
    applyAccentColor(settings.accentColor);

    const label = document.getElementById('sc-topbar-label');
    if (label) label.textContent = settings.topbarLabel;
  }

  ipcRenderer.invoke('settings:get').then(({ settings }) => loadSettings(settings));

  ipcRenderer.on('settings:changed', (_, settings) => loadSettings(settings));
});

function getStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: auto;
      background: transparent !important;
      font-family: 'Inter', sans-serif;
    }

    html.sc-rounded-window, html.sc-rounded-window body {
      border-radius: 12px;
      clip-path: inset(0 round 12px);
    }
    
    html.sc-rounded-window #sc-topbar {
      border-radius: 12px 12px 0 0;
    }

    /* ---- topbar ---- */
    #sc-topbar {
      position: fixed;
      top: 0; left: 0;
      width: 100%;
      height: 44px;
      z-index: 99999;
      background: rgb(from var(--background-surface-color) r g b / var(--wrapper-transparency, 0.85));
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      -webkit-app-region: drag;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      border-radius: var(--border-radius, 12px) var(--border-radius, 12px) 0 0;
      box-sizing: border-box;
      padding: 0 16px;
      z-index: 2147483647; /* maximum possible z-index */
    }

    #sc-win-buttons {
      display: flex;
      gap: 7px;
      -webkit-app-region: no-drag;
      flex-shrink: 0;
      justify-content: flex-start;
    }

    #sc-topbar-label {
      font-size: 14px;
      font-weight: 500;
      color: rgb(from var(--secondary-color) r g b / .75);
      letter-spacing: 0.03em;
      user-select: none;
      text-align: center;
      -webkit-app-region: drag;
    }

    #sc-nav-buttons {
      display: flex;
      gap: 4px;
      -webkit-app-region: no-drag;
      justify-content: flex-end;
    }

    .sc-nav {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      color: rgb(from var(--secondary-color) r g b / .75);
      transition: color 0.15s ease, background 0.15s ease;
      user-select: none;
    }

    .sc-nav-disabled {
      opacity: 0.25;
      cursor: default;
      pointer-events: none;
    }

    .sc-nav:hover {
      color: white;
      background: rgba(255,255,255,0.08);
    }

    #sc-win-buttons {
      display: flex;
      gap: 7px;
      -webkit-app-region: no-drag;
      flex-shrink: 0;
    }

    .sc-btn {
      width: 13px;
      height: 13px;
      border-radius: 50%;
      cursor: pointer;
      transition: filter 0.15s ease, transform 0.15s ease;
      position: relative;
    }

    .sc-btn:hover { filter: brightness(1.25); transform: scale(1.1); }
    .sc-btn.close { background: #ff5f57; }
    .sc-btn.min   { background: #febc2e; }
    .sc-btn.max { background: #b0c0b3; cursor: default; }
    .sc-btn.max:hover { filter: none; transform: none; }

    /* ---- push soundcloud below topbar ---- */
    header.sc-selection-disabled.fixed.g-z-index-header {
      top: 44px !important;
      background: rgb(from var(--background-surface-color) r g b / var(--wrapper-transparency, 0.85));
    }

    /* ---- scrollbar ---- */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: rgb(from var(--secondary-color) calc(255 - r) calc(255 - g) calc(255 - b) / .28);
      border-radius: 99px;
    }
    ::-webkit-scrollbar-thumb:hover { background: rgb(from var(--secondary-color) r g b / .38); }

    /* acrylic provides blur, body is a semi-transparent dark tint */
    body { background: rgb(from var(--background-surface-color) r g b / var(--wrapper-transparency, 0.85)) !important; }

    body > :first-child {
      overflow-y: auto;
      height: calc(100vh - 44px);
      margin-top: 44px;
    }

    /* soundcloud's hardcoded stuff */
    a.creatorSubscriptionsButton {
      border-color: var(--font-special-color) !important;
      color: var(--font-special-color) !important;
    }
    .profileMenu__icon path[fill="#F50"],
    .profileMenu__icon path[fill="#f50"] {
      fill: var(--font-special-color) !important;
    }
      
  `;
}
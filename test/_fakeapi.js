// A fake window.surge for rendering Surge's pages without the main process (screenshots and feel tests).
// FAKE_PAGE picks the sample data; FAKE_THEME (light|dark) is set by the test through nativeTheme.
const { contextBridge, ipcRenderer } = require('electron');
const cols = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ec4899', '#14b8a6', '#64748b', '#f97316'];
const names = ['Finder', 'Safari', 'Messages', 'Mail', 'Music', 'Notes', 'Settings', 'Terminal', 'Photos', 'Calendar'];
const paths = names.map(n => '/Applications/' + n + '.app');
const svgIcon = (c, l) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".85"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect x="6" y="6" width="116" height="116" rx="28" fill="url(#g)"/><text x="64" y="84" font-family="Helvetica" font-size="56" font-weight="700" fill="#fff" text-anchor="middle">${l}</text></svg>`);
const listeners = {}; let acts = [];
const dockMod = { enabled: true, edge: 'bottom', size: 1, magnify: true, look: 'islands', aura: true, reflect: true, labels: true, pinned: paths.slice(0, 7), widgets: ['apps', 'launchpad', 'clock', 'battery', 'volume', 'focus', 'caffeine'] };
let S = { modules: { dock: dockMod, keys: { enabled: true }, clip: { enabled: true } }, masterVolume: .7 };
try { const extra = JSON.parse(process.env.FAKE_SETTINGS || '{}'); if (extra.dock) Object.assign(dockMod, extra.dock); } catch {}
const UPD = JSON.parse(process.env.FAKE_UPDATER || '{"status":"available","current":"3.0.6","latest":"3.1.0","whatsNew":["Surge Dock magnifies smoothly, with no lag","A calm new look in light and dark","Keyboard shortcuts sheet"]}');
const api = {
  on: (ch, cb) => { (listeners[ch] = listeners[ch] || []).push(cb); },
  getSettings: async () => S, setSettings: async p => { S = { ...S, ...p, modules: { ...S.modules, ...(p.modules || {}) } }; return S; },
  action: async (id, name, arg) => { if (id === 'updater' && name === 'state') return UPD; acts.push([id, name, arg]); return null; },
  appsRunning: async () => [0, 1, 2, 7, 8].map(i => ({ path: paths[i], name: names[i], bundleId: 'x.' + i, pid: 100 + i, front: i === 1 })),
  appsInstalled: async () => names.map((n, i) => ({ path: paths[i], name: n })),
  appIcon: async p => { const i = paths.indexOf(p); return svgIcon(cols[i % cols.length], names[i][0]); },
  getBattery: async () => ({ level: 78, charging: true, remaining: '0:42' }),
  listModules: async () => [], hookState: async () => 'running',
  whatsNew: async () => ({ version: '3.1.0', forVersion: '3.1.0', items: [] }),
  platform: 'darwin',
};
for (const k of ['appOpen', 'appActivate', 'appQuit', 'appReveal', 'appForceQuit', 'appOpenWith', 'preview', 'toggleNotes', 'updHeight', 'popoverHeight', 'whatsNewDone', 'close', 'hide']) api[k] = (...a) => { };
api.pathFor = () => null;
contextBridge.exposeInMainWorld('surge', api);
contextBridge.exposeInMainWorld('__fake', { acts: () => JSON.parse(JSON.stringify(acts)), reset: () => { acts = []; }, emit: (ch, p) => (listeners[ch] || []).forEach(f => f(p)) });
ipcRenderer.on('fake:emit', (_e, ch, p) => (listeners[ch] || []).forEach(f => f(p)));

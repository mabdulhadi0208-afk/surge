# Surge 3

Your Mac, turned up. Surge is a menu-bar toolbox where every feature is its own small module you flip on in Settings.
Surge 3.1 wears the family's Maison look (warm paper, deep ink, one emerald accent, the flow hover) and is built for zero lag:
it sleeps whenever you are not using it.

**Download:** [the latest release](https://github.com/mabdulhadi0208-afk/surge/releases/latest). Mac (Apple silicon): `Surge-mac-arm64.dmg`. Windows: `Surge-win-x64.exe`. Surge updates itself after that.

| Group | Module | What it does |
|---|---|---|
| Glow | **Charge Glow** | Edge aurora when you plug in, warm sweep on unplug, red pulse on low battery, gold at 100%, charge capsule, optional chimes |
| Glow | **Network Glow** | A glow when the network comes back, amber when you drop offline |
| Sound | **Keyboard Sounds** | 145 synthesised presets: 30 real-switch sound-alikes plus Thocky, Creamy, Clicky, Clacky and Special, with search and favourites |
| Sound | **Mouse Sounds** | 14 click sounds and 8 scroll styles with momentum and trackpad haptics |
| Sound | **Hourly Chime** | A soft bell on the hour, with quiet hours |
| Screen | **Click Ripple** | A burst under every click (ring, shockwave, sparks or a liquid drop), optional comet trail |
| Screen | **Cursor Spotlight** | Dims everything except a circle around the cursor (Command Shift S) |
| Screen | **Night Tint** | A warm wash over the screen on a schedule |
| Screen | **Window Snap** | Halves, quarters, full and centre from the keyboard (Control Option arrows and 1 to 4) |
| Screen | **Surge Dock** | A Dock replacement with widgets, and a Launchpad (Command Shift D, Command Shift L) |
| Screen | **Caps Lock HUD** | A capsule when Caps Lock changes |
| Productivity | **Caffeine** | Keeps the Mac awake, until you turn it off or for a set time |
| Productivity | **Clipboard History** | Your last copies, searchable (Command Shift V), kept in memory only |
| Productivity | **Focus Timer** | Pomodoro with a glow and chime at every phase |
| Productivity | **Break Reminder** | 20-20-20 nudges |
| Productivity | **Typing Stats** | Live words per minute and keys today |
| System | **System Stats** | CPU and memory in the menu bar |
| System | **Auto Dark Mode** | Dark at night, light in the morning |
| System | **Auto Update** | Checks GitHub Releases every 30 minutes, downloads in the background, swaps the app and relaunches |
| System | **Hotkeys** | Global shortcuts for all of the above |

Every sound is generated at runtime (WebAudio for keys and clicks, `tools/make-sounds.py` for the glassy chimes), and every
glow is drawn live by `engine.js`. Nothing phones home except the update check.

## Run, test, build

```bash
npm install
npm start
xvfb-run -a npx electron test/perf.js --no-sandbox     # idle CPU of every Surge process + frame timing (/tmp/surge-perf.log)
xvfb-run -a npx electron test/shots.js --no-sandbox    # screenshots of every surface (/tmp/surge-shots-raw)
xvfb-run -a npx electron test/whatsnew.js --no-sandbox # the What's new film: plays once after an update, skips, replays (/tmp/surge-whatsnew.log)
xvfb-run -a npx electron test/dockfeel31.js --no-sandbox # Surge Dock: transform-only magnification, frames, layout cost, Undo (/tmp/surge-dockfeel31.log)
xvfb-run -a npx electron test/flow31.js --no-sandbox   # the flow hover contrast on every page, light and dark, plus the 3.1 Settings features (/tmp/surge-flow31.log)
xvfb-run -a npx electron test/shots31.js --no-sandbox  # Dock, Launchpad and update card screenshots with sample data (/tmp/surge-shots31)
npx electron-builder --mac dmg zip
```

Surge starts on Linux too (for tests): the macOS-only parts simply stay quiet.

## Releasing

Bump `version` in `package.json`, rewrite `RELEASE_NOTES.md` for users, and push to `main`. `.github/workflows/build.yml`
builds, signs, runs the release gate (including a real self-update on the runner) and publishes the release with those notes.
The in-app updater reads `releases/latest` and downloads `Surge-mac-arm64.zip` (or the Windows installer), so the asset
names must stay the same.

## Design and speed rules

- One design system: `nova.css` (the layout and components) with `maison.css` linked last on every page (3.1, Lumen 4.5's Maison: paper and ink, one emerald accent #1f6b52, Instrument Serif and Geist from `fonts/`, hairlines, at most one modest shadow, and the flow hover whose labels must stay at least 3:1, checked by `test/flow31.js`). `nova.js` holds the icons and sets where the flow hover starts.
- No emoji anywhere in the app.
- Only `transform` and `opacity` animate, every animation plays once, no `backdrop-filter` (Settings uses native vibrancy).
- Transparent always-on-top windows are hidden when not in use and sized to their content.
- No polling that is not needed right now: timers start when a feature turns on and stop when it turns off.

## Add your own module

Drop a file in `modules/`:

```js
module.exports = {
  id: 'hello', name: 'Hello', icon: 'bolt', group: 'System', desc: 'Says hi.',
  defaults: { loud: false },
  schema: [{ k: 'loud', t: 'toggle', label: 'Loud' }],
  start(ctx) { ctx.fireGlow('info', { hud: { text: 'Hi there', color: '#FF2E8A' } }); },
  stop(ctx) {},
};
```
`ctx` gives you `fireGlow`, `overlaySend`, `ripple`, `play` (synth), `sysSound`, `uiSound`, `onInput` (global keys and mouse),
`setTray`, `notify`, `dialog`, `mod(id)`, `applyPatch`, `clipboard`, `powerSaveBlocker` and `globalShortcut`.

# Surge 3

Your Mac, turned up. Surge is a menu-bar toolbox where every feature is its own small module you flip on in Settings.
Surge 3.0 is a complete redesign (deep colour, glass, hero banners, one-shot spring motion) and is built for zero lag:
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
npx electron-builder --mac dmg zip
```

Surge starts on Linux too (for tests): the macOS-only parts simply stay quiet.

## Releasing

Bump `version` in `package.json`, rewrite `RELEASE_NOTES.md` for users, and push to `main`. `.github/workflows/build.yml`
builds, signs, runs the release gate (including a real self-update on the runner) and publishes the release with those notes.
The in-app updater reads `releases/latest` and downloads `Surge-mac-arm64.zip` (or the Windows installer), so the asset
names must stay the same.

## Design and speed rules

- One design system, Lumen 4.0's: `nova.css` (Lumen's palette, type, liquid glass, gem tiles, section heroes, light and dark) and `nova.js` (icons, module hues, the hero backdrop and its dots, which pause when hidden, off screen or unfocused).
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

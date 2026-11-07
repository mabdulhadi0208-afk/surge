# ⚡ Surge — a 17-in-1 Mac toolbox

Started as a charging glow. Now a menu-bar toolbox where every feature is an independent module you flip on in Settings (⌘,).

| Group | Module | What it does |
|---|---|---|
| Glow | **Charge Glow** | Edge aurora on plug-in (green), warm sweep on unplug, red pulse on low battery, gold at 100%, charge capsule, chimes |
| Glow | **Network Glow** | Ice glow when Wi-Fi comes back, amber when you drop offline |
| Sound | **Keyboard Sounds** | 115 synthesised presets in Thocky · Creamy · Clicky · Clacky · Special, search + favourites + 🎲, pitch variety, deep spacebar, release sound |
| Sound | **Mouse Sounds** | 14 click sounds (Click, Pop, Glass, Shutter, Metal, Marble…) + 3 scroll styles |
| Sound | **Hourly Chime** | Soft bell on the hour, quiet hours |
| Screen | **Click Ripple** | Glowing ring under every click (left/right colours) |
| Screen | **Cursor Spotlight** | Dim everything except a circle around the cursor — ⌘⇧S |
| Screen | **Night Tint** | Warm screen wash on a schedule |
| Screen | **Caps Lock HUD** | Pill + sound when Caps Lock flips |
| Productivity | **Caffeine** | Keep the Mac awake (∞ / 30m / 1h / 2h / 4h) — ☕ in the menu bar |
| Productivity | **Clipboard History** | Last 10/25/50 copies in the menu bar |
| Productivity | **Focus Timer** | Pomodoro with glow + chime on phase change, countdown in the menu bar |
| Productivity | **Break Reminder** | 20-20-20 nudges |
| Productivity | **Typing Stats** | Live WPM + keys today |
| Productivity | **Quick Notes** | Floating always-on-top scratchpad — ⌘⇧N |
| System | **System Stats** | CPU / memory in the menu bar, warn glow when pegged |
| System | **Auto Dark Mode** | Dark at night, light in the morning |
| System | **Auto Update** | Polls GitHub Releases, downloads the DMG in the background, swaps the app and relaunches — works despite ad-hoc signing |
| System | **Hotkeys** | ⌘⇧G glow · ⌘⇧N notes · ⌘⇧S spotlight · ⌘⇧K keyboard sounds · ⌘⇧C caffeine |

All sounds are generated with WebAudio at runtime (no sample packs → no licensing, tiny app). All glows are drawn live by `engine.js`.

## Run / build

```bash
npm install          # also rebuilds the native input hook for Electron
npm start
./build-dmg.sh       # → dist/Surge-2.0.0-arm64.dmg
```

## Permissions (macOS asks once)

- **Input Monitoring** — Keyboard Sounds, Mouse Sounds, Click Ripple, Caps Lock HUD, Typing Stats. System Settings → Privacy & Security → Input Monitoring → Surge. Relaunch after granting.
- **Automation (System Events)** — Auto Dark Mode only.

## Add your own module

Drop a file in `modules/`:

```js
module.exports = {
  id: 'hello', name: 'Hello', icon: 'bolt', group: 'System', desc: 'Says hi.',
  defaults: { loud: false },
  schema: [{ k: 'loud', t: 'toggle', label: 'Loud' }],
  start(ctx) { ctx.fireGlow('info', { hud: { text: 'Hi!', color: '#7DF9FF' } }); },
  stop(ctx) {},
};
```
`ctx` gives you: `fireGlow`, `overlaySend`, `play` (synth), `sysSound`, `onInput` (global key/mouse), `setTray`, `notify`, `mod(id)` settings, `applyPatch`, `clipboard`, `powerSaveBlocker`, `globalShortcut`.

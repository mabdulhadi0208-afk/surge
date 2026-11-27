## Surge 3.0.5: Surge Dock, now a real Dock

**Download:** Mac (Apple silicon): **Surge-mac-arm64.dmg**, drag Surge to Applications, then right-click it and choose Open the first time. Windows: **Surge-win-x64.exe** (if SmartScreen asks: More info, then Run anyway). Already have Surge? It updates itself.

- **Surge Dock comes with you into fullscreen apps.** It used to stay out of them completely. Now it tucks away in a fullscreen app and slides up the moment you touch the bottom edge of the screen, just like Apple's Dock. Settings, Surge Dock, Slide up in fullscreen apps (on by default).
- **Windows keep clear of the Dock.** When you zoom or fill a window, or an app opens a big one, it now stops just above Surge Dock instead of sliding underneath, the way macOS does for Apple's Dock. Windows you drag under it yourself are left alone, as with Apple's Dock. With auto-hide on, no space is kept, also like Apple's Dock. Settings, Surge Dock, Keep windows clear of the Dock (uses Accessibility).
- **It behaves like part of macOS.** Surge Dock now stays put in Mission Control instead of flying off with your windows, is skipped by Cmd and the backtick key, and sits at the Dock's own level on every desktop. A small native helper built into Surge does this; if it is ever missing, Surge Dock simply works as before.

## Surge 3.0.4: Surge Dock takes over for real, and a new icon

**Download:** Mac (Apple silicon): **Surge-mac-arm64.dmg**, drag Surge to Applications, then right-click it and choose Open the first time. Windows: **Surge-win-x64.exe** (if SmartScreen asks: More info, then Run anyway). Already have Surge? It updates itself.

- **Surge Dock replaces Apple's Dock for real.** Turn on Replace the macOS Dock and Apple's Dock is gone: it no longer slides up when the cursor touches the screen edge, and it never bounces. It used to need a System Events permission, and if macOS refused it the option quietly switched itself off; now nothing extra is asked for. Your own Dock settings (size, side, auto-hide and the rest) are saved and come back exactly as they were when you turn it off or quit Surge, and if macOS ever brings Apple's Dock back, Surge removes it again.
- **Surge Dock is a real Dock, not a window.** Clicking it never takes focus from the app you are in, it stays out of Mission Control and the Window menu, and it sits at the Dock's own level above app windows on every desktop.
- **A brand new icon:** the white bolt on a pink to violet gem, the same icon as on the website.
- **A short film of what is new plays once after Surge updates.** A beam of light crosses a glass stage, the Surge gem lands with a ring of light and a burst of sparks, the version drops in letter by letter, and this version's changes slide in one by one. About seven seconds, then it gets out of your way.
- **Skip it any time:** press Esc, Enter or Space, or click anywhere. It never plays twice for the same version, and a fresh install keeps its own welcome instead.
- **Watch it again whenever you like:** Settings, About, What's new, or What's new in the Surge menu.
- **With Reduce motion on, the film is a calm still card** that closes on its own.

## Surge 3.0.3: Update now always works

**Download:** Mac (Apple silicon): **Surge-mac-arm64.dmg**, drag Surge to Applications, then right-click it and choose Open the first time. Windows: **Surge-win-x64.exe** (if SmartScreen asks: More info, then Run anyway). Already have Surge? It updates itself.

- **Update now never does nothing.** Pressed before Surge had looked for updates (the card or the menu opened right after Surge started, or after a check that could not reach GitHub), it used to return without a word. Now it looks first, then downloads the new version; if there is nothing newer, the card says so.
- **The button answers the moment you press it:** it gives under your finger, says Starting with a spinner, and a ring of light spreads from it.
- **The update card says "1 change"**, not "1 changes".

If Update now did nothing for you before, download this version once from the website. From then on Surge updates itself.

## Surge 3.0.2: your Mac stays the way you set it, and Surge stays smooth

**Download:** Mac (Apple silicon): **Surge-mac-arm64.dmg**, drag Surge to Applications, then right-click it and choose Open the first time. Windows: **Surge-win-x64.exe** (if SmartScreen asks: More info, then Run anyway). Already have Surge? It updates itself.

Every animation, glow, ripple and drifting dot looks exactly the way it did. Surge just does far less work to draw them.

- **Auto Dark Mode no longer switches your Mac to light (or dark) by itself.** It used to re-apply its schedule every time Surge started, updated or saved any setting. Now it only acts at the times you set, or once when you turn it on or change its times, and if you change the appearance yourself it leaves it alone until the next scheduled time.
- **Settings no longer stalls.** Saving one setting used to wake all twenty modules (and Auto Dark Mode answered each save by switching the whole Mac's appearance). Now only the module you changed hears about it, and switching pages never saves or asks Surge for anything.
- **Settings opens faster and flips pages smoothly.** Page backdrops are painted in the background instead of all 24 at once while the window opens, and the painted dots are kept for next time.
- **Flipping a switch no longer rebuilds the 145-sound list** (or the app list) behind it.
- **The Charge Glow preview no longer resizes itself on every frame.**
- **Surge Dock and Launchpad never freeze Surge while loading app icons**, and the Dock starts far fewer helper processes.
- **The right-click menu opens every time**, not only the first time.
- **The menu bar text (Typing Stats words per minute) updates at most four times a second** instead of on every key.
- **Surge now notes in its log anything that holds it up for more than a tenth of a second**, so any lag that is left can be found.

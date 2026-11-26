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

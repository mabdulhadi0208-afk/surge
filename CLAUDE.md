# Surge

Surge is an Electron menu-bar toolbox for Mac (and Windows). Repo `mabdulhadi0208-afk/surge`, branch `main`. See README.md for
the modules, how to run and test, and how to release.

## Standing rules

- **Every Surge update rewrites the What's new film.** `WHATS_NEW` in `whatsnew.js` holds ONLY that version's changes (remove
  every older item, set `version` to the new version), and the film (`whatsnew.html`) gets a bit more cinematic than the last
  version. It plays once after an update (`wantsWhatsNew(version, seen)`, the seen version is `whatsNewSeen` in settings), and
  again from Settings, About, What's new, or What's new in the Surge menu. The update card's "What is new" list reads the same
  `WHATS_NEW`.
- `test/whatsnew.js` must pass: `xvfb-run -a npx electron test/whatsnew.js --no-sandbox`.
- No emoji anywhere in the app. No real brand logos. Only `transform` and `opacity` animate, every animation plays once, and
  everything respects Reduce motion.
- Release: bump `version` in `package.json` (and `package-lock.json`), rewrite `RELEASE_NOTES.md` for users
  (`## Surge X.Y.Z: ...` and bullets), push to `main`. `.github/workflows/build.yml` builds, runs the release gate and publishes.
- Never commit signing keys, `.p12` files or secrets.

// Updater test: a fake GitHub (local fixture server) publishes v3.0.1 the way .github/workflows/build.yml does, and a
// Surge 3.0.0 updater (modules/00-updater.js, run in a child process standing in for the app) finds it, downloads it,
// verifies size + sha256 + bundle version, swaps the .app and relaunches it. Also: version comparison, one download even when
// checks pile up, a bad checksum is refused, and Surge refuses to quit when it cannot replace itself.
// Run: xvfb-run -a npx electron test/updater.js --no-sandbox   (or plain: node test/updater.js). Writes /tmp/surge-updater.log.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const REPO = 'mabdulhadi0208-afk/surge', ZIP = 'Surge-mac-arm64.zip';
const UPDATER = path.join(__dirname, '..', 'modules', '00-updater.js');

/* ------------------------------------------------------------ child: plays "Surge 3.0.0" running the real updater */
if (process.env.SURGE_UPDATER_CHILD) {
  const Module = require('module'), orig = Module._load;
  Module._load = function (r, ...a) { return r === 'electron' ? { BrowserWindow: function () {}, screen: {}, powerMonitor: { on() {} } } : orig.call(this, r, ...a); };
  const U = require(UPDATER), dir = process.env.SURGE_UPDATER_CHILD, say = o => process.stdout.write(JSON.stringify(o) + '\n');
  let last = '';
  const ctx = { app: { getPath: k => (k === 'logs' ? path.join(dir, 'logs') : dir), getVersion: () => '3.0.0', isPackaged: false, exit: c => { say({ exit: c }); process.exit(c); } },
    broadcast: (_c, s) => { if (s.status !== last) { last = s.status; say({ status: s.status, latest: s.latest, error: s.error }); } },
    mod: () => ({ auto: false, popup: false, pollSeconds: 1800 }), setTray() {}, fireGlow() {}, notify() {}, uiSound() {}, applyPatch() {}, markCleanExit() {}, stopHook() {} };
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  U.start(ctx);
  (async () => {
    const st = () => U.actions.state().status;
    // pile-up: the timer, the menu and a wake all check at once, then two downloads are asked for
    await Promise.all([U._check(ctx, false), U._check(ctx, false), U._check(ctx, true)]);
    say({ afterCheck: st(), latest: U.actions.state().latest, size: U.actions.state().size });
    await Promise.all([U.actions.download(), U.actions.download(), U._check(ctx, false)]);
    for (let i = 0; i < 200 && !['ready', 'error'].includes(st()); i++) await new Promise(r => setTimeout(r, 100));
    say({ afterDownload: st(), staged: U.actions.state().staged, error: U.actions.state().error });
    if (process.env.SURGE_UPDATER_INSTALL && st() === 'ready') { await U.actions.install(); await U.actions.install(); say({ afterInstall: st(), error: U.actions.state().error }); }
    setTimeout(() => process.exit(0), 3000);
  })();
  return;
}

/* ------------------------------------------------------------ parent */
const LOGF = '/tmp/surge-updater.log'; try { fs.unlinkSync(LOGF); } catch {}
let fails = 0; const out = m => { console.log(m); fs.appendFileSync(LOGF, m + '\n'); };
const ok = (c, m) => { if (!c) fails++; out((c ? 'PASS ' : 'FAIL ') + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'surge-upd-'));
const plist = v => `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Surge</string><key>CFBundleIdentifier</key><string>app.surge.glow</string><key>CFBundleShortVersionString</key><string>${v}</string><key>CFBundleVersion</key><string>${v}</string></dict></plist>`;
function makeApp(root, v, marker) {
  const app = path.join(root, 'Surge.app'); fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), plist(v));
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'Surge'), `#!/bin/bash\necho "${v}" >> "${marker}"\nsleep 25\n`, { mode: 0o755 });
  return app;
}
// macOS tools the updater shells out to, as Linux stand-ins (only for this test)
const SHIM = path.join(T, 'shim'); fs.mkdirSync(SHIM);
fs.writeFileSync(path.join(SHIM, 'ditto'), '#!/bin/bash\nif [ "$1" = "-x" ]; then unzip -q -o "$3" -d "$4" -x "__MACOSX/*"; else cp -R "$1" "$2"; fi\n', { mode: 0o755 });
fs.writeFileSync(path.join(SHIM, 'open'), '#!/bin/bash\n[ "$1" = "-a" ] && { "$2/Contents/MacOS/Surge" >/dev/null 2>&1 & disown; exit 0; }\nexit 1\n', { mode: 0o755 });
fs.writeFileSync(path.join(SHIM, 'xattr'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });

// what CI publishes for v3.0.1: a zip with Surge.app at the top (ditto -c -k --keepParent), and GitHub's sha256 digest
const MARK = path.join(T, 'launched.txt');
const build = path.join(T, 'build'); fs.mkdirSync(build); makeApp(build, '3.0.1', MARK);
const zipFile = path.join(T, ZIP); execFileSync('zip', ['-qry', zipFile, 'Surge.app'], { cwd: build });
const zipBuf = fs.readFileSync(zipFile), digest = crypto.createHash('sha256').update(zipBuf).digest('hex');
let gets = 0, ranged = 0, badDigest = false;
const server = http.createServer((q, s) => {
  const u = q.url.split('?')[0], host = `http://127.0.0.1:${server.address().port}`;
  if (u === `/${REPO}/releases/latest`) { s.writeHead(302, { Location: `${host}/${REPO}/releases/tag/v3.0.1` }); return s.end(); }
  if (u === `/${REPO}/releases/download/v3.0.1/${ZIP}`) { s.writeHead(302, { Location: `${host}/assets/123?sig=abc` }); return s.end(); }   // GitHub redirects to storage
  if (u === '/assets/123') {
    const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    if (m) { const a = +m[1], b = m[2] ? +m[2] : zipBuf.length - 1; if (a === 0 && b === 0) ranged++; else if (q.method === 'GET') gets++; s.writeHead(206, { 'Content-Range': `bytes ${a}-${b}/${zipBuf.length}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' }); return s.end(q.method === 'HEAD' ? undefined : zipBuf.subarray(a, b + 1)); }
    if (q.method === 'GET') gets++;
    s.writeHead(200, { 'Content-Length': zipBuf.length, 'Accept-Ranges': 'bytes' }); return s.end(q.method === 'HEAD' ? undefined : zipBuf);
  }
  if (u === `/api/repos/${REPO}/releases/tags/v3.0.1`) { s.writeHead(200, { 'Content-Type': 'application/json' }); return s.end(JSON.stringify({ tag_name: 'v3.0.1', draft: false, assets: [{ name: ZIP, size: zipBuf.length, digest: 'sha256:' + (badDigest ? '0'.repeat(64) : digest) }] })); }
  s.writeHead(404); s.end();
});

function runChild(name, extraEnv) {
  const dir = path.join(T, name); fs.mkdirSync(dir, { recursive: true });
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', SURGE_TEST: '1', SURGE_UPDATER_CHILD: dir, PATH: SHIM + ':' + process.env.PATH,
    SURGE_UPDATE_BASE: `http://127.0.0.1:${server.address().port}`, SURGE_UPDATE_API: `http://127.0.0.1:${server.address().port}/api`, ...extraEnv };
  for (const k of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) delete env[k];
  env.no_proxy = env.NO_PROXY = '127.0.0.1,localhost';
  return new Promise(res => {
    const c = spawn(process.execPath, [__filename], { env, stdio: ['ignore', 'pipe', 'pipe'] }); const msgs = []; let buf = '', err = '';
    c.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { msgs.push(JSON.parse(l)); } catch {} } });
    c.stderr.on('data', d => (err += d));
    const kill = setTimeout(() => c.kill('SIGKILL'), 60000);
    c.on('exit', code => { clearTimeout(kill); res({ code, msgs, err, dir }); });
  });
}
const get = (msgs, k) => msgs.find(m => k in m);
const readLog = dir => { try { return fs.readFileSync(path.join(dir, 'logs', 'surge.log'), 'utf8'); } catch { return ''; } };

server.listen(0, '127.0.0.1', async () => {
  try {
    // 1. version comparison is numeric, never a string compare ("3.0.0" vs "2.20.0")
    const Module = require('module'), orig = Module._load;
    Module._load = function (r, ...a) { return r === 'electron' ? {} : orig.call(this, r, ...a); };
    const { newer, same } = require(UPDATER)._semver; Module._load = orig;
    ok(newer('v3.0.0', '2.20.0') && !newer('2.20.0', 'v3.0.0') && newer('3.0.1', '3.0.0') && newer('3.0.10', '3.0.9') && !newer('3.0.0', '3.0.0') && newer('3.1', '3.0.9') && same('v3.0.1', '3.0.1'),
      'version comparison: 3.0.0 > 2.20.0, 3.0.10 > 3.0.9, 3.0.1 > 3.0.0, equal is not newer');

    // 2. full update 3.0.0 -> 3.0.1: check, download, verify, swap, relaunch
    const apps = path.join(T, 'Applications'); fs.mkdirSync(apps); const target = makeApp(apps, '3.0.0', MARK);
    const r = await runChild('full', { SURGE_UPDATE_BUNDLE: target, SURGE_UPDATER_INSTALL: '1' });
    const ac = get(r.msgs, 'afterCheck'), ad = get(r.msgs, 'afterDownload'), ai = get(r.msgs, 'afterInstall');
    ok(ac && ac.latest === 'v3.0.1' && ac.size === zipBuf.length, `found v3.0.1 from the latest-release redirect, size ${ac?.size} = ${zipBuf.length} (ranged GET probe: ${ranged})`);
    ok(ad && ad.afterDownload === 'ready', `downloaded and staged (${ad?.afterDownload}${ad?.error ? ': ' + ad.error : ''})`);
    if (!ad || ad.afterDownload !== 'ready') out('child log:\n' + readLog(r.dir) + '\nmessages: ' + JSON.stringify(r.msgs) + '\nstderr: ' + r.err.slice(0, 800));
    ok(gets === 1, `three checks and two download requests at once made exactly one download (${gets})`);
    ok(/sha256 verified/.test(readLog(r.dir)), 'sha256 checked against the digest GitHub reports');
    ok(ai && ai.afterInstall === 'installing' && r.msgs.filter(m => 'exit' in m).length === 1, 'install quits once to swap (a second click does not start a second swap)');
    let launched = '', ulog = '';
    for (let i = 0; i < 80; i++) { try { launched = fs.readFileSync(MARK, 'utf8'); ulog = fs.readFileSync(path.join(r.dir, 'logs', 'update.log'), 'utf8'); } catch {} if (/launched OK/.test(ulog) && /3\.0\.1/.test(launched)) break; await wait(250); }
    const v = (/CFBundleShortVersionString<\/key><string>([^<]+)/.exec(fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8')) || [])[1];
    ok(v === '3.0.1', `the app in Applications is now 3.0.1 (${v})`);
    ok(/3\.0\.1/.test(launched) && /launched OK/.test(ulog), 'the new version was launched by the swap script');
    ok(!fs.existsSync(target + '.old'), 'the old copy was cleaned up');
    let mark = ''; try { mark = fs.readFileSync(path.join(r.dir, 'just-updated'), 'utf8').trim(); } catch {}
    ok(mark === '3.0.1', `"just updated" marker records the installed version (${mark || 'missing'})`);
    try { execFileSync('pkill', ['-f', path.join(target, 'Contents', 'MacOS', 'Surge')]); } catch {}

    // 3. a download whose sha256 does not match what GitHub reports is never installed
    badDigest = true;
    const b = await runChild('baddigest', { SURGE_UPDATE_BUNDLE: target });
    const bd = get(b.msgs, 'afterDownload');
    ok(bd && bd.afterDownload === 'error' && !bd.staged && /checksum mismatch/.test(readLog(b.dir)), `bad checksum refused (${bd?.afterDownload})`);
    badDigest = false;

    // 4. Surge cannot replace itself (opened from the DMG / not writable): it says so and keeps running
    const c = await runChild('readonly', { SURGE_UPDATE_BUNDLE: '/Volumes/Surge/Surge.app', SURGE_UPDATER_INSTALL: '1' });
    const ci = get(c.msgs, 'afterInstall');
    ok(ci && ci.afterInstall === 'error' && /Applications/.test(ci.error || '') && !c.msgs.some(m => 'exit' in m), `cannot swap: stays open with "${(ci?.error || '').slice(0, 60)}..."`);

    if (r.err.trim()) out('child stderr: ' + r.err.trim().slice(0, 400));
  } catch (e) { ok(false, 'test crashed: ' + e.stack); }
  out(fails ? `${fails} FAILED` : 'ALL PASS');
  server.close(); try { fs.rmSync(T, { recursive: true, force: true }); } catch {}
  try { require('electron').app?.exit?.(fails ? 1 : 0); } catch {}
  process.exit(fails ? 1 : 0);
});

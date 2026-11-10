// Windows app helper for Surge Dock: one long-lived PowerShell process answers "list" / "act <pid>" / "icon <path>".
// (Spawning PowerShell per poll would cost ~300 ms of CPU every time; one warm process costs almost nothing.)
const { spawn } = require('child_process');
const SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.IO; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
[ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellItemImageFactory { [PreserveSig] int GetImage(SZ size, int flags, out IntPtr phbm); }
[StructLayout(LayoutKind.Sequential)] public struct SZ { public int cx; public int cy; }
public class SW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  public static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);
  public static uint FrontPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
  public static void Activate(IntPtr h) { if (IsIconic(h)) ShowWindowAsync(h, 9); keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); SetForegroundWindow(h); }
  public static string Icon(string path, int size) {
    IShellItemImageFactory f; SHCreateItemFromParsingName(path, IntPtr.Zero, new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), out f);
    IntPtr hb; SZ s; s.cx = size; s.cy = size; if (f.GetImage(s, 4, out hb) != 0) return "";
    try { using (Bitmap src = Image.FromHbitmap(hb)) {
      Rectangle r = new Rectangle(0, 0, src.Width, src.Height); BitmapData d = src.LockBits(r, ImageLockMode.ReadOnly, src.PixelFormat);
      try { using (Bitmap o = (Image.GetPixelFormatSize(src.PixelFormat) < 32) ? new Bitmap(src) : new Bitmap(d.Width, d.Height, d.Stride, PixelFormat.Format32bppPArgb, d.Scan0))
        using (MemoryStream ms = new MemoryStream()) { o.Save(ms, ImageFormat.Png); return Convert.ToBase64String(ms.ToArray()); } }
      finally { src.UnlockBits(d); } } }
    finally { DeleteObject(hb); }
  }
}
"@
while ($true) {
  $l = [Console]::In.ReadLine(); if ($l -eq $null) { break }
  try {
    if ($l -eq 'list') {
      $fp = [SW]::FrontPid()
      Get-Process | Where-Object { $_.MainWindowTitle -and $_.Path } | ForEach-Object { [Console]::Out.WriteLine("$($_.Id)\`t$($_.ProcessName)\`t$($_.Path)\`t$([int]($_.Id -eq $fp))\`t$($_.Description)") }
    } elseif ($l.StartsWith('act ')) {
      $p = Get-Process -Id ([int]$l.Substring(4)) -ErrorAction SilentlyContinue; if ($p) { [SW]::Activate($p.MainWindowHandle) }
    } elseif ($l.StartsWith('icon ')) {
      [Console]::Out.WriteLine([SW]::Icon($l.Substring(5), 128))
    }
  } catch { }
  [Console]::Out.WriteLine('##END')
}
`;
let ps = null, buf = '', queue = [], cur = null;
function next() { if (cur || !queue.length || !ps) return; cur = queue.shift(); try { ps.stdin.write(cur.cmd + '\n'); } catch { const c = cur; cur = null; c.res(null); } }
function start() {
  if (ps) return;
  ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('##END')) >= 0) { const out = buf.slice(0, i); buf = buf.slice(i + 5).replace(/^\r?\n/, ''); const c = cur; cur = null; if (c) c.res(out); next(); } });
  ps.on('error', () => {}); ps.stdin.on('error', () => {});
  ps.on('exit', () => { ps = null; buf = ''; const all = [cur, ...queue].filter(Boolean); cur = null; queue = []; all.forEach(q => q.res(null)); });
}
function send(cmd, timeout = 20000) {
  return new Promise(resolve => { start(); const item = { cmd }; let done = false;
    item.res = v => { if (done) return; done = true; clearTimeout(t); resolve(v); };
    const t = setTimeout(() => { if (cur === item) { cur = null; next(); } else queue = queue.filter(q => q !== item); item.res(null); }, timeout);
    queue.push(item); next(); });
}
module.exports = {
  async list() { const out = await send('list'); if (out == null) return null;
    return out.split(/\r?\n/).map(l => l.split('\t')).filter(a => a.length >= 4 && a[2]).map(a => ({ pid: +a[0], name: a[1], path: a[2], front: a[3] === '1', desc: (a[4] || '').trim() })); },
  activate(pid) { return send('act ' + (pid | 0)); },
  async icon(p) { const out = await send('icon ' + String(p).replace(/[\r\n]/g, '')); return out ? out.replace(/\s+/g, '') : ''; },
  stop() { try { ps?.stdin.end(); ps?.kill(); } catch {} },
};

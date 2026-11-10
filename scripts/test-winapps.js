// CI check (Windows runner): the PowerShell helper compiles, answers, and returns a real PNG icon.
const w = require('../winapps');
(async () => {
  const l = await w.list(); if (l === null) { console.log('✗ helper did not answer "list"'); process.exit(1); }
  console.log('✓ list answered,', l.length, 'windowed apps', l.slice(0, 5).map(a => a.name).join(', '));
  const ic = await w.icon('C:\\Windows\\explorer.exe'); const b = Buffer.from(ic, 'base64');
  if (b.length < 500 || b.slice(1, 4).toString() !== 'PNG') { console.log('✗ icon is not a PNG, bytes:', b.length); process.exit(1); }
  console.log('✓ icon is a PNG,', b.length, 'bytes'); require('fs').writeFileSync('explorer-icon.png', b);
  await w.activate(0); console.log('✓ activate answered'); w.stop(); process.exit(0);
})();

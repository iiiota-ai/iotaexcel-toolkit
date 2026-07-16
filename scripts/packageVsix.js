const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const manifest = require('../package.json');
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'dist');
const outputPath = path.join(outputDir, `${manifest.name}-${manifest.version}.vsix`);
const vsceBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vsce.cmd' : 'vsce');

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(vsceBin)) {
  console.error('Missing local @vscode/vsce. Run npm install or npm ci before packaging.');
  process.exit(1);
}

execFileSync(vsceBin, ['package', '--out', outputPath], {
  cwd: root,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

execFileSync(process.execPath, [path.join(__dirname, 'writeChecksum.js'), outputPath], {
  cwd: root,
  stdio: 'inherit',
});

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const targets = args.flatMap((target) => {
  if (!target.includes('*')) {
    return [target];
  }

  const dir = path.resolve(path.dirname(target));
  const pattern = path.basename(target).replace(/\./g, '\\.').replace(/\*/g, '.*');
  const regex = new RegExp(`^${pattern}$`);
  return fs.readdirSync(dir)
    .filter((name) => regex.test(name))
    .map((name) => path.join(dir, name));
});

if (targets.length === 0) {
  console.error('Usage: node scripts/writeChecksum.js <file> [...file]');
  process.exit(1);
}

const entries = targets.map((target) => {
  const filePath = path.resolve(target);
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return {
    dir: path.dirname(filePath),
    line: `${hash}  ${path.basename(filePath)}`,
  };
});

const outputDir = entries[0].dir;
const checksumPath = path.join(outputDir, 'sha256sums.txt');
fs.writeFileSync(checksumPath, `${entries.map((entry) => entry.line).join('\n')}\n`, 'utf8');
console.log(`Wrote ${checksumPath}`);

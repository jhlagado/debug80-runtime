import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-runtime-package-'));
const packDirectory = path.join(temporary, 'pack');
const consumer = path.join(temporary, 'consumer');
fs.mkdirSync(packDirectory);
fs.mkdirSync(consumer);

try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packed = JSON.parse(
    execFileSync(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory], {
      cwd: packageRoot,
      encoding: 'utf8',
    })
  );
  const filename = packed[0]?.filename;
  if (typeof filename !== 'string') {
    throw new Error('npm pack did not report a runtime tarball');
  }
  const tarball = path.join(packDirectory, filename);
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(consumer, 'smoke.mjs'),
    [
      "import { createTec1gHeadlessSession, parseIntelHex } from '@jhlagado/debug80-runtime';",
      "import { createZ80Runtime } from '@jhlagado/debug80-runtime/z80/runtime';",
      "if (typeof createTec1gHeadlessSession !== 'function') throw new Error('missing session');",
      "if (typeof parseIntelHex !== 'function') throw new Error('missing HEX parser');",
      "if (typeof createZ80Runtime !== 'function') throw new Error('missing Z80 runtime');",
    ].join('\n')
  );
  execFileSync(npm, ['install', '--ignore-scripts', tarball], { cwd: consumer, stdio: 'inherit' });
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'inherit' });
  console.log(`runtime package smoke passed: ${tarball}`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

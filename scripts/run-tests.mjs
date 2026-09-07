import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'po-tests-'));
try {
  const outfile = join(dir, 'tests.cjs');
  await build({ entryPoints: ['tests/uk-import.test.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  process.exitCode = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit', env: process.env }).status ?? 1;
} finally { await rm(dir, { recursive: true, force: true }); }

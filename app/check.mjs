// Runs the vite output the way the packaged Electron main process sees it:
// plain node, no rules_js fs patches, only dist/node_modules on the path.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Runtime closure of @datadog/electron-sdk@1.0.0 (dd-trace overridden to 6.20.1), per pnpm-lock.yaml.
const expected = {
  '@datadog/electron-sdk': '1.0.0',
  'dd-trace': '6.20.1',
  'dc-polyfill': '0.1.11',
  'import-in-the-middle': '3.5.1',
  opentracing: '0.14.7',
  'cjs-module-lexer': '2.3.0',
  'es-module-lexer': '3.0.4',
  'module-details-from-path': '1.0.4',
};

// Copy out of runfiles so node can't walk up into the Bazel node_modules tree.
const app = mkdtempSync(join(tmpdir(), 'dd-repro-'));
cpSync(resolve(process.argv[2]), app, { recursive: true, dereference: true });

let failed = false;
for (const [pkg, version] of Object.entries(expected)) {
  const pj = join(app, 'node_modules', pkg, 'package.json');
  const got = existsSync(pj) ? JSON.parse(readFileSync(pj, 'utf8')).version : 'MISSING';
  const ok = got === version;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${pkg}: want ${version}, got ${got}`);
}

// dd-trace's ESM instrumentation path: register import-in-the-middle's loader,
// hook an ESM module that re-exports CJS, and require the hook to fire.
writeFileSync(join(app, 'cjs.cjs'), 'exports.answer = 42;\n');
writeFileSync(join(app, 'esm.mjs'), "export * from './cjs.cjs';\n");
writeFileSync(
  join(app, 'probe.mjs'),
  `import tracer from 'dd-trace';
import { register } from 'node:module';
register('import-in-the-middle/hook.mjs', import.meta.url);
const { Hook } = await import('import-in-the-middle');
let fired = false;
new Hook([new URL('./esm.mjs', import.meta.url).pathname], (exports) => { fired = exports.answer === 42; return exports; });
await import('./esm.mjs');
console.log(JSON.stringify({ tracer: typeof tracer.init, fired }));
process.exit(fired ? 0 : 1);
`,
);
const env = { PATH: process.env.PATH, DD_TRACE_ENABLED: 'false' };
const r = spawnSync(process.env.JS_BINARY__NODE_BINARY ?? process.execPath, ['probe.mjs'], { cwd: app, env, encoding: 'utf8' });
const lastErr = r.stderr.trim().split('\n').find((l) => /^\w*Error|Cannot find/.test(l)) ?? r.stderr.trim().split('\n').at(-1);
console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} esm hook probe: ${r.stdout.trim() || lastErr}`);
failed ||= r.status !== 0;
// --expect-broken flips the verdict so `bazel test //...` stays green while the repro holds.
const expectBroken = process.argv.includes('--expect-broken');
console.log(failed ? 'runtime tree BROKEN' : 'runtime tree OK');
process.exit(failed === expectBroken ? 0 : 1);

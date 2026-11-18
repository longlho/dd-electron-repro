# dd-electron-repro

Does `@datadog/electron-sdk@1.0.0`'s Vite plugin still need our copier patch under Bazel + rules_js?

Yes.

Same pins as ppl-ai/agi: Bazel 9.2.0, aspect_rules_js 3.5.2, node 26.10.0, pnpm 12.6.0, vite 8.3.2, electron 45.2.3, root `dd-trace@5.131.1`, override `@datadog/electron-sdk>dd-trace: 6.20.1`, `datadogVitePlugin({ copyRuntimeDependencies: true })`.

```sh
bazel test //...
```

Two identical apps, one per lockfile:

- `//unpatched` - stock SDK. Test asserts the runtime tree is broken.
- `//patched` - `patches/@datadog__electron-sdk@1.0.0.patch` (the one in agi) via `patchedDependencies`. Test asserts it works.

Each `:main_vite` is a `js_run_binary` vite build in the sandbox, so the plugin copier runs against the real rules_js store. `:runtime_test` copies `dist/` to a temp dir, checks every package in the SDK's runtime closure, then runs plain node (no rules_js fs patches) with dd-trace loaded and import-in-the-middle's ESM loader registered, and requires the hook to fire on an ESM module re-exporting CJS.

## Result

Unpatched build is green but logs:

```
[datadog] Failed to copy package 'dc-polyfill' to build output
[datadog] Failed to copy package 'import-in-the-middle' to build output
[datadog] Failed to copy package 'opentracing' to build output
```

```
ok   @datadog/electron-sdk: want 1.0.0, got 1.0.0
ok   dd-trace: want 6.20.1, got 6.20.1
FAIL dc-polyfill: want 0.1.11, got MISSING
FAIL import-in-the-middle: want 3.5.1, got MISSING
FAIL opentracing: want 0.14.7, got MISSING
FAIL cjs-module-lexer: want 2.3.0, got MISSING
FAIL es-module-lexer: want 3.0.4, got MISSING
FAIL module-details-from-path: want 1.0.4, got MISSING
FAIL esm hook probe: Error: Cannot find module 'dc-polyfill'
```

Patched: all 8 packages at the locked versions, `{"tracer":"function","fired":true}`.

## Why

Upstream resolves every package in the tree from the plugin file (`_require = createRequire(vite-plugin.mjs)`). In the rules_js store the SDK's own `node_modules` only links its direct deps (`dd-trace`, `electron`), and rules_js doesn't hoist, so dd-trace's deps aren't reachable from there. The copier swallows the error, so the build passes and the packaged main process dies on `require('dd-trace')`. agi's root `package.json` doesn't list any of the six either, so the monorepo hits the same thing.

The patch resolves each dependency from the package that declares it (`createRequire(<pkgDir>/package.json)`), which is what node does at runtime.

Scope: this toolchain and layout. A hoisted npm/yarn `node_modules` would hide the bug.

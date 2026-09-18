// sql.js WASM loading for the Workflow (workerd) runtime. Cannot reuse
// src/data/ankiImport.js's Node-path loader (`node:fs` isn't meaningful for a
// deployed Worker's bundle) or fetch bytes at runtime and dynamically
// instantiate them (Workers/Workflows disallow dynamic wasm compilation —
// `WebAssembly.instantiate()` only accepts a precompiled Module there, the
// same restriction that blocks `eval`). The only supported path is a
// *static* `.wasm` import, which Wrangler's bundler precompiles into a ready
// WebAssembly.Module at deploy time.
//
// Imported by its explicit dist/ subpath, not the bare `sql.js` specifier:
// sql.js's package.json resolves the bare specifier to a "browser" condition
// build (sql-wasm-browser.js) when bundled for a browser-like target — which
// Workers' bundler counts as. That build (and, as a fallback, this one too)
// computes a default script-directory string at init time via
// `typeof __filename !== 'undefined' ? __filename : self.location.href`
// (used only to build a default locateFile() path we never hit, since
// instantiateWasm below is supplied) — harmless in Node (where __filename
// exists) or a real browser (where location exists), but workerd has
// neither: __filename is genuinely undefined and `self.location` doesn't
// exist at all, so evaluating `.href` on it throws unconditionally, before
// instantiateWasm is ever consulted. The side-effect-only import below
// polyfills a dummy `location` first, sidestepping this without patching
// sql.js itself — it has to be a real import (not just an earlier statement
// in this file) since module imports are hoisted and evaluate before any of
// this file's own top-level code, regardless of source order.
import './polyfillWorkerdLocation.js'
import initSqlJs from 'sql.js/dist/sql-wasm.js'
import sqlWasmModule from '../../../node_modules/sql.js/dist/sql-wasm.wasm'

export function loadSqlJsForWorkflow() {
  return initSqlJs({
    instantiateWasm(imports, successCallback) {
      // Module (not bytes) overload of WebAssembly.instantiate() resolves
      // directly to an Instance — no {module, instance} destructuring needed.
      WebAssembly.instantiate(sqlWasmModule, imports).then(successCallback)
      return {}
    },
  })
}

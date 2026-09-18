// Side-effect-only module, imported first (before sql.js) in loadSqlJs.js —
// see that file's header comment for why. Its own file, not inlined there:
// ES module imports are hoisted and evaluated in source order *before* any
// other statement in the importing module runs, so the assignment has to
// live in a module of its own to reliably execute before sql.js's does.
//
// sql.js's Emscripten-generated UMD wrapper's own environment detection
// decides it's running under Node (workerd apparently satisfies whatever
// check that's based on — likely a minimal `process` global) and then, on
// that branch, touches `__dirname` completely unguarded (no `typeof` check,
// unlike its `self.location` fallback above) purely to build a default
// locate-file base path we never use (instantiateWasm is supplied). `bare
// __dirname` is a genuine ReferenceError in an ES module/workerd context —
// there is no such binding, auto-injected or otherwise — so it has to be
// polyfilled here the same way.
globalThis.location ??= { href: 'https://workers.invalid/' }
globalThis.__dirname ??= '/'

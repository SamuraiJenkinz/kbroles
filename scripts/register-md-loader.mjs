// Registers scripts/md-loader.mjs via node:module register() so the .md
// loader hook is active before tsx's off-thread hooks process any imports.
//
// Node 22+ runs --import hooks in a separate worker thread via the new
// loader hooks API. tsx v4 also registers its hooks in that worker. When
// `--import ./scripts/md-loader.mjs` is used directly, the hook lands in
// the worker but tsx's load() wraps it such that tsx's nextLoad() goes to
// Node's defaultLoad rather than our hook. Calling register() explicitly
// from THIS preload script (which runs before tsx) inserts our hook into
// the worker BEFORE tsx's load wrapper, so tsx's nextLoad hits our hook.
//
// See .planning/quick/003-fix-pilot-deploy-workarounds-into-real-fixes/.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(
  './scripts/md-loader.mjs',
  pathToFileURL(process.cwd() + '/').href,
)

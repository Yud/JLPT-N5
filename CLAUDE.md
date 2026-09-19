# Browser testing

For manual/exploratory browser checks (verifying a UI change actually works), use the
Homebrew-installed `playwright-cli`, not `npx playwright install` or launching Playwright's
own bundled browsers. The npm-managed browser binaries aren't installed in this environment,
and downloading them pulls hundreds of MB.

```
/opt/homebrew/Cellar/playwright-cli/*/bin/playwright-cli open --browser chrome "<url>"
```

`--browser chrome` uses the system Google Chrome install (already present) as the browser
channel — no browser download needed. Drive it with the CLI's own commands (`click`,
`fill`, `snapshot`, `requests`, etc. — see `playwright-cli --help`), targeting elements by
the `ref=` id from the most recent `snapshot` output, not by text. Always `playwright-cli
close` when done.

This does not apply to the project's own automated Playwright test suite (`tests/e2e/`,
run via `npm run test:e2e`) — that's a separate, already-configured setup.

# Resource-constrained code design

For any code that runs in a resource-constrained runtime (Cloudflare Workers/Workflows,
containers, serverless functions, anything with a per-invocation CPU/memory/time budget),
design for the tightest realistic resource limits from the start — regardless of which
plan/tier is nominally available. Never hold a whole file, response body, or large payload
in memory when a chunked, streamed, or range-based alternative exists. Prefer scatter/gather
or streaming as the default shape for anything whose cost scales with input size, not as a
fix applied after a production failure. Apply this as a senior engineer would by default,
without waiting for the user to specify resource limits explicitly — see the commit history
around `workflows/anki-import/` (six+ production incidents culminating in a full redesign
to range reads) for a case study of what it costs when this isn't done up front.

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

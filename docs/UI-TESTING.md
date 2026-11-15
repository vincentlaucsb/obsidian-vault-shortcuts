# Real Obsidian UI tests and listing screenshots

The Playwright suite runs the copied production plugin bundle in a disposable,
fictional **Recipe Box** vault. It complements `npm test`; it does not replace the
fast TypeScript/model/creator tests or native OS display/launch checks.

## Requirements and commands

Use Windows with **Obsidian 1.15.0** installed and Node 22+. Playwright is a pinned
development dependency; no separate Chromium download is required. The harness
uses the installed app's Chromium through a loopback CDP connection. Direct
Playwright Electron launch timed out with this packaged app's Node inspector.

```powershell
npm ci --ignore-scripts
npm run test:ui
npm run screenshots
```

The default executable is `%LOCALAPPDATA%\Obsidian\Obsidian.exe`. To use a separate
pinned installation:

```powershell
$env:OBSIDIAN_EXECUTABLE = 'C:\path\to\Obsidian.exe'
npm run test:ui
```

Each command first type-checks and builds `main.js`. The suite checks the rendered
Obsidian version and fails on a different host version. It is currently verified
only on Windows; existing Linux CI runs lint, all authored TypeScript checks,
fast tests and build. It does not run these native Windows UI tests. Run them
locally before merging UI changes. A maintainer Mac/Linux matrix is not required.

## Isolation and external boundaries

Every test creates its own `.test-build/ui-*` directory, application profile,
vault, home, roaming/local app-data directories and icon store. It copies only
the current `main.js`, manifest and CSS, then writes fictional Markdown/CSV
fixtures. It does not read or copy personal vaults, settings or vault registries.

The version-specific bootstrap writes **its own** `obsidian.json` and synthetic
vault ID metadata, enables only this plugin in that fresh profile's storage, and
disables updates there. Renderer checks verify the actual vault folder, profile
and version before test interactions. The test bootstrap is separate from plugin
runtime behavior and must be revisited when the pinned host changes.

The native `execFile` boundary is blocked **before plugin imports**, including
the Desktop resolver's captured/promisified function. The quick-create canary
clicks the real button and verifies the blocked call and error notice. No native
Desktop/Programs lookup or personal Obsidian CLI command is executed by the
suite. Other-vault tests exercise manual entry with discovery unavailable.
The OS may log that the personal app already owns the CLI server pipe; the test
does not connect to that pipe. Existing personal Obsidian windows are not attached
to or closed by the harness.

Clipboard reads/writes are fixture-controlled in each owning document; tests do
not inspect or change the user's clipboard. Image import/conversion/storage and
production controls remain real. Playwright intercepts the connected file input
for selection/cancellation; this does **not** prove a native Windows picker is
visible or that OS icons/URI associations work. Retain focused native checks for
those behaviors. Tests cancel URI dialogs rather than launching writing shortcuts.

Teardown closes only the owned browser/process with bounded waits. Successful
profiles are removed only after canonical-path checks constrain deletion to a
direct `ui-*` child of this workspace's `.test-build`. Failures retain their
profile and `host.log` in `.test-build/ui-*`; traces and screenshots for all open
fixture windows live under `.test-build/playwright-results`.
No process-name-based kill or personal-profile
cleanup is used. The full `.test-build` tree is ignored build/test output.

## Coverage and visual baselines

Seven real-host tests cover the native-process isolation canary, detached Settings
at a 650px viewport, wrapping rows, General/Advanced draft preservation, fixed
vaults, copied previews, folder create/search and optional names, clicked notes
and attachments, owning-document image imports/cancellation/empty and denied
clipboard preservation, clipboard-image success, text replacing a prior image,
and other-vault manual presets. Three Windows PNG baselines live in
`tests/e2e/__screenshots__/win32/`.

```powershell
npm run test:ui:update
```

Update intentionally, inspect the changed PNGs and review behavioral assertions
before committing. Never update baselines just to hide an unexplained failure.
Baseline rendering depends on the host OS, fonts and scale as well as Obsidian;
generate and compare on the same Windows environment. Different platforms need
separate reviewed baselines. [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots).

## Listing assets

`npm run screenshots` captures four scenes in both default light and dark themes:
settings, custom icons, folder creation and note-heading navigation. It reuses
the same fixture and interaction helpers, with stable viewport sizes and no
private content or screenshot-only product markup. Outputs are in
[`docs/images/listing`](images/listing/README.md); these are curated assets, separate
from regression goldens. The pot-pie fixture is the illustration previously
created for this project; no network image fetch is required.

Inspect every regenerated asset. README uses a repository-relative image so the
Obsidian listing can resolve it too. [Official listing guidance](https://docs.obsidian.md/plugins/releasing/submit-plugin).
This command generates local assets; it does not publish or submit the plugin.

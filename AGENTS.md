# Vault Shortcuts contributor rules

Applies to all work in this repository. Read [docs/PLAN.md](docs/PLAN.md) for the agreed
product scope and architecture. Keep this file and that plan consistent with the
user's latest decisions. Do not expand the product to solve hypothetical issues.

## TypeScript and type safety — user requirements

- Implement all plugin code in **TypeScript**. New tests should also be TypeScript.
  Generated `main.js` is a build artifact, not a source file to edit. Small tooling
  configuration files may use the format required by the tool; do not put plugin
  behavior into JavaScript to evade type checking.
- Keep TypeScript `strict: true`. Type-check all `src/**/*.ts` and `tests/**/*.ts`.
- **Do not use `any` unless absolutely necessary.** Prefer named interfaces,
  generics, unions and `unknown` with runtime narrowing. Do not use `as any`, broad
  index signatures, double assertions or `@ts-ignore` to hide a solvable type error.
- An unavoidable third-party interoperability boundary must be isolated, immediately
  narrowed, and documented with why a precise type or `unknown` cannot work. Do not
  export that weakness through `IShortcutCreator` or other public contracts.
- Catch errors as `unknown`; narrow before reading `message` or `code`. Narrow
  external data before use. Prefer type guards over assertions of runtime facts.
- Use `const`/`let`, explicit public method contracts and `async`/`await`. Return
  `Promise<string>` with the created absolute shortcut path from creator methods.
- Do not disable type-aware lint rules or relax the compiler to obtain a passing
  build. Resolve errors at their source. Existing `.mjs` spike tests are historical;
  migrate them when working on the implementation/test structure, preserving coverage.

## Official Obsidian guidance

Retrieved September 13, 2026. The following are concise, repository-relevant
summaries with authoritative links, not verbatim copies. Recheck these sources
before submission because policies and tooling can change. The older
`Plugins/Releasing/Plugin+guidelines` URL did not resolve during this retrieval;
use the current policies, checklist and official lint documentation below.

### Directory policies — mandatory for submission

Source: [Developer policies](https://docs.obsidian.md/community-directory/developer-policies).

- Keep source reviewable; no purpose-hiding obfuscation, client telemetry, or
  self-installing/self-updating plugin code or runtime dependencies.
- Disclose external file access in README, explaining why it is needed. Disclose
  network/account/payment requirements and other policy-listed behavior if added.
- Include a root `LICENSE`; identify the license and required third-party credits.
  Respect Obsidian trademarks and do not imply first-party status.
- Follow the policy's specific conditions before distributing a fork. This is an
  original utility; research examples are not permission to copy their code.
- This project adds no ads, network services, accounts, payments or telemetry.

### Plugin-specific requirements

Source: [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).

- Keep `isDesktopOnly: true`: the plugin requires Node filesystem/process APIs.
- Choose `minAppVersion` based on APIs actually used. If the minimum is unknown,
  follow the official fallback of the latest stable Obsidian version at release
  preparation; verify that version then rather than inventing a baseline.
- Description: concise action-oriented text, at most 250 characters, ending in a
  period; no emoji or introductory “This is a plugin” boilerplate. Do not include
  “Obsidian” in the description: the November 15, 2026 preview feedback for master
  commit 5335c68 explicitly flagged it. Check the next preview before claiming
  that hosted finding is cleared.
- Do not prefix command IDs with the plugin ID. Remove template/sample code.
- Only use `fundingUrl` for financial-support links; omit it when unused.

### Manifest identity

Source: [Manifest reference](https://docs.obsidian.md/Reference/Manifest).

- Keep required fields valid and the version in `x.y.z` form.
- IDs contain lowercase letters/hyphens only, cannot contain `obsidian`, and cannot
  end in `plugin`. Match the local installation folder to the ID.
- Verify final name/ID uniqueness. Do not name the plugin after an Obsidian core
  feature or include “Obsidian”, its prohibited variations, or “Plugin” in its name.
- The official community registry maps `Vault Shortcuts` / `vault-shortcuts` to
  this repository (verified November 15, 2026). Preserve that established identity.
- `isDesktopOnly` is not an OS selector. Describe supported/experimental platforms
  accurately and handle unsupported platforms gracefully.

### API, UI and compatibility practices

Source: [Official plugin self-critique checklist](https://docs.obsidian.md/oo/plugin).

- Use the plugin's `this.app`, never the global `app`; use Obsidian `Platform` for
  plugin OS detection. Narrow `TFile`, `TFolder` and `FileSystemAdapter` appropriately.
- Prefer public APIs, avoid deprecated calls and unnecessary globals. Use
  `vault.configDir` rather than hardcoding `.obsidian` in runtime code.
- Use `loadData`/`saveData` for plugin settings. Prefer Vault APIs for vault data;
  this plugin's Desktop writes are explicitly outside the vault.
- No default hotkeys or redundant plugin-name prefixes in registered command names.
- Use sentence case and native UI controls. Avoid redundant settings headings;
  use `Setting.setHeading()` if sections become necessary, not raw heading tags.
- Scope CSS to the plugin; avoid inline styling and changes to core styles.
- Keep startup light; defer layout-dependent work until layout readiness. Avoid
  vault-wide scans for a known path. Remove debug logging and keep a lockfile.
- Shortcut creation does not modify notes. The opt-in Windows Send to capture
  writes the selected image and its embed using Vault APIs, including `process`
  for existing daily notes. Preserve prior contents and the source image.

### Official static checks and version-sensitive APIs

Sources: [Official ESLint plugin](https://github.com/obsidianmd/eslint-plugin/blob/master/README.md),
[official sample lint configuration](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/eslint.config.mts).

- Configure `eslint-plugin-obsidianmd` with its recommended type-aware rules when
  implementing the production structure. Add `@typescript-eslint/no-explicit-any`
  as an error. Keep unsafe assignments/calls/member accesses checked.
- Include manifest/license checks. Generated bundles and dependencies are excluded
  from linting; authored plugin code is not. Tooling/test exclusions must be narrow.
- Resolve actionable warnings as well as errors; do not copy sample rule-disabling
  examples or blanket-disable review rules. Investigate genuine false positives
  and document narrowly scoped resolutions instead of concealing failures.
- Use settings APIs compatible with the declared minimum. The current official
  rules distinguish settings definitions/update APIs for 1.13+ from `display()`
  support needed for older versions. Verify installed typings and release targets
  before adopting newer APIs; do not blindly copy a latest-version example.

## Project-specific implementation rules

These are local engineering decisions, not claims that Obsidian mandates this design.

- Follow csvzall's source layout: all plugin implementation belongs under `src/`,
  with `src/main.ts` as the entry point and shortcut creators/helpers in
  `src/shortcuts/`. Keep the shared icon control, image conversion and asset
  handling in `src/icons/`. Keep tests and fixtures in `tests/`; keep design documents,
  plans, research and preview images under `docs/` (images in `docs/images/`).
  Keep README, AGENTS.md, LICENSE, manifest and tooling configuration at the
  repository root. Update relative links when moving documents. Do not add runtime
  TypeScript files at the root. The build must still emit root `main.js` so release
  assets and the Truck vault's existing file symlinks continue to work.
- Implement `IShortcutCreator`, public `ShortcutCreator` factory/facade, and one
  concrete creator per OS. Resolve the OS once and delegate vault, file and tag creation.
- Share URI encoding, filename handling, serializers and exclusive-write helpers.
  Keep UI/notices in the Obsidian layer; OS creators resolve paths and create files.
- Persist independent Desktop, Windows Start Menu and Tag shortcuts context-menu toggles with
  loadData/saveData. Default all to enabled, validate stored booleans, and apply
  changes to file menus only. Do not register editor-menu shortcut actions. These toggles must not disable commands
  or settings-page creation actions.
- File shortcut actions support every TFile, including JPG/CSV attachments.
  Preserve full file extensions in URI targets. Keep the
  existing createNoteShortcut interface for compatibility; it accepts file paths.
- Folder file menus have one Create folder shortcut… action when Desktop or the
  available Windows Start Menu toggle is enabled. Reuse the options dialog,
  defaulting to Create a note with Clipboard when launched, plus Search this
  folder. Fix the clicked vault/folder in host/model/writer validation; offer an
  optional note basename and create directly inside that folder via core new/file.
  Blank/whitespace names use Untitled.md; let Obsidian allocate numbered names on
  each launch, without overwrite/append/prepend or creation-time timestamps.
  Verify repeated launches in an isolated test vault, preserving earlier notes.
  Keep user-supplied names validated and all content/icon/destination options.
  Search includes descendants using an anchored, escaped, explicitly
  case-sensitive path regex, not a folder-open URI. Root folders are supported.
  Reject stale/moved/replaced folders
  before creation. No folder scans, direct note edits or new menu preference.
- Vault action: plugin settings button. Note action: note context menu, using the
  clicked file, not the active note. Retain existing commands as secondary access.
- Windows custom icons (issue #1, version 0.1.0): preserve immediate creation with the
  vault default and add **Create shortcut with options…** for explicit overrides.
  Broader core URI support is approved for 1.0.0 in docs/URI-DESIGN.md;
  the custom-icon implementation remains the 0.1.0 baseline. Reuse the image picker/preview in
  settings and creation, tag and other-vault dialogs. Accept PNG, JPEG and ICO;
  distinguish vault default, custom image and the standard Obsidian icon.
  Other-vault shortcuts default to the Obsidian icon with an optional override,
  without automatically inheriting the current vault's custom icon.
  Provide **Paste image** beside **Choose image…** using the owning window's
  Clipboard API only on that explicit click. Capture image bytes immediately;
  never poll the clipboard or retain a live clipboard source for an icon. Reuse
  image validation/conversion/preview/storage, preserve selection on empty,
  unsupported, denied or failed reads, and guard concurrent/closed-dialog results.
  Do not interpret clipboard text, HTML, URLs or file paths as image imports.
  Create picker inputs and conversion elements in the control's owning document;
  detached Settings windows must not use main-window global DOM helpers.
- 1.0.0 URI builder: use a read-only live URI preview with Copy and structured
  controls. Keep the preview fixed above General and Advanced tabs. General holds
  shortcut name, destination and icon options; Advanced holds action/target and
  URI behavior controls. Preserve edits when switching tabs and keep validation,
  launch effects and creation controls visible. In a note-origin dialog, fix both vault and clicked file, including
  for append/prepend/replace actions. Enforce context in the request model rather
  than relying only on disabled UI. Allow choosing the same vault's name (default)
  or manually pasted vault ID; explain portability, rename and duplicate-name
  tradeoffs plus device-local ID scope. Verify a pasted ID against the current
  vault folder using the documented CLI before enabling ID-based creation. Allow
  only the original name or host-verified ID in the bound request model. Generate writing URIs without directly editing
  notes or reading clipboard content during shortcut creation. The detailed draft
  is docs/URI-DESIGN.md. Preserve quick actions and provide the options dialog on
  every supported desktop OS, with destination/icon controls reflecting the OS.
- Options-dialog vault identity is fixed before opening: current vault from
  settings, or the explicit other-vault selection passed by that dialog's More
  options action. Show the vault read-only; keep discovery and manual vault entry
  in the separate other-vault dialog. Do not expose absolute-path targets in
  options or allow request/model overrides to escape the fixed vault. Apply the
  same selected-vault context to every action, including new-note creation.
- Fresh writing drafts default to Clipboard when launched, including new notes,
  append/prepend/replace, unique notes and daily capture. Daily Open remains a
  content-free action. Preserve explicit text/empty choices from presets and
  action drafts. URI writing content is never read from the clipboard at setup.
- In shortcut options, the outer icon radio group owns mode selection. Suppress
  the shared custom-image control's reset buttons there, leaving Choose image
  and Paste image. Standalone settings/tag/other-vault controls retain resets.
- Keep Windows `.url` shortcuts with optional icon-file/index fields. Convert images
  locally to multi-resolution ICO, preserving transparency and aspect ratio. Keep
  immutable, content-based icon copies outside the vault and plugin directory;
  disclose their device-local storage and retention after uninstall. Handle missing
  assets with an explanation and reselection or standard-icon creation. Do not
  automatically delete retained icons or alter existing shortcuts when defaults
  change. Keep image processing separate from typed creator contracts and shared
  writing helpers; validate imports/paths and preserve selection on cancellation.
  Verify actual Windows Desktop/Start menu icon display and launching as well as
  focused automated checks when implementing this feature.
  Write custom-icon `.url` files as UTF-16LE with a BOM so Windows preserves
  Unicode icon paths; retain existing encoding for standard-icon shortcuts.
- Custom icons are also approved for macOS and Linux in 1.0.0. Share the picker,
  preview and default/custom/standard choices across all desktop platforms.
  Keep Windows ICO behavior; normalize macOS/Linux images to transparent,
  aspect-preserving 512-pixel PNGs in native user data directories outside the
  vault/plugin. Linux `.desktop` links use an escaped absolute `Icon` path.
  macOS keeps `.url` contents and applies Finder metadata only to the newly
  created file via AppKit. Keep the minimal JXA bridge authored/type-checked in
  TypeScript, with paths as separate arguments to fixed `/usr/bin/osascript`, a
  bounded timeout and no shell, Finder UI automation or runtime installation.
  Preflight missing/invalid assets; if native metadata application fails after
  creation, keep the shortcut and identify its path in the error. Never silently
  claim the custom icon succeeded. Document retained assets, metadata-copy
  limitations and unverified native platform behavior accurately.
- Add a single **Create tag shortcut** file-menu item for tagged Markdown notes.
  Use the clicked note's cached inline/property tags, deduplicate case-insensitively
  and sort. Open a native modal with a bounded-height, scrollable tag list and an explicit
  Create shortcut button. Desktop is the default; offer a destination selector
  with Desktop/Start menu only on Windows. The Tag shortcuts toggle hides this
  item independently; destination toggles do not constrain the modal. Use public
  modal and listbox APIs rather than an undocumented submenu. Tag links use the core
  `obsidian://search` action with an encoded `tag:#name` query. Preserve nested
  tags in the URI and reuse the shared serializers and exclusive writer.
- The other-vault selection dialog's quick Create shortcut action is vault-only.
  More options supports the core action builder bound to that selected vault,
  including new-note creation. Discover known vault names with the
  official CLI (`vaults verbose`) automatically when the user opens the other-vault
  dialog. Show a selectable list and enable Create shortcut after selection or
  manual entry; do not require a separate discovery button. Parse tab-separated
  name/path rows and tolerate the observed startup/installer diagnostics without
  treating diagnostics as names. Close child stdin so older Windows hosts exit.
  Prefer the redirector beside the running Windows app, with its Obsidian.exe
  as the older-installer fallback; also resolve from absolute PATH entries.
  Use fixed arguments and
  bounded subprocess timeouts, and never read the internal vault registry or
  other vaults' notes. Keep manual name/ID entry available without the CLI.
  Distinguish missing CLI, timeout and invalid output. Missing-CLI guidance must
  explain Settings → General → Command line interface, PATH registration and
  restarting Obsidian; do not disable manual creation.
- Use UI label **Create shortcut** (sentence case) for the settings action, with
  the vault name shown. Use **Create desktop shortcut** for notes. This preserves
  the agreed flow while following Obsidian's UI conventions.
- Register event handlers with `registerEvent`; register DOM events/timers through
  lifecycle helpers if introduced. Enabling/disabling must not duplicate menu items
  or leave listeners behind. Avoid retaining views or detaching user workspace leaves.
- Use documented core `obsidian://` actions, percent-encoding parameter values separately. Keep
  full relative note paths. Filename sanitization must not change the URI target.
- Default to vault names for URI targets. Do not automatically retrieve IDs through
  undocumented `app.appId` or internal registry access; the lack of first-class
  public API support is the deciding constraint. Retain manual vault-ID entry.
  Obsidian calls its 16-character identifier a vault ID, rather than a standard
  UUID. For bound-file ID verification, use the existing hidden, bounded CLI runner
  with `vault=<id> vault info=path` and compare canonical filesystem paths. Never
  accept a different vault or silently fall back to name while ID mode is selected.
- Preserve existing files: exclusive creation, retry collisions with suffixes,
  bounded retries, and report errors. Do not execute created shortcuts automatically.
- Agent integration (1.1.0) installs equivalent vault skills for Copilot, Claude
  Code and Codex via explicit Enable or repair, Test connection and Remove
  actions. Use a private, single-use JSON handoff and Obsidian's URI protocol,
  with no dedicated socket or filesystem watcher. Bind requests to the vault
  and actual active plugin directory, and keep ownership device-local.
  Preserve edits and linked skills. Plugin startup only registers the handler.
  Obsidian Copilot is the primary use case. A terminal agent may open or
  foreground Obsidian when handing off a request.
  Use shared URI validation, icon handling and platform creators. Report
  discovery and execution verification separately for each client.
- Windows Send to installs two vault-specific Explorer `.lnk` entries only from
  Settings. Resolve the configured SendTo folder, stage requests locally using
  a fixed Windows Script Host bridge, and open the registered vault by its path.
  Consume requests from the bound vault and activate the receiving note after
  a successful import. Upgrade only the earlier generated launcher on repair.
  Keep the new-note folder configurable and use the documented CLI for Daily
  notes settings and creation. Never overwrite a note, attachment or changed
  menu entry. Keep generated launcher code small, reviewable and TypeScript-checked.
- Resolve the actual platform Desktop; do not silently write to a guessed directory.
  Treat Obsidian vault paths and native OS filesystem paths separately; do not run
  native Desktop paths through vault path normalization.
- No user-derived text in shell code. Use fixed executables/argument arrays for
  necessary system queries, with hidden Windows execution and bounded timeouts.
  Do not source shell configuration, elevate, or change URI associations/trust flags.
- Disclose Desktop and SendTo access and Windows subprocesses in README. Preserve
  no-overwrite behavior even when multiple actions run at once. Do not read notes
  to create shortcuts, delete shortcuts on unload, or create shortcut-tracking databases.
- Initial formats: Windows/Mac `.url`; Linux `.desktop` with `Type=Link` and `URL=`.
  Windows also supports a user-requested Start Menu destination: `.url` files in
  the current user's configured Programs folder. Keep Desktop the default and
  show Start Menu actions only on Windows. Do not pin automatically or use the
  all-users folder. Use the shared `.url` writer with the URI directly; do not
  restore the Explorer/WScript `.lnk` wrapper. Disclose Programs-folder access.
  Existing shortcuts are not migrated or deleted automatically.
- End users test platforms and file issues. A maintainer Mac/Linux environment is
  not a prerequisite for experimental releases. State actual verification honestly.

### DOM ownership and native controls

- Create interactive DOM elements through their owning container. Keep file
  inputs connected to that document and open them synchronously from the user
  action. Avoid global DOM factories for controls used in detached windows.
- Keep temporary image/canvas elements in the same owning document and remove
  them after success or failure.

### UI verification

- Use `npm run test:ui` for Windows real-host UI regressions and `npm run
  screenshots` for listing assets. Tests live in tests/e2e/, baselines in its
  __screenshots__ tree, listing assets under docs/images/listing/. Follow
  docs/UI-TESTING.md. Pin the host/version/theme and keep synthetic fixtures
  separate from personal profiles; never attach to Recipes for automation.
- The isolated harness may bootstrap only its own synthetic vault/profile
  metadata. Verify its vault/profile/version before actions. Block native process
  boundaries before plugin imports (including captured promisify functions), and
  stub clipboard access in each owning window. Test the guard with a real Create
  attempt; it must fail before native destination resolution or file creation.
  Close only the owned process, bound teardown and restrict cleanup to canonical
  workspace fixture paths. Keep failure diagnostics and review changed baselines.
- Listing captures reuse actual controls and fictional content. Inspect all
  generated images; keep curated listing assets separate from regression goldens.
  Generating them does not authorize publishing a listing or release.
- Regression tests must exercise the production control responsible for the
  behavior being tested. Mock external boundaries such as storage or OS queries,
  rather than replacing the control itself.
- For controls that launch native UI, verify the actual interaction in the
  available Obsidian host before declaring it working. For a file picker, verify
  that clicking opens the dialog and cancellation preserves the selection.
- When settings or modals support detached windows, include that window context
  in focused verification of new DOM interactions.
- Report automated coverage and live verification separately. Type checking,
  lint, mocked-host tests and native file-format tests do not establish that an
  Obsidian button works.

## Build and submission workflow

### Obsidian review rules

- For scorecard, submission or validation feedback, follow
  [the remediation workflow](docs/obsidian-warning-remediation.md). Start with
  supplied evidence, inspect every finding including Other and Disclosures, and
  compare its version/commit with local source. Record dispositions and validation
  in a dated report under docs/. This is not a gate for unrelated edits.
- Direct Filesystem Access and Shell Execution are required desktop capabilities:
  this plugin writes external shortcuts/icons and queries native directories or
  the official CLI. Preserve them and `isDesktopOnly: true`; do not hide imports,
  weaken scanning or remove functionality merely to remove capability warnings.
  Keep README disclosures accurate and process arguments separate from fixed code.
- Deprecated-method notices under Other are actionable even when informational.
  Use supported replacements and check their introduction versions. Keep the
  minimum at the lowest version required by used APIs and the tested release
  baseline; enforce compatibility with `obsidianmd/no-unsupported-api`. Runtime
  guards do not replace required minimum-version metadata updates.
- Settings use declarative definitions supported by the declared minimum. Keep
  indexing cheap and side effects in render/action callbacks. Keep general
  controls at the top without a redundant heading and use sentence case.
- Preserve native Modal titles, theme typography and semantic control APIs.
  Scope custom CSS to feature layout; do not restyle native control colors,
  fonts, padding or alignment. Display rules must respect `[hidden]`; avoid
  `!important` overrides and use explicit layout classes rather than `:has()`.
- Inspect dependency advisory ranges and paths (`npm explain <package>`), fix
  affected dependencies and update the lockfile. Externalizing a runtime API
  does not exempt its installed typings or transitive packages from audit review.
  Revisit overrides when upstream constraints change; never suppress findings.
- Keep production builds independent of Git metadata and generated local state.
  Review clean-source installation/build behavior when changing build tooling.
  Do not bypass required checks in source archives.

### README writing

README is consumer-facing copy for the Community plugin page. Use at most 30
prose sentences (bullets excluded), per the user's
November 15 revision. Keep bullets concise rather than using them to hide an
operating manual. Do not add a privacy-notice section or explain obvious
clipboard button behavior; retain practical destination and icon-storage details.
Lead with useful outcomes and examples, use plain language and concise paragraphs, and preserve
the author's voice. Let self-explanatory controls explain themselves; focus on
surprising behavior, practical platform limits and required privacy disclosures.
Verify suspected factual problems against implementation or authoritative sources.
Put detailed tutorials, architecture, testing, packaging and release workflows in
docs/, linking them when useful. Keep maintainer-only material out of README.

### Version discipline

- `manifest.json` owns the plugin version and minimum app version.
- `versions.json` maps each released/candidate plugin version to its minimum app
  version. Keep the current entry aligned with manifest changes.
- `package.json` and both root version entries in `package-lock.json` must match
  the plugin version. The release tag is the same x.y.z value, without a v prefix.
- Dependency versions, toolchain versions and pinned UI host versions are
  independent of the plugin version; do not conflate their updates.
- `package.json` engines.node defines the build-tool Node baseline. Its Moment
  and scoped minimatch overrides pin patched development dependencies; revisit
  their advisory ranges when upstream dependency constraints change.
- Check remote tags and GitHub releases before changing the candidate version.
  An untagged, unreleased candidate keeps its planned version for validation or
  dependency fixes. Local metadata and preparation commits are not publication.
  Corrections changing source/artifacts bound to a public tag or release require
  a new patch version. Never move, delete or rewrite public tags/releases to hide
  a correction. Retrying unchanged tag/artifacts keeps the same version.
- Add new version-bearing files/fields to this list in the same change.

See [Development and releases](docs/DEVELOPMENT.md) for commands and packaging.

Source: [Current official submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin).

The current submission route is the Community directory with linked Obsidian and
GitHub accounts; do not use an old registry-PR tutorial as the default workflow.
The default-branch manifest is used for submission. Publish a matching version tag
and attach `main.js`, `manifest.json`, and optional `styles.css` to the GitHub
release. Automatic source archives alone are insufficient. Automated review errors
must be corrected before the plugin is installable; feedback fixes require an
incremented release. Recheck the guide when actually submitting.

Workflows: checks.yml runs lint/tests/build on master pushes and pull requests.
release.yml builds an existing x.y.z tag, validates manifest/package/lockfile
versions, verifies nonempty main.js, manifest.json and styles.css, and generates
GitHub build-provenance attestations with actions/attest before attaching those
exact files. Attestation failure must stop publication. Limit contents/id-token/
attestations write permissions to the release job. Never commit the generated
bundle. Release reruns replace existing attachments; do not move tags.
Local builds do not generate GitHub attestations; verify downloaded release assets
with `gh attestation verify <asset> --repo vincentlaucsb/obsidian-vault-shortcuts`
after an authorized release workflow succeeds.
Linux CI skips native Windows tests; run them locally on Windows before releasing.

Local pre-release checklist:

1. Complete the agreed TypeScript implementation and accurate platform descriptions.
2. Run type checking, the official lint rules, focused tests and the production build.
   Fix errors and actionable warnings; inspect release output for development code.
3. Verify README, LICENSE, manifest fields, minimum API compatibility, version/tag
   alignment, dependency licenses and external-access disclosure. Ensure nested
   TypeScript sources/tests are included in checks after the architecture refactor.
4. Keep source/config/lockfile in Git. Keep generated `main.js` out of source commits
   and attach it to releases. Bundle dependencies needed at runtime; externalize
   Obsidian/host modules. No runtime package installation or downloads.
5. Package the actual assets, document experimental support and provide issue
   instructions when a real issue tracker exists. End-user testing does not replace
   required static review or honest descriptions.

Current commands: `npm run typecheck`, `npm run lint` (official recommended rules,
zero warnings required), `npm test` (TypeScript tests), and `npm run build`
(typecheck + bundle). Official lint is installed and has passed for the implementation.
A root MIT LICENSE has been added. Implementation targets stable Obsidian 1.15.0
for the full URI builder (verified from the official release feed on November 11,
2026). Existing tests do not establish live Obsidian launch behavior.

The objective is to prevent avoidable review findings, not promise first-pass
acceptance. This file does not authorize publishing a release or submitting the plugin.

# Vault Shortcuts contributor rules

Applies to all work in this repository. Read [PLAN.md](PLAN.md) for the agreed
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
  period; no emoji or introductory “This is a plugin” boilerplate.
- Do not prefix command IDs with the plugin ID. Remove template/sample code.
- Only use `fundingUrl` for financial-support links; omit it when unused.

### Manifest identity

Source: [Manifest reference](https://docs.obsidian.md/Reference/Manifest).

- Keep required fields valid and the version in `x.y.z` form.
- IDs contain lowercase letters/hyphens only, cannot contain `obsidian`, and cannot
  end in `plugin`. Match the local installation folder to the ID.
- Verify final name/ID uniqueness. Do not name the plugin after an Obsidian core
  feature or include “Obsidian”, its prohibited variations, or “Plugin” in its name.
- `Vault Shortcuts` / `vault-shortcuts` are working values, not proof of availability.
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
- Do not modify note contents for this feature. If future authorized scope needs
  editing, use Editor/Vault processing/frontmatter APIs and respect trash settings.

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
  `src/shortcuts/`. Keep tests and fixtures in `tests/`; keep documentation,
  manifest and tooling configuration at the repository root. Do not add runtime
  TypeScript files at the root. The build must still emit root `main.js` so release
  assets and the Truck vault's existing file symlinks continue to work.
- Implement `IShortcutCreator`, public `ShortcutCreator` factory/facade, and one
  concrete creator per OS. Resolve the OS once and delegate both creation methods.
- Share URI encoding, filename handling, serializers and exclusive-write helpers.
  Keep UI/notices in the Obsidian layer; OS creators resolve paths and create files.
- Persist independent Desktop and Windows Start Menu context-menu toggles with
  loadData/saveData. Default both to enabled, validate stored booleans, and apply
  changes to file menus only. Do not register editor-menu shortcut actions. These toggles must not disable commands
  or settings-page creation actions.
- File-menu actions support every TFile, including JPG/CSV attachments, while
  excluding folders. Preserve full file extensions in URI targets. Keep the
  existing createNoteShortcut interface for compatibility; it accepts file paths.
- Vault action: plugin settings button. Note action: note context menu, using the
  clicked file, not the active note. Retain existing commands as secondary access.
- Other-vault shortcuts are vault-only. Discover known vault names with the
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
- Use core `obsidian://open`, percent-encoding parameter values separately. Keep
  full relative note paths. Filename sanitization must not change the URI target.
- Default to vault names for URI targets. Do not automatically retrieve IDs through
  undocumented `app.appId` or internal registry access; the lack of first-class
  public API support is the deciding constraint. Retain manual vault-ID entry.
- Preserve existing files: exclusive creation, retry collisions with suffixes,
  bounded retries, and report errors. Do not execute created shortcuts automatically.
- Resolve the actual platform Desktop; do not silently write to a guessed directory.
  Treat Obsidian vault paths and native OS filesystem paths separately; do not run
  native Desktop paths through vault path normalization.
- No user-derived text in shell code. Use fixed executables/argument arrays for
  necessary system queries, with hidden Windows execution and bounded timeouts.
  Do not source shell configuration, elevate, or change URI associations/trust flags.
- Disclose Desktop access and the Windows discovery subprocess in README. Preserve
  no-overwrite behavior even when multiple actions run at once. Do not read note
  contents, delete shortcuts on unload, or create shortcut-tracking databases.
- Initial formats: Windows/Mac `.url`; Linux `.desktop` with `Type=Link` and `URL=`.
  Windows also supports a user-requested Start Menu destination: `.url` files in
  the current user's configured Programs folder. Keep Desktop the default and
  show Start Menu actions only on Windows. Do not pin automatically or use the
  all-users folder. Use the shared `.url` writer with the URI directly; do not
  restore the Explorer/WScript `.lnk` wrapper. Disclose Programs-folder access.
  Existing shortcuts are not migrated or deleted automatically.
- End users test platforms and file issues. A maintainer Mac/Linux environment is
  not a prerequisite for experimental releases. State actual verification honestly.

## Build and submission workflow

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
versions, and attaches main.js, manifest.json and styles.css. Never commit the
generated bundle. Release reruns replace existing attachments; do not move tags.
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
A root MIT LICENSE has been added. Implementation targets stable Obsidian 1.13.7
(verified from the official release feed on September 13, 2026), replacing the
spike's provisional minimum. Existing tests do not establish live Obsidian launch behavior.

The objective is to prevent avoidable review findings, not promise first-pass
acceptance. This file does not authorize publishing a release or submitting the plugin.

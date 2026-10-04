# Vault Shortcuts

Create Desktop shortcuts to an Obsidian vault, file or tag search.

Windows also supports Start Menu shortcuts.

## Usage

- **Vault:** open Settings, select **Vault Shortcuts** in the Community plugins
  section, and click **Create shortcut**.
- **File:** right-click a vault file (including Markdown, JPG or CSV) and select **Create desktop shortcut**.
  The shortcut targets the clicked file in the file menu, even when another
  note is open.
- **Windows Start Menu:** click **Create start menu shortcut** in plugin settings
  for this vault, or select that action from a note's context menu. It creates a
  `.url` in your configured Start Menu Programs folder. Windows controls when it
  appears in All apps/search; pinning to Start is a separate manual Windows action.
- **Command palette:** use **Create shortcut to this vault** or **Create shortcut
  to current note** as alternatives. No default hotkeys are assigned.
- **Tags:** right-click a tagged Markdown note and select **Create tag shortcut**.
  Select one of that note's inline/property tags from the scrollable list in the modal, choose
  Desktop or Start menu on Windows, then click **Create shortcut**. Other platforms
  use Desktop. Opening the shortcut searches this vault for the tag, including
  nested tags according to Obsidian's normal search behavior; results update as
  notes change. The action is hidden for notes without cached tags.
- **Other vaults:** click **Create shortcut to another vault** in plugin settings.
  Known vaults load automatically into a selectable list. Select a vault, then
  click **Create shortcut**. Manual name/ID entry remains available. On Windows,
  you can also choose Start menu as the destination.
  Only this vault needs the plugin installed. This action never reads other notes.

Discovery uses the [official Obsidian CLI](https://obsidian.md/help/cli). Enable it
under **Settings → General → Command line interface**, follow the prompt to
register it on **PATH**, and restart Obsidian so it sees the updated PATH. The CLI
requires installer 1.12.7+; updating only the app may not update its installer.
If discovery fails or returns nothing, the dialog explains the setup and still
allows manual entry. Manual names must match a vault already known to Obsidian;
they are not validated by opening another vault. Duplicate names remain ambiguous,
so enter a vault ID when needed.

Files go to the system Desktop or the explicitly selected Windows Start Menu.
Existing files are preserved; duplicates receive
` (2)`, ` (3)`, etc. A notice shows the created path or explains a failure. The
plugin does not launch the shortcut automatically. Double-click it to open the
vault, file or tag search in Obsidian.

## Context menu options

In plugin settings, **Context menu options** provides separate **Desktop shortcuts**
and **Start menu shortcuts** toggles, plus an independent **Tag shortcuts** toggle.
All default to enabled; Start menu is shown
only on Windows. Changes apply to newly opened file menus and persist
in this vault. Settings-page actions and command-palette commands remain available.
The Desktop and Start menu toggles hide their file actions; they do not restrict
destinations in the tag shortcut modal.

## Platforms

Requires **Obsidian desktop 1.13.7 or newer**. Mobile is not supported.

| Platform | Shortcut | Desktop discovery |
| --- | --- | --- |
| Windows | `.url` | Windows configured Desktop, including normal Known Folder redirection |
| macOS (experimental) | `.url` | Native Desktop folder lookup |
| Linux (experimental) | `.desktop` link | XDG Desktop lookup |

Mac `.url` shortcuts into Obsidian have been [reported working by a Mac user](https://forum.obsidian.md/t/mac-win-desktop-file-system-deeplinks-bookmarks-shortcuts-into-obsidian/25360).
Linux support depends on the desktop environment: users may need to allow launching,
and some environments do not display Desktop icons. This plugin does not change
launcher trust settings or protocol registrations.

The plan is **end-user testing and issue reports**. Automated checks do not establish
that a live Obsidian command or Desktop double-click works on every platform.
Mac/Linux behavior has not been tested on those operating systems in this workspace.

## Build and install

Use Node 22 or newer for development. Install the locked dependencies, then run:

```text
npm ci --ignore-scripts
npm run lint
npm run build
npm test
```

Copy `main.js`, `manifest.json` and `styles.css` to the `vault-shortcuts` folder in your vault's
configured plugins directory (normally `<vault>/.obsidian/plugins/vault-shortcuts/`).
Reload Obsidian and enable **Vault Shortcuts** in Community plugins. The stylesheet
sizes the vault list. The compiled JavaScript includes the plugin's runtime helpers.

No release or directory submission has been published as part of this implementation.
Use a test vault when trying a development build.

## Privacy and external file access

This plugin writes files **outside your vault, on your Desktop**, only when you
invoke a creation action. It queries the system for that directory and uses Node
filesystem APIs to create the shortcut. The Windows lookup invokes a hidden,
noninteractive Windows PowerShell process; Mac/Linux use their system directory
lookup commands. These use fixed code/arguments, never vault or note text as shell
code, and have bounded execution time.

The Windows Start Menu action writes to your current user's Programs folder
(usually `%APPDATA%\Microsoft\Windows\Start Menu\Programs`). PowerShell resolves
the configured Programs folder; the shared writer creates a `.url` containing the
Obsidian URI directly. No Explorer wrapper or temporary link generation is needed.
It does not change Start pins or write to the all-users Start Menu.

Version 0.0.2 uses `.url` for both Windows destinations, following successful
user testing of Start Menu pinning. Existing `.lnk` shortcuts remain untouched;
recreate them if you want the new format.

Opening **Create shortcut to another vault** invokes the CLI with fixed `vaults verbose` arguments and parses
name/path rows, ignoring recognized startup messages. On Windows it first checks
beside the running app for `Obsidian.com`, then supports older `Obsidian.exe`
installers; it also checks PATH. Child input is closed explicitly so discovery
does not require pressing Enter. The call has a ten-second timeout, with distinct
messages for missing CLI, timeout and unexpected output.
It does not read Obsidian's internal registry, open other notes, or save
the discovered list. Discovery runs when this dialog opens; manual entry remains
available while it loads or if it fails.

Tag selection uses Obsidian's metadata cache without reading note contents.
The plugin does not read note contents, edit notes, overwrite existing shortcuts,
make network requests, collect telemetry, or install/update anything. It does not
require accounts or payment. System Desktop synchronization services may sync the
created files; their names and URIs contain vault/note names, paths or tags.

Disabling or uninstalling the plugin leaves created shortcuts in place. They use
Obsidian's built-in URI handler and do not require this plugin to remain enabled.

## Limitations and troubleshooting

File shortcuts preserve the complete extension and use Obsidian’s URI handler.
How a file opens depends on Obsidian and any installed file-viewer plugins;
creating a CSV shortcut does not add CSV viewing support. Folders are excluded.

- Obsidian must be installed with a working `obsidian://` association. If the file
  was created but does not open Obsidian, report a launch/association issue rather
  than a file-creation failure.
- Vault names must identify the intended registered vault. Duplicate vault names
  are ambiguous. Renaming a vault or moving/renaming a note can break a shortcut;
  recreate it afterward. Shortcuts are not tracked or automatically repaired.
- Note paths containing `#` are rejected because Obsidian interprets that character
  as a heading separator after decoding. No folder, heading or batch shortcuts.
- Tag shortcuts require the core Search plugin to be enabled. Renaming a tag
  does not update an existing shortcut; recreate it with the new tag.
- Unavailable, disabled or unwritable Desktop folders produce an error; the plugin
  does not elevate permissions or create a replacement Desktop. System directory
  utilities must be installed and permitted.
- Very long paths, disconnected redirected folders and filesystem failures are
  reported. Names are shortened and sanitized only for the shortcut file; the URI
  preserves the actual note path.
- A disk failure during writing can leave an incomplete new shortcut. Remove that
  file manually before retrying if needed.

For an issue report, include OS/Obsidian/plugin versions, which action you used,
the error notice, whether creation or launching failed, whether Obsidian was
already running, and whether Desktop is redirected/synced. Include the default
browser if it affects URI routing. Redact private names and paths from examples.
A real issue-tracker link will be added when the repository is published.

## Development

Read [AGENTS.md](AGENTS.md) for strict TypeScript and official Obsidian review rules,
and [PLAN.md](PLAN.md) for decisions and the creator interface. The runtime uses
`IShortcutCreator`, a public `ShortcutCreator` factory/facade and one creator per OS.
URI construction and safe file creation are shared.

Implementation lives in `src/`, with entry point `src/main.ts` and creators/helpers
in `src/shortcuts/`. Tests and fixtures live in `tests/`. Build configuration and
the generated `main.js` remain at the repository root, preserving installed symlinks.

## Releases

GitHub Actions runs lint, tests and the build for pushes to master and pull requests.
To release, update the version in manifest.json, package.json and package-lock.json
(including its root package entry), commit the changes, and push a matching tag
such as 0.0.3, without a v prefix. Push the version commit to master as well, so the
Community directory sees the correct manifest on the default branch.

The Release workflow builds that tag and attaches main.js, manifest.json and
styles.css to a GitHub release after all checks pass. Generated main.js stays out
of source control. The workflow can also be run manually against an existing tag;
a rerun replaces same-named release attachments. Do not move published tags; use
a new version for changes. Linux CI skips the two native Windows integration tests;
run npm test on Windows before a release to exercise those as well.

## License

[MIT](LICENSE). This is an independent community plugin, not an official Obsidian product.

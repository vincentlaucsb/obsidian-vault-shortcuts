# Vault Shortcuts

Create Desktop shortcuts to an Obsidian vault, file or tag search.

Windows also supports Start Menu shortcuts.

## URI shortcuts (1.0.0)

Choose **Create shortcut with options…** in plugin settings or a file's context
menu. The dialog shows a live, read-only URI preview with **Copy URI**, an editable
shortcut filename, destination, and icon controls in the **General** tab.
The **Advanced** tab contains the action, target and URI behavior controls. The
preview and Copy stay fixed above both tabs, and switching tabs preserves edits.
The filename does not
change the target. Creating a shortcut never launches it.

The notebook dialog supports opening vaults/files (including headings or blocks),
creating notes, appending/prepending/replacing note contents, daily notes, unique
notes, searches, the vault manager, and the advanced Hook address action. Each
action reveals its relevant controls. Daily notes and unique notes require their
corresponding core plugins in the target vault. Advanced callback fields follow
Obsidian's own callback permission; the plugin does not enable it.

A dialog opened from a Markdown file fixes its vault and file and offers Open,
Append, Prepend and Replace. An attachment offers Open only. Unrelated actions and
target changes cannot escape these constraints. Heading/block suggestions use
cached metadata; no note contents are read. **More options…** in tag and other-vault
dialogs opens the builder with that search or vault already selected.

Right-click a folder and choose **Create folder shortcut…** to create a note
directly inside it when the shortcut launches. Advanced defaults to **Create a
note** with **Clipboard when launched**. Leave **Note name (optional)** blank for
a fresh `Untitled.md`, `Untitled 1.md`, etc. on each launch, or supply a name with
`.md` or no extension. Obsidian allocates the name when launched; existing notes
are preserved. The vault and clicked folder stay fixed. **Search this folder** instead
opens core Search for that exact folder and its subfolders (case-sensitive), subject to Search exclusions;
it does not expand the folder in the file explorer. Existing Desktop/Start menu
context-menu toggles control visibility, and root-folder shortcuts work too.

The vault in the options dialog is read-only: plugin settings use the current
vault, while **More options…** from the other-vault dialog uses the vault selected
there. Select a different vault in that separate dialog before opening options.
Every action, including creating a note, stays in that selected vault. Absolute
file paths are unavailable in options because they could override the fixed vault.

For a clicked file, **Identify vault by** in Advanced defaults to **Vault name**.
Names are readable and portable when devices use the same name; renames break
links and duplicate names can be ambiguous. **Vault ID** addresses one registered
vault folder on this computer. Treat IDs as device-local: synced copies, moves
or re-registration may have different identifiers. Obsidian uses a 16-character
vault ID, rather than a standard UUID. See the [official URI reference](https://obsidian.md/help/uri).

To use ID mode, open the vault switcher, right-click the current vault, choose
**Copy vault ID**, paste it and click **Verify ID**. Verification uses the official
CLI to confirm that the ID resolves to this vault's folder. Creation stays disabled
until verification succeeds; switching to name remains available without the CLI.
The clicked file stays fixed in both modes. No internal vault registry is read.

Fresh writing actions default to **Clipboard when launched**, including Create,
Append, Prepend, Replace, unique notes and daily capture. Daily **Open today’s note**
does not capture content. Explicit choices are retained when switching actions or
opening a preset; creation also offers **No initial content**.
Content can be literal text or **Clipboard when launched**. Literal text is stored
in the shortcut file, so do not embed sensitive text in shortcuts you share. The
clipboard payload for a writing action is not read during shortcut creation.
The separate **Paste image** button reads an image only when clicked. Launching a writing shortcut can
modify a note each time; Replace explicitly replaces its contents. Use an isolated
test vault when trying writing actions. Callback destinations can receive note
information and open another app when the shortcut is launched.

Existing quick creation actions remain available. File targets use vault-relative
paths; shortcut names remain independent of those paths.

See the [design specification and preview images](docs/URI-DESIGN.md) and
[project plan](docs/PLAN.md).

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
The Desktop and Start menu toggles hide their file actions. The options action is
shown when either destination action is enabled; these toggles do not restrict
destinations inside shortcut dialogs.

## Custom icons

In plugin settings, **Default shortcut icon** lets you choose a PNG, JPG/JPEG or
ICO image for new shortcuts in this vault. A preview shows the selected image.
Existing quick creation actions use that default immediately; changing it does
not update existing shortcuts. Recreate a shortcut to change its icon.

**Paste image**, beside **Choose image…**, captures an image from the clipboard
when clicked and imports it through the same preview, conversion and local storage
pipeline. The resulting icon stays fixed when the clipboard changes. An empty,
unsupported or inaccessible clipboard leaves the current selection unchanged and
shows an explanation. Clipboard text, HTML, image URLs and copied file paths are
not imported as images; copy the image itself or choose an image file instead.
Image clipboard access depends on the host's Clipboard API and permissions.

For a vault, choose **Create shortcut with options…** in plugin settings. For a
file, choose that action in its context menu. The dialog lets you override the
icon and choose Desktop (plus Start menu on Windows). Its radio choices select
**Vault default**, **Custom image**, or **Obsidian icon**. The custom-image area
contains **Choose image…** and **Paste image**; change icon modes with the radios.
Standalone controls in settings and the tag/other-vault dialogs keep their reset
buttons: **Use default** restores the current vault default, and **Use Obsidian
icon** selects the standard icon even when the vault has a custom default.
Other-vault shortcuts start with the Obsidian icon and allow a custom image without
inheriting this vault's default. Canceling the image picker keeps the selection.

Windows images are converted locally to ICO with 16, 32, 48 and 256 pixel versions.
macOS and Linux use a 512-pixel PNG. Both preserve transparency and fit rectangular
images without stretching.
Imports are limited to 20 MB; PNG/JPEG images must have at most 40 million pixels.
If an icon is missing on this computer, choose the image again or select **Use
Obsidian icon** in the options dialog. Settings can sync between computers, but
the imported icon files are local to each user account and platform. Reselect the
image on another computer or OS; Windows ICO paths are not reused as native PNGs.

Custom icons affect newly created shortcuts on all three desktop platforms:

- Windows uses the `.url` icon fields. Windows controls caching and Start menu presentation.
- Linux uses an absolute PNG path in the `.desktop` link's `Icon` field, following
  the [Desktop Entry specification](https://specifications.freedesktop.org/desktop-entry/latest/recognized-keys.html).
  Icon display and launch support depend on the desktop environment.
- macOS attaches a Finder file icon to the new `.url` using Apple's
  [native file-icon API](https://developer.apple.com/documentation/appkit/nsworkspace/seticon(_:forfile:options:)).
  If applying it fails, the error identifies the already-created shortcut, which
  is kept. Copying it through tools/filesystems that discard Finder metadata can
  lose the custom icon.

macOS/Linux support is experimental: image conversion, output and bridge behavior
have automated coverage, but native appearance/launching have not been verified
on those systems. Actual Windows display should also be checked on the testing computer.

## Platforms

Requires **Obsidian desktop 1.15.0 or newer**. Mobile is not supported.

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

The shared **Paste image** control reads clipboard image data only after an
explicit click, through that control's owning window. It does not poll the
clipboard, read text/HTML payloads, fetch clipboard URLs or write to the clipboard.
Imported image assets follow the same storage and retention rules as chosen files.

This plugin writes files **outside your vault, on your Desktop**, only when you
invoke a creation action. It queries the system for that directory and uses Node
filesystem APIs to create the shortcut. The Windows lookup invokes a hidden,
noninteractive Windows PowerShell process; Mac/Linux use their system directory
lookup commands. These use fixed code/arguments, never vault or note text as shell
code, and have bounded execution time.

Explicit **Verify ID** runs the documented Obsidian CLI command
`vault=<id> vault info=path` with separate arguments and a 10-second timeout, then
compares canonical vault-folder paths. It reads vault identity metadata only,
without reading notes or using the clipboard. The entered ID is validated before
launching the command. Name mode does not run this verification process.

The Windows Start Menu action writes to your current user's Programs folder
(usually `%APPDATA%\Microsoft\Windows\Start Menu\Programs`). PowerShell resolves
the configured Programs folder; the shared writer creates a `.url` containing the
Obsidian URI directly. No Explorer wrapper or temporary link generation is needed.
It does not change Start pins or write to the all-users Start Menu.

Choosing an image reads that selected file and stores a durable, content-based
copy outside the vault and plugin installation:

- Windows: `%LOCALAPPDATA%\VaultShortcuts\Icons\<content-hash>.ico`.
- macOS: `~/Library/Application Support/VaultShortcuts/Icons/<content-hash>.png`.
- Linux: `$XDG_DATA_HOME/vault-shortcuts/icons/<content-hash>.png`, defaulting to
  `~/.local/share/vault-shortcuts/icons/` when the variable is unset or invalid.

Identical imported icons reuse the same asset; different images receive immutable
filenames. Windows/Linux shortcuts reference the local copy; macOS applies the
image as Finder file metadata. Moving or deleting the original image, disabling
the plugin or uninstalling it leaves those icons available. Assets are deliberately
retained after uninstall because shortcuts or saved selections may reference them.
Deleting these assets breaks Windows/Linux icon references and makes saved icon
selections unavailable. Finder icons already applied on macOS are file metadata.
Preview and shortcut creation also read the selected local image. No online image
conversion, account or network service is used.

On macOS, custom-icon creation invokes `/usr/bin/osascript` with fixed,
TypeScript-checked JavaScript for Automation code to call AppKit's file-icon API.
Paths are passed as separate arguments, with a ten-second timeout and no shell,
Finder UI automation, elevation, runtime installation or shortcut launching.

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
Report problems in the [issue tracker](https://github.com/vincentlaucsb/obsidian-vault-shortcuts/issues).

## Development

Read [AGENTS.md](AGENTS.md) for strict TypeScript and official Obsidian review rules,
and [docs/PLAN.md](docs/PLAN.md) for decisions and the creator interface. The runtime uses
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

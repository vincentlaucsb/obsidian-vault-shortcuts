# Vault Shortcuts — product and implementation plan

Updated September 13, 2026. This is the consolidated plan for the feasibility
discussion, product scope, platform findings, existing proof of concept, and next
steps. The user has now authorized implementation by a subagent, a parent code
review, and a separate subagent review, iterating on high-priority findings until
none remain. Publishing/submitting the plugin is still outside this task.

Implementation must follow [AGENTS.md](AGENTS.md): TypeScript with strict typing,
no `any` unless unavoidable and justified, the linked official Obsidian policies,
and the official type-aware lint checks before submission. User-facing button
labels will use sentence case (**Create shortcut**), preserving the agreed flow.

## Problem and decisions

**Vault identity:** keep vault names as the default URI target. Device-specific
IDs are acceptable for local shortcuts, but automatic ID retrieval lacks
first-class public API support, so do not build around undocumented `app.appId`
or internal registry access. Retain manual ID entry for other-vault shortcuts,
including when duplicate names need disambiguation.

**Other-vault convenience:** add a settings action opening a small dialog with
manual vault-name/ID entry always available, automatic CLI discovery on dialog open, and a
destination choice (Desktop, plus Start Menu on Windows). Only vault shortcuts
are supported for other vaults. Run documented `vaults verbose` and validate
tab-separated name/path rows, ignoring observed startup diagnostics. Use names
for the URI. Support the running Windows app's redirector or older executable
as well as absolute PATH entries. Close stdin to avoid waiting for Enter.
Use fixed arguments and bounded timeouts. On missing,
disabled, timed-out or unexpected CLI responses, retain manual entry and explain
Settings → General → Command line interface, registration on PATH, installer
1.12.7+, and restarting Obsidian. No registry reading, other-note access or
persistent discovered-vault settings. Duplicate vault names require manual IDs.

The dialog shows a selectable vault list instead of a discovery button and dropdown.
Select a vault, then use the single Create shortcut action. Manual entry clears
the list selection. Discovery never creates shortcuts automatically, and closing
the dialog ignores late results. A scoped stylesheet sizes the native listbox.

Discovery repair was live-verified against the user's installed Obsidian.exe:
seven vaults returned in 682 ms without keyboard input, despite startup and
outdated-installer messages. Tests cover EOF-driven exit, timeout, mixed output
and manual fallback; all 14 tests, lint and build passed.

**Start Menu addition:** after verifying the existing plugin works, the user
requested a Windows Start Menu destination. Add an explicit vault settings button
and clicked-note menu action while retaining Desktop defaults. Use a `.lnk` in
the current user's configured Programs folder, resolved through Windows rather
than a guessed AppData path. The link launches Explorer with the encoded URI.
Keep pinning manual. No persistent destination preference or new dependencies.
Generate with fixed PowerShell/WScript code in temporary storage and publish with
the shared exclusive-write helper. Mac/Linux remain Desktop-only.

[Microsoft's Start Menu guidance](https://learn.microsoft.com/en-us/windows/win32/shell/how-to-add-shortcuts-to-the-start-menu)
specifies a shell link in the known Programs folder. Tests inspect actual Windows
link contents and collision preservation in temporary folders; appearance and
launching from Start remain end-user validation.

Obsidian supports vault/note URIs, but creating an OS-level shortcut remains a
manual task for the user. The proposed utility turns the current vault or note
into a Desktop file from vault settings or a note's context menu, without requiring
a script or URI knowledge. Commands remain convenient secondary entry points.

Example targets:

```text
obsidian://open?vault=<encoded vault name>
obsidian://open?vault=<encoded vault name>&file=<encoded relative note path>
```

- Keep the plugin tiny, desktop-only, and offline.
- Implement Windows, macOS and Linux creators; Windows was the initial spike.
- **macOS shortcuts are possible and have been tried by Obsidian users. Keep
  macOS in scope, initially experimental.** The new evidence makes
  `.url` the first Mac candidate, superseding the earlier `.webloc`-first suggestion.
- Retain Linux under consideration using `.desktop` with `Type=Link` and `URL=`.
  Desktop-environment differences are handled through end-user testing and issues,
  not by excluding Linux. Implement its creator as experimental.
- Implement the agreed small utility, including all three OS creators. Keep the
  original research below as rationale; initial-spike status is historical.

**Validation decision from the user:** end users will test the plugin and file
issues. Do not block implementation or an experimental release on acquiring a Mac
or completing a maintainer-run OS/browser test matrix. Keep compile/build and
focused automated checks; clearly label unverified platform support and use real
issue reports to guide fixes. This supersedes the earlier suggestion to complete
manual platform testing before releasing.

The user's decision rule was to remove macOS if shortcuts were impossible or if
research could find no evidence that Obsidian Mac users had ever created them.
The evidence below answers yes, so that exclusion condition is not met.

## Recommended first release

Primary user flow:

**Settings → Community plugins section → Vault Shortcuts → Create Shortcut**

The plugin settings page exposes one clearly labelled **Create Shortcut** button
for **this vault**, with the vault name displayed. Clicking it creates the vault
shortcut immediately; no vault/note chooser is needed.

For a note: **right-click the note → Create desktop shortcut**. Use the file from
that context menu, even if it is not the currently open note. Start with the file
explorer's single-note context menu; add the same action to an editor context menu
where the target note is unambiguous. Exclude folders and multi-file selection
from this MVP. Both paths write to the system Desktop and show a notice.
The first implementation uses Windows `.url` files. Keep these existing commands
as secondary entry points into the same creation logic:

- **Create shortcut to this vault**
- **Create shortcut to current note**

Use the core `obsidian://open` action, percent-encode each parameter separately,
sanitize the display filename, append numbered suffixes on collisions, and show
a notice containing the resulting path or an actionable error. Start with Markdown
notes only. The settings page is an action surface, not a panel of configuration
options. No automatic hotkeys, ribbon icon, folder command, or custom URI handler
are needed. Created shortcuts keep working after this plugin is disabled.

The original recommendation was Windows-only first; the authorized implementation
now includes all three OS creators with experimental Mac/Linux support. The initial
estimate was approximately 150–250 runtime TypeScript
lines for a small release; this spike uses about 130 physical lines. Build metadata,
tests and documentation are additional. As a rough engineering estimate, a working
spike takes hours and a Windows release a few focused days. The earlier estimate
for cross-platform support included several days of maintainer OS verification;
the chosen plan instead delegates that validation to users, with follow-up effort
driven by reported issues. Directory
submission/review time is separate and cannot be predicted here.

## Obsidian APIs and external writes

Desktop plugins can use Node `fs`, `path`, `os`, and related APIs. Obsidian requires
`isDesktopOnly: true` when using Node/Electron APIs. Its Vault API is for vault data;
use Node filesystem operations for the Desktop. Avoid synchronous filesystem and
process calls on the UI thread. [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins),
[Vault API guidance](https://docs.obsidian.md/Plugins/Vault).

| Need | API / recommendation |
| --- | --- |
| Current vault name | `this.app.vault.getName()` |
| File/path | `this.app.workspace.getActiveFile()` returns `TFile \| null`; `file.path` is vault-relative; retain the extension |
| Strictly current Markdown note | `getActiveViewOfType(MarkdownView)?.file`; avoids `getActiveFile()` returning the most recently active file when another view is active |
| Platform | `Platform.isWin`, `Platform.isMacOS`, `Platform.isLinux`, `Platform.isDesktopApp` |
| Home | Node `os.homedir()`; a home path is not a Desktop path |
| Absolute vault path, if eventually needed | Guard `vault.adapter instanceof FileSystemAdapter`, then use `getBasePath()`; unnecessary for this MVP |

These are public APIs; no private `app.vault` fields or undocumented vault IDs are
needed. [Obsidian type definitions](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts),
[Node home-directory API](https://nodejs.org/api/os.html#oshomedir).

External file access is not categorically prohibited. Obsidian's developer policies
require the README to explain access outside vaults. This plugin should disclose
Desktop writes and its fixed Windows path-discovery subprocess. Clicking the
creation action is the deliberate user action; I found no published requirement for a confirmation
modal on every write. Use a license, transparent source, and an accurate manifest;
do not download executable dependencies at runtime. This is a policy assessment,
not a guarantee of acceptance. [Developer policies](https://docs.obsidian.md/community-directory/developer-policies).

### Finding the Desktop

Electron exposes `app.getPath('desktop')`, but `app` is a **main-process** API.
An Obsidian plugin runs in the renderer; simply importing `app` does not make this
work. Do not assume deprecated `electron.remote` or an enabled `@electron/remote`
bridge. A host-specific bridge would need runtime verification and increases
maintenance. [Electron app API](https://www.electronjs.org/docs/latest/api/app).

For Windows, the spike invokes the system Windows PowerShell executable using
`execFile`, `windowsHide: true`, a timeout, and fixed arguments. A constant script
calls `.NET Environment.GetFolderPath(DesktopDirectory)`. This uses the configured
physical Desktop instead of assuming `%USERPROFILE%\Desktop`, and accommodates
normal Known Folder redirection such as OneDrive. Require an existing absolute
directory; report unavailable/network/offline/permission errors without silently
creating another Desktop. No note-derived text enters PowerShell.
[Microsoft special folders](https://learn.microsoft.com/en-us/dotnet/api/system.environment.specialfolder).

On macOS, prefer a native Desktop-directory lookup through a verified host bridge;
`os.homedir()/Desktop` can be an explicitly checked conventional fallback, not a
cross-platform guarantee. Access can trigger macOS privacy controls; report denial.
On Linux, resolve XDG user directories (for example fixed `xdg-user-dir DESKTOP`
arguments) and account for disabled Desktop directories. Do not source an arbitrary
shell configuration file as executable code. [XDG user directories](https://wiki.freedesktop.org/www/Software/xdg-user-dirs/).

## Shortcut formats

| OS | Recommendation | Limitations |
| --- | --- | --- |
| Windows | `.url` for v1 | Requires a working `obsidian://` association; icons and indexing by external launchers vary |
| macOS | `.url` first; `.inetloc` as a fallback candidate | Direct Obsidian Mac user report exists; offer implemented support as experimental and collect user issues |
| Linux | `.desktop`, initially test `Type=Link` with `URL=` | Support, Desktop visibility, executable/trust requirements and custom-scheme association vary across environments |

### Windows: `.url` versus `.lnk`

The minimal Internet Shortcut is an INI-like text file:

```ini
[InternetShortcut]
URL=obsidian://open?vault=Work%20Notes&file=Projects%2FPlan.md
```

Use CRLF line endings. Do not quote the URL value or HTML-escape its `&` separator.
With the normal Windows protocol association, this is the appropriate minimal
format for launching the URI. Host restrictions or broken associations can still
prevent launching. A file being written successfully does not verify the handler.
[Microsoft Internet Shortcuts](https://learn.microsoft.com/en-us/windows/win32/lwef/internet-shortcuts),
[Obsidian URI reference](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI).

A `.lnk` adds executable target/arguments, working directory, icon information,
description and AppUserModelID metadata. It may integrate better with some program
launchers, but taskbar pinning/grouping is not automatically solved. `.url` can also
carry icon metadata, so a custom icon alone does not require `.lnk`.
[Electron ShortcutDetails](https://www.electronjs.org/docs/latest/api/structures/shortcut-details),
[URL File Preview format documentation](https://github.com/turingexmachina/obsidian-url-file-preview).

Creating `.lnk` without an extra native npm dependency is practical: Electron has
Windows `shell.writeShortcutLink()`, available in non-sandboxed renderers, returning
a success boolean. Its actual availability must be checked in supported Obsidian
versions. It overwrites existing paths, so the collision strategy needs care.
Windows Script Host COM through PowerShell is another option, with greater
complexity. Avoid pure binary `.lnk` serialization. A shortcut targeting the actual
Obsidian executable requires locating that installation, quoting URI arguments,
and verifying its launch behavior; never assume the URI is an executable target.
[Electron shell API](https://www.electronjs.org/docs/latest/api/shell).

### macOS

**Finding: yes, Desktop/Finder shortcuts into Obsidian are possible on macOS.**
This is supported by firsthand reports and published workflows, not merely an
inference from Apple's ability to open custom URLs. This Windows environment
cannot supply a fresh Mac double-click test; that does not erase the existing
evidence of feasibility.

#### What “custom-scheme launch behavior” meant

`obsidian://` is a custom URL scheme: a link intended for Obsidian, rather than an
ordinary `https://` web page. The desired interaction is:

```text
Double-click Desktop file → macOS dispatches its URI → Obsidian opens vault/note
```

Our earlier uncertainty concerned whether a particular file format and its default
handler would complete that sequence, possibly via a browser. It did not establish
that Mac shortcuts were impossible. The following research narrows that uncertainty.

#### Evidence and what it establishes

| Source | Finding | Evidence limits |
| --- | --- | --- |
| [Boris Anthony, Obsidian Forum, October 8, 2021](https://forum.obsidian.md/t/mac-win-desktop-file-system-deeplinks-bookmarks-shortcuts-into-obsidian/25360) | A self-identified Mac user describes an `[InternetShortcut]` text file containing an Obsidian URI, saved as `.url`, and reports that double-clicking launches the URI. | Directly relevant firsthand report; no current macOS version matrix. |
| [Same author's reply in a vault-shortcut discussion](https://forum.obsidian.md/t/can-i-create-a-desktop-shortcut-to-a-specific-obsidian-vault/11734/4) | Explicitly confirms the technique for Mac and Windows. | Corroborates intent; it is the same person, not an independent test. |
| [Just Note project documentation](https://github.com/rajalokan/obsidian-just-note-plugin) | Documents creating a Mac Apple Shortcut with URL → Open URLs to open a particular Obsidian note, including launcher placement options. | Uses `obsidian://just-note` and requires that plugin; demonstrates the workflow, not our core-URI file writer. |
| [Apple's Shortcuts for Mac guide](https://support.apple.com/ja-jp/guide/shortcuts-mac/apd163eb9f95/mac) | Documents File → Add to Dock for a shortcut. | Official support for a Mac launcher surface; not a certification of Obsidian `.url` files. |
| [trapple/skills project README](https://github.com/trapple/skills#included-skills) | Describes macOS-only `.inetloc` generation for clickable Obsidian links. | An implementation claim for a link adapter; no independent verification of Desktop double-click behavior here. |

Research also found a [2023 Mac user's statement that vault URIs open the named
vault with Obsidian closed](https://forum.obsidian.md/t/how-to-change-startup-to-vault-choose-interface/58983).
That supports URI dispatch but does not identify the file format they used.
I did not treat iOS Shortcuts results, keyboard hotkeys, Windows-only recipes, or
Obsidian's ability to import `.webloc` files as evidence of Mac Desktop launching.

#### Simplest Mac method to validate

Create a **plain-text** file on Desktop named `Work vault.url` with:

```ini
[InternetShortcut]
URL=obsidian://open?vault=Work%20Notes

```

For a note, use the same structure with this URL value:

```text
obsidian://open?vault=Work%20Notes&file=Projects%2FPlan.md
```

Use the actual registered vault name and an existing relative note path. Keep
the final newline and the `.url` extension (not `.url.txt` or rich text). Encoding
rules are those already documented for the shared URI builder. Do not put quotes
around the URL or XML-escape its `&` in an INI file. Double-click from Finder/Desktop.
These are proposed verification fixtures derived from the reported technique,
not files we ran on a Mac in this session.

Implement the documented `.url` approach first and let Mac users test it. The
Mac-specific code mainly handles Desktop discovery, filesystem naming and write
errors. If users report a handler/browser incompatibility, investigate `.inetloc`
as a targeted alternative. `.webloc` remains
a possible plist alternative, but is no longer the preferred candidate: the most
direct Obsidian Desktop evidence found is for `.url`.

For either plist format, use a `URL` string and proper XML serialization; query
separators become `&amp;`. Link-data files do not require shell scripts or executable
bits. A `.webloc` implementation shows how little serialization is involved, but
does not prove Obsidian dispatch on its own. [Webloc implementation](https://github.com/peterc/webloc).

Apple Shortcuts is a documented manual alternative. The proposed core workflow is
URL containing `obsidian://open?...` → Open URLs; the core URI's suitability follows
from Obsidian's protocol documentation and the Mac vault-URI report. Do not require
Just Note or Advanced URI for ordinary vault/note opening. Do not add automatic
Apple Shortcuts installation, AppleScript app bundles, custom icons or a terminal
launcher merely to support this small utility.

#### macOS scope decision

- **Retain macOS as a feasible follow-up platform. Do not document it as impossible
  or as something no Obsidian Mac user has tried.**
- The current spike is Windows-only. Windows-first remains the implementation
  sequence; there is no requirement to finish internal Mac testing before making
  a Mac implementation available to end users.
- Implement Mac `.url` support as experimental when proceeding with development;
  consider `.inetloc` if user reports justify it.
- Ask users to exercise both commands, warm/cold launches, spaces, Unicode, query
  delimiters, collisions, the configured Desktop, iCloud Desktop and denied writes.
  These are suggested feedback cases, not prerequisites every user must complete.
- Capture macOS/Obsidian/plugin versions and relevant file/URL associations in
  issues. Ask for the default browser when it affects routing.
- Fix reproducible issues. If reports establish a specific unsupported configuration,
  document that limitation rather than treating all of macOS as impossible.

### Linux

The specification supports `Type=Link`, `Name=...`, and `URL=obsidian://...`.
This avoids an `Exec` command altogether. If target desktops need `Type=Application`
with `xdg-open`, implement a dedicated desktop-entry serializer: `Exec` has its own
quoting rules, `%` denotes field codes, and literal URI percent signs require `%%`.
Ordinary shell escaping is not sufficient; field-code expansion inside quoted
arguments has specified limitations. Never wrap generated values in `sh -c`.
[Desktop entry keys](https://specifications.freedesktop.org/desktop-entry/latest/recognized-keys.html),
[Exec rules](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html).

Some environments require executable permissions and/or an explicit trust action;
some don't display Desktop icons. Flatpak/AppImage packaging and protocol registration
also need user testing. Document support as experimental when implemented; do not
claim that writing a `.desktop` file is sufficient everywhere or automatically bypass
the environment's launcher trust controls.

## Encoding, safety, and scope boundaries

- Encode **each value once** with `encodeURIComponent`; keep the URI syntax intact.
  Use the full relative note path to disambiguate same-named files in different
  folders. `%20`, `%2F`, `%26`, `%2B`, `%25` and UTF-8 escapes must survive unchanged.
- Obsidian supports a vault name or ID, but this MVP uses the public name API.
  Same-named vaults are ambiguous; renames/moves can stale links. An absolute `path`
  parameter is a later alternative for notes, at the cost of machine-specific paths.
- `#` has heading/block meaning after decoding. The spike deliberately rejects it
  in note paths rather than implying encoding makes that case unambiguous.
- Folder opening is not a documented `open` action target. Decide whether a future
  command opens the folder in Explorer/Finder, searches that folder in Obsidian,
  opens a folder note, or uses a custom handler; these are different products.

These URI constraints follow the documented core protocol; the rejection policy
and decision to defer folders are recommendations. [Obsidian URI reference](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI).

For Windows filenames, remove separators, reserved characters and controls; handle
reserved device names (including names with extensions), trailing dots/spaces,
empty results and excessive length. Sanitize only the **shortcut filename**, never
the logical vault/note path used in the URI. Use a bounded name and report long-path
errors. [Microsoft filename rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).

Use exclusive `writeFile(..., {flag: 'wx'})` creation and retry only `EEXIST` with
a suffix. Do not use an existence check followed by an overwriting write. Surface
permission/storage errors; a failed write can leave a partial newly created file,
so success should only be reported after completion. Network filesystems may have
different exclusive-creation guarantees; this needs testing for redirected Desktops.
[Node filesystem flags](https://nodejs.org/api/fs.html#file-system-flags).

## UX and architecture

Use **Vault Shortcuts** as a working name, pending final directory/name checks.
The vault entry point is the plugin's settings page, reached by opening Settings,
scrolling to the Community plugins section and selecting Vault Shortcuts. Show a
short description and a **Create Shortcut** button, with the system Desktop as
the stated destination. Do not require users to discover the command palette.

Clicking **Create Shortcut** creates a shortcut to the current vault. Display the
vault name near the button. There is no target chooser or note-context tracking
in settings; this supersedes the earlier proposed chooser.

For notes, expose **Create desktop shortcut** in the note context menu. Use the
specific Markdown file supplied by the menu event, not a global active-file
lookup. A user can right-click note B while viewing note A and must get a shortcut
to B. Revalidate the target at execution; if it was deleted, report an error. The
editor menu uses the file attached to its view. Share the action logic and avoid
duplicate entries. Register menu events through the plugin's cleanup mechanism.
No folder action, selection-to-heading action or batch export is part of v1.

Retain secondary commands `Vault Shortcuts: Create shortcut to this vault` and
`Vault Shortcuts: Create shortcut to current note`. They use the same URI builder
and writer as the settings action. Use labels such as
`Work - Obsidian.url` and `Weekly plan - Work.url`; suffix duplicates automatically.
Success notices show the output path. Error notices say what failed. No preset
hotkeys; users can bind the normal commands.

Start with no configurable preferences on this small action page. If users need
another location, add exactly one optional
**Shortcut folder** setting (blank means system Desktop), stored with awareness
that synced vault settings may refer to another machine. Defer format selectors,
filename templates, icon pickers, bulk operations, and rename tracking.

### Creator interface and OS selection

Use the user's proposed architecture: `IShortcutCreator` exposes vault and note
creation; one concrete implementation handles each OS. A public `ShortcutCreator`
class implements the same interface, selects the concrete creator for the current
OS, and forwards calls. It combines factory selection with a delegating facade.
Interpret the user's trailing “PS/” as OS/platform.

Proposed contract (return value is the absolute created shortcut path):

```ts
export interface IShortcutCreator {
  createVaultShortcut(vaultName: string): Promise<string>;
  createNoteShortcut(vaultName: string, notePath: string): Promise<string>;
}
```

Pass the full vault-relative note path, including `.md`. Resolve the clicked note
in the Obsidian UI layer and pass it explicitly; creators never look up the active
note. The vault name is read at invocation, not cached at startup. These arguments
keep the OS classes independent of Obsidian's `App`, views and context menus.

```text
Settings / note context menu / commands
                  |
       ShortcutCreator : IShortcutCreator
                  |
       Select once using Obsidian Platform flags
                  |
          +-------+--------+
          |       |        |
       Windows  MacOS    Linux
          |       |        |
       Shared URI and file-writing helpers
```

- **`src/main.ts`:** reads Obsidian context, registers settings/menu/command actions,
  constructs one public creator, awaits operations, and shows success/error notices.
- **`ShortcutCreator`:** selects once from `Platform.isWin`, `Platform.isMacOS`,
  or `Platform.isLinux`; stores an `IShortcutCreator` and delegates both methods.
  Keep the switch inside this public class, out of UI handlers. Unsupported or
  not-yet-implemented platforms produce a clear error when creation is requested,
  not a silent fallback or a plugin-load crash.
- **`WindowsShortcutCreator`:** resolves the Windows Desktop and creates `.url`.
- **`MacOSShortcutCreator`:** resolves the Mac Desktop and initially creates `.url`.
- **`LinuxShortcutCreator`:** resolves the XDG Desktop and creates `.desktop`
  with `Type=Link` and `URL=` initially.
- **Shared helpers:** encode the core URI, derive the display label, sanitize its
  filename, and exclusively create a file with collision suffixes. Windows and
  Mac share the `.url` serializer; Linux supplies desktop-entry serialization.
  Creators choose the format and destination; the file helper only writes data.

Both methods resolve only after the file is written, returning its absolute path.
Failures reject and are translated into notices by the UI layer. No notices,
modals, protocol launching or mutable active-note state belong in OS creators.
One private creation helper per concrete class can handle its two public methods;
do not duplicate encoding and collision logic across classes or introduce an
abstract base class solely to eliminate a few delegation lines.

Current structure (implementation under `src/`, matching csvzall):

```text
src/
  main.ts
  shortcuts/
    IShortcutCreator.ts
    ShortcutCreator.ts
    WindowsShortcutCreator.ts
    MacOSShortcutCreator.ts
    LinuxShortcutCreator.ts
    desktop.ts              Platform Desktop discovery
    uri.ts
    files.ts                Filename/label helpers, serializers, exclusive write
tests/                      TypeScript tests and host fixture
main.js                     Generated bundle; remains at root for installation
manifest.json
```

The original spike used `main.ts`, `uri.ts`, and `windows.ts`. Migrate its working
helpers rather than rewrite their behavior. A single platform branch in the public
creator is sufficient; no registry, dependency injection framework, background
service, custom protocol or shortcut database is needed. The earlier three-file
production proposal is superseded by this interface-based architecture.

## Existing plugins and directory viability

I checked the current official registry (7,599 entries returned), filtered names
and descriptions for shortcuts/URI/launchers and related formats, searched GitHub,
and read the closest project documentation. I did not find a direct match for the
two automatic Desktop-file commands. This is a bounded search, not proof that no
unlisted script or overlapping feature exists.
[Official registry](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json).

| Existing feature/plugin | Overlap and remaining gap |
| --- | --- |
| Built-in **Copy Obsidian URL** | Already provides a note URL; the user still creates the OS file. No need to duplicate it in v1. [Obsidian documentation issue](https://github.com/obsidianmd/obsidian-help/issues/1002) |
| **Advanced URI** | Richer URI-driven navigation/automation. Core `open` already covers this MVP; adding it as a dependency is unnecessary. [Project](https://github.com/Vinzent03/obsidian-advanced-uri) |
| **Actions URI** | Additional callback endpoints for integrations, rather than this automatic Desktop-file workflow. [Project](https://github.com/czottmann/obsidian-actions-uri) |
| **Just Note** | Focused note windows, with documented manual Apple Shortcuts setup. The proposed plugin automates file creation and uses ordinary Obsidian windows. [Project](https://github.com/rajalokan/obsidian-just-note-plugin) |
| **URL File Preview** | Views/edits existing `.url` files inside a vault. Different direction from exporting vault/note shortcuts to the Desktop. [Project](https://github.com/turingexmachina/obsidian-url-file-preview) |
| **Shell commands** | Could run a user-authored shortcut script. The gap is a small, ready-to-use workflow with encoding, Desktop discovery and collision handling supplied. [Project](https://github.com/Taitava/obsidian-shellcommands) |

This is a reasonable community-directory candidate: narrow purpose, tangible manual
work removed, and low runtime dependency surface. Before submission, choose a
license, confirm the final ID/name, choose a defensible minimum Obsidian version,
run the current submission checks, document implemented/experimental platforms and external
access, and prepare release assets. `isDesktopOnly` is not an OS filter, so keep
runtime OS dispatch. The implementation is intentionally not published or presented
as a fully tested release. [Manifest rules](https://docs.obsidian.md/Reference/Manifest),
[Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).

## Historical spike and verification (before implementation)

The implemented commands read the current vault name via the public API, build the
URI, discover Desktop and write the shortcut. The note command adds the current
Markdown file's relative path. No settings or production framework were added.

TypeScript checking and bundling passed. All six focused tests passed, including
actual Windows Desktop discovery, Unicode/encoding and injection cases, reserved
filenames, missing destination errors, and concurrent collision preservation.
The compiled `main.js` is about 5 KB. See README for installation instructions.

Filesystem fixtures were written in temporary directories, not to your real Desktop.
No plugin was installed into a vault, and no live command or Explorer double-click
was verified. End users will perform host checks: run both commands, inspect the
Desktop files, and double-click with Obsidian running and closed. Redirected Desktop
and denied-write reports will guide fixes. These checks are not an internal release
gate. Mac feasibility is now supported by outside reports, while this
plugin's Mac and Linux behavior remains untested on those hosts.

## Historical spike: build, installation and boundaries

Initial package version: `0.0.1`; working plugin ID: `vault-shortcuts`.
The initial `minAppVersion: 1.8.7` was provisional. Implementation now targets
`1.13.7`, the stable desktop version verified from the [official release feed](https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json)
on September 13, 2026, following the official conservative-baseline guidance.
The newer 1.14.1 entry is beta, not the stable target.
Development uses TypeScript, esbuild, Obsidian type definitions and Node typings;
there are no additional runtime npm dependencies.

With Node 22 or newer:

```text
npm ci --ignore-scripts
npm run build
npm test
```

Copy `main.js` and `manifest.json` into a separate test vault's configured plugin
directory, normally `<test vault>/.obsidian/plugins/vault-shortcuts/`. Reload
Obsidian and enable Vault Shortcuts. The two commands will appear with the plugin
name prefix; the note command requires an active Markdown note. The Desktop file
is created only when the command runs; enabling the plugin does not write one.

The spike neither modifies note contents nor launches the created file. It has
no settings or icons. The URI includes `.md`. Paths containing `#` get an explicit
error. The Windows path lookup is hidden, fixed, noninteractive and limited to
10 seconds. Failures do not elevate permissions or fall back to a guessed folder.

The README discloses external Desktop writes and the path-discovery subprocess.
No network requests or telemetry occur at runtime; Desktop sync services may
nevertheless synchronize the files, which contain vault/note names. Shortcuts are
ordinary user-owned files; disabling or uninstalling the plugin does not delete
them. Renames require recreating them. No production installation or publication
has been performed.

## Implementation status (September 13, 2026)

The agreed implementation is now present: native settings button, clicked-note
file/editor context menus, both commands, the public `ShortcutCreator` facade and
three OS implementations. Windows and Mac use `.url`; Linux uses a `Type=Link`
`.desktop` file. Common helpers encode URIs, sanitize filenames and exclusively
create files with collision suffixes. Desktop discovery uses fixed system queries.
The minimum Obsidian version is 1.13.7. Mac and Linux remain experimental.

Strict TypeScript includes runtime code and tests. Official Obsidian lint rules
are installed with zero warnings required. A root MIT license and external-access
disclosure are present. README.md contains current usage and installation steps;
the spike descriptions above are historical. No live Obsidian launch tests or
publication have been performed. End users will test and report issues.

Final implementation review: parent and independent reviewer found no remaining
high-priority or actionable lower-priority findings. The parent reran the production
build (including strict type checking), official lint with zero warnings, and all
nine tests successfully. Tests cover encoding, concurrent collisions, filename
safety, Linux serialization, Desktop validation, Windows Desktop discovery and
mocked-host clicked-note targeting, duplicate menus, stale files and OS dispatch.
They create shortcut files only in temporary test directories. The generated
`main.js` bundle is 10,235 bytes; runtime npm dependencies are not required.

## Original ordered steps and continuing end-user testing plan

Implementation steps 1 and 2 below have been completed. The distribution and
submission steps remain future work; implementation does not authorize publication.

1. **Keep the first release small.** Retain the two commands, collision protection
   and notices. Add the requested settings-page **Create Shortcut** button and
   note context-menu **Create desktop shortcut** action, sharing the existing
   creation logic. Check that right-clicking a different note targets that note.
   Use the existing passing automated checks
   as the starting point.
2. **Implement platform support when development proceeds.** Windows already has
   a spike. Move it behind `IShortcutCreator` and the public `ShortcutCreator`
   factory/facade. Add concrete Mac and Linux creators incrementally. Share the
   `.url` writer with Mac and mark unverified support experimental. No maintainer
   Mac environment is a prerequisite. Linux uses direct-URI `.desktop` links and the same
   end-user testing model; platform expansion stays small and incremental.
3. **Distribute for end-user testing.** Package build assets and installation
   instructions, state the actual verification status, and direct users to file
   issues. No download link or issue destination exists yet; create them when the
   repository/release is published rather than inventing links now.
4. **Make reports useful.** Request plugin, Obsidian and OS versions; command used;
   error notice; whether file creation or double-click launching failed; whether
   Obsidian was running; and whether Desktop is redirected or synced. Ask users
   to redact private vault/note names and paths from any example file.
5. **Fix based on issues.** Reproduce where practical, add a focused regression
   check when useful, and adjust only the failing behavior. A Mac report may
   justify `.inetloc`; it does not justify building a general launcher framework.
6. **Prepare community submission separately.** Choose license/final identity,
   complete current required checks, and retain the external-access disclosure
   and accurate experimental-platform labels. End-user testing does not replace
   directory requirements. Publication itself is outside this documentation task.

Implementation and review are now authorized. Complete the agreed UI/creator
architecture and local checks, then iterate on parent and independent-subagent
review findings. End users still provide live platform testing and file issues;
no plugin installation, release publication or directory submission is requested.

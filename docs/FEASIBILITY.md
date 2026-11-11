# Vault Shortcuts feasibility and MVP

Investigated September 13, 2026. Recommendation: build a tiny Windows-first plugin.
The feature is technically straightforward; reliable OS integration is the work.

**Follow-up:** [PLAN.md](PLAN.md) consolidates this investigation, implementation
status and subsequent Mac research. Mac Desktop shortcuts are possible: a Mac
user documented working `.url` files in 2021. `.url` is now the first Mac candidate;
the earlier `.webloc`-first suggestion below has been superseded.

**Validation update:** end users will test and file issues. The manual pre-release
testing suggestions in this initial report are superseded by PLAN.md; acquiring
a Mac test environment is not a prerequisite for experimental Mac support.

**UX update:** the primary entry point is now the plugin settings page's
**Create Shortcut** button. PLAN.md supersedes this report's original command-only,
no-settings-page recommendation. The original spike has now been replaced by the
agreed TypeScript implementation; see README.md for current usage and checks.
The settings button targets the vault; notes get a **Create desktop shortcut**
context-menu action targeting the clicked note, replacing the proposed chooser.

## Recommended first release

Ship two explicit commands that create `.url` files on the actual Windows Desktop:

- **Create shortcut to this vault**
- **Create shortcut to current note**

Use the core `obsidian://open` action, percent-encode each parameter separately,
sanitize the display filename, append numbered suffixes on collisions, and show
a notice containing the resulting path or an actionable error. Start with Markdown
notes only. No settings, automatic hotkeys, ribbon icon, folder command, or custom
URI handler are needed. Created shortcuts keep working after this plugin is disabled.

I would ship Windows-only first. Budget approximately 150–250 runtime TypeScript
lines for a small release; this spike uses about 130 physical lines. Build metadata,
tests and documentation are additional. As a rough engineering estimate, a working
spike takes hours, a Windows release a few focused days including manual testing,
and cross-platform support several more days dominated by OS verification. Directory
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
Desktop writes and its fixed Windows path-discovery subprocess. The command itself
is the deliberate user action; I found no published requirement for a confirmation
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
| macOS | `.url` first; `.inetloc` as a fallback candidate | Direct Obsidian Mac user report exists; experimental support with end-user issue reporting; see PLAN.md |
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

`.webloc` is a property list holding a `URL` string; XML serialization needs
`&amp;` for the query separator and proper escaping of XML-sensitive characters.
No executable bit is needed for the link data itself. This is the simplest file
to generate, but serialization alone does not establish reliable custom-scheme
dispatch through every default browser/Finder combination.
[Webloc implementation](https://github.com/peterc/webloc),
[macOS handler inspection tool](https://github.com/scriptingosx/utiluti).

Updated recommendation: start with `.url`. A [firsthand Mac user report](https://forum.obsidian.md/t/mac-win-desktop-file-system-deeplinks-bookmarks-shortcuts-into-obsidian/25360)
documents double-clickable Obsidian URI files. Keep Mac under consideration and
collect compatibility reports from end users after adding experimental support.
The remaining uncertainty is
our implementation's behavior on supported Macs, not whether Mac shortcuts exist.
[PLAN.md](PLAN.md) records the evidence, alternatives and acceptance checks.

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
also need testing. Treat these as release verification questions; do not promise
that writing a `.desktop` file is sufficient everywhere or automatically bypass
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
Commands display as `Vault Shortcuts: Create shortcut to this vault` and
`Vault Shortcuts: Create shortcut to current note`. Use labels such as
`Work - Obsidian.url` and `Weekly plan - Work.url`; suffix duplicates automatically.
Success notices show the output path. Error notices say what failed. No preset
hotkeys; users can bind the normal commands.

Start without settings. If users need another location, add exactly one optional
**Shortcut folder** setting (blank means system Desktop), stored with awareness
that synced vault settings may refer to another machine. Defer format selectors,
filename templates, icon pickers, bulk operations, and rename tracking.

Keep three runtime files:

```text
main.ts      Commands, current vault/note lookup, notices
uri.ts       Core URI construction
windows.ts   Desktop lookup, filename sanitization, exclusive .url writer
```

There are three files in the spike. For a multi-OS version, move the sanitizer into
`filename.ts` only when it is shared and add `macos.ts` / `linux.ts` as needed.
A simple platform branch is sufficient; no provider registry, dependency injection
framework, background service, custom protocol or shortcut database.

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
license, confirm the final ID/name, test the minimum supported Obsidian version,
run the current submission checks, document Windows-only support and external
access, and prepare release assets. `isDesktopOnly` is not an OS filter, so keep
the runtime Windows guard. The spike is intentionally not published or presented
as a fully tested release. [Manifest rules](https://docs.obsidian.md/Reference/Manifest),
[Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).

## Spike and verification

The implemented commands read the current vault name via the public API, build the
URI, discover Desktop and write the shortcut. The note command adds the current
Markdown file's relative path. No settings or production framework were added.

TypeScript checking and bundling passed. All six focused tests passed, including
actual Windows Desktop discovery, Unicode/encoding and injection cases, reserved
filenames, missing destination errors, and concurrent collision preservation.
The compiled `main.js` is about 5 KB. See README for installation instructions.

Filesystem fixtures were written in temporary directories, not to your real Desktop.
No plugin was installed into a vault, and no live command or Explorer double-click
was verified. The remaining host check is to load the two-file build into a test
vault, run both commands, inspect the Desktop files, and double-click with Obsidian
both running and closed. Also test a OneDrive/redirected Desktop and a denied write
before release. macOS and Linux recommendations remain untested on those hosts.

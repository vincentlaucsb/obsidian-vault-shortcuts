# Windows Send to image capture

Open the destination vault and go to **Settings → Vault Shortcuts → Windows Send to**.
Set **New note folder** to an existing path such as `Inbox/Images`, then select
**Save folder**. Leave it blank to use the vault root. Select **Install Send to entries**.

In File Explorer on Windows 11, right-click one image and choose **Show more
options → Send to**. You can also hold **Shift** while right-clicking to open
the classic menu directly. [Windows keyboard shortcuts](https://support.microsoft.com/en-gb/accessibility/windows/keyboard-shortcuts-in-windows)

- **Obsidian - New note (vault name)** creates a note named after the image.
  Repeated captures get numbered filenames.
- **Obsidian - Daily note (vault name)** appends the image at the end of today’s
  daily note. Enable Daily notes under **Settings → Core plugins** and enable
  **Command line interface** under **Settings → General**. Follow Obsidian’s CLI
  setup prompt. The first capture into a missing daily note uses the core plugin’s
  configured folder, date format and template. [Obsidian CLI help](https://obsidian.md/help/cli#Daily+notes)

Supported images are PNG, JPEG, GIF, WebP and BMP, up to 32 MB. The plugin copies
the selected image beside its receiving note, inserts an embed, and opens the
note. The source stays where it is. The shortcut opens or focuses the registered
destination vault. If Windows cannot launch Obsidian, the request waits for you
to open the vault with Vault Shortcuts enabled. Keep the source in place until
the import finishes. Daily capture uses the date when the vault processes the
request.

If your existing entries only queue the image, select **Install Send to entries**
again to update the launcher.

## What’s installed locally

Windows has a per-user **SendTo** Known Folder. Explorer resolves a shortcut there
and appends the selected file path when it runs the shortcut’s target. [Known Folder reference](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid) · [Explorer shortcut arguments](https://devblogs.microsoft.com/oldnewthing/20170403-00/?p=95885)

The plugin queries that folder with Windows PowerShell and creates two Windows
shortcuts to Windows Script Host. The launcher and a queue of selected paths live
under `%LOCALAPPDATA%\VaultShortcuts\SendTo`, keyed to the vault’s physical folder.
The launcher stages paths locally and opens a built-in Obsidian URL for the
registered vault by path. The plugin reads the selected image, validates
its size and file signature, and commits the copy and embed through Obsidian’s
Vault APIs. Daily capture verifies the CLI’s vault path before asking for the
daily note. Distinct vault names avoid ambiguous CLI selection.

Select **Remove Send to entries** to disable capture and remove the menu entries
the plugin can still identify. Changed entries are preserved. The local launcher
and pending requests remain on disk, and installing again in the same vault
resumes pending requests. Remove the menu entries before moving the vault or
uninstalling the plugin. Windows Script Host must be available under your Windows
account’s policy.

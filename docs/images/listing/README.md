# Listing screenshots

Generated with `npm run screenshots` using Playwright 1.65.0 and installed
Obsidian 1.15.0 on Windows, default theme, 16px base font and CSS-pixel captures.
All notes, folder/vault names and clipboard data are fictional test fixtures.

| Scene | Dark | Light |
| --- | --- | --- |
| Settings and default icon | [Dark](settings-dark.png) | [Light](settings-light.png) |
| General tab with custom image | [Dark](custom-icon-dark.png) | [Light](custom-icon-light.png) |
| Create a fresh note in a folder | [Dark](folder-dark.png) | [Light](folder-light.png) |
| Note shortcut to a heading | [Dark](note-dark.png) | [Light](note-light.png) |

Settings uses an 1100×900 viewport; main-window Advanced scenes use 1180×1480.
Captures crop to the real settings content or modal, omit the caret and disable
animations. No controls are replaced, screenshots retouched or private vaults used.
The source icon fixture lives at `tests/fixtures/recipes-pot-pie.png`.

See [UI testing](../../UI-TESTING.md) for isolation, baseline update instructions
and native-host limitations. These files are local listing/README assets; no
listing submission or release is performed by the capture command.

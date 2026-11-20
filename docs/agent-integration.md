# Agent integration in 1.1.0

Vault Shortcuts uses an opt-in JSON handoff through Obsidian's URI protocol.
The three identical project skills show agents how to ask for help, preview,
or creation. Obsidian Copilot is the primary use case. A terminal agent can
open or foreground Obsidian during the handoff.

## Execution decision

A standalone native helper could work with Obsidian closed. It would need its
own platform builds, a way to resolve the vault, and separate implementations
or runtime support for Obsidian's live vault index, settings and image
conversion. A packaged JavaScript file alone needs a compatible JavaScript
runtime. Reusing Obsidian's Electron executable as a JavaScript launcher would
depend on its distribution and runtime flags.

The plugin-hosted interface uses Obsidian's existing runtime. The skill uses
Windows PowerShell, or a POSIX shell with a SHA-256 utility and the system URI
opener on macOS or Linux. The agent needs permission to write local files and
invoke the registered Obsidian URI. Agent clients use their own authentication.

The skill makes a private request directory under `~/.vault-shortcuts-agent`,
keyed by the vault's path and active plugin directory. It writes a versioned
JSON request and invokes `obsidian://vault-shortcuts-agent` with the vault
path and a random request ID. Only the staged file contains the operation or
note text. The plugin accepts an ID in its own vault's directory, claims it
once and rejects stale or oversized requests. It publishes a JSON result
followed by a completion marker. The client reads the result and cleans up
the completed handoff. On timeout, it preserves a claimed request directory
so a late result can still be inspected. Startup registers the URI handler
and performs no agent-specific disk I/O, polling or port binding.
[Obsidian URI documentation](https://obsidian.md/help/uri)

## Use it

In **Settings → Vault Shortcuts → Agent integration**, select **Enable or
repair**, then **Test connection**. Start a fresh local agent at this vault's
root. Try “Create a desktop shortcut that opens my Packing List note” or
“Make a Start menu shortcut that appends my clipboard to my daily note.”
The preview explains what launching would do. Creation returns the exact
file path and Obsidian URI, including the allocated name if there is a duplicate.

Requests target the running vault. Vault names are portable across devices
with the same name but can be ambiguous. A manually supplied device-local
vault ID is available for existing-file actions and requires verification
with the optional official Obsidian CLI. Other-vault shortcuts and callback
actions remain available through the plugin UI. Agents can use the vault's
default icon, the standard icon, or a PNG, JPEG or ICO attachment in the vault.

Enable or repair installs regular `SKILL.md` files under `.agents/skills`,
`.claude/skills` and `.opencode/skills`. It preserves same-name user files,
edits and links managed by Copilot. Remove disables request processing and deletes
only unchanged skill copies owned by this installation. Installed skill
files can follow vault sync settings. The enablement and ownership record
are local to the current Obsidian profile. If you used the earlier development
build, choose **Enable or repair** to update the unchanged installed skills.

Discovery mechanisms are documented by [Codex](https://learn.chatgpt.com/docs/build-skills),
[Claude Code](https://code.claude.com/docs/en/skills) and
[Copilot](https://docs.obsidiancopilot.com/agent-mode-and-tools/#skills-across-agents).

## Verification

The isolated host was Windows x64 with Obsidian 1.15.0. It used fictional
notes, spaces and Unicode in the vault and file paths, a nondefault
configuration folder, and synthetic Desktop and Programs folders.

| Check | Result |
| --- | --- |
| PowerShell and Obsidian URI handoff | With an empty PATH, the installed skill staged help, preview and create requests. The real desktop protocol dispatcher delivered each request to the plugin in the synthetic vault. Two creates returned distinct numbered paths. The Start menu shortcut contained the converted custom icon. The shortcut stayed unopened and the note was byte-for-byte unchanged. |
| Settings and ownership | Enable, Test connection, repair and removal ran through detached Settings. Startup left the absent mailbox, edited skill, and missing skill untouched. Focused tests cover owned and unowned copies, a Copilot-style junction, stale setup locks, vault binding, expired requests and URI replays. |
| Copilot 4.0.20 skill catalog | Copilot’s discovery service listed one Vault Shortcuts skill enabled for Claude, Codex and OpenCode, with zero reconciliation errors. |

The harness substitutes the Windows launcher with a call to the isolated
Obsidian renderer's URI dispatcher because the launcher shares a per-user
pipe across profiles. This verifies the plugin and generated skill through
the dispatch boundary. OS-level foregrounding and cold start, standalone
agent execution over this transport, and native macOS and Linux execution
remain unverified.

A user-provided screenshot from a live Windows Copilot chat showed the
agent selecting the skill from a plain-language request and creating a
Daily Note shortcut with a generated quill icon visible on the Windows
desktop.

The earlier development build used HTTP. These client results describe that
build and establish skill discovery separately from the transport.

| Client | Result with the earlier build |
| --- | --- |
| Codex CLI 0.160.1 | A fresh session selected the skill from a plain-language request, called help and preview, created a shortcut in the fixture Desktop, and returned its path and encoded URI. |
| Copilot's Codex adapter 2.2.2 | A fresh ACP session selected and read the skill. The Windows command launcher failed before running its PowerShell instructions. Both the pinned Codex CLI 0.160.1 and installed desktop binary 0.169.0-alpha.11.1 hit this blocker. |
| Claude Code 2.1.285 | The startup event listed the skill. The session required sign-in before preview or creation could run. |

The client prompts named only the desired shortcut and note. The standalone
agent's PATH contained Windows system directories.

Run `npm test` for the protocol and ownership checks, and
`npm run test:ui -- agents.spec.ts` for the Windows Obsidian regression.
Copilot's Claude and OpenCode backends remain unverified.

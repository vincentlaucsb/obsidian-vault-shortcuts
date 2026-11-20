export const SKILL_PATHS = [
  '.agents/skills/vault-shortcuts/SKILL.md',
  '.claude/skills/vault-shortcuts/SKILL.md',
  '.opencode/skills/vault-shortcuts/SKILL.md',
] as const;
export const AGENT_DIRECTORY = '.vault-shortcuts-agent';
export const AGENT_ACTION = 'vault-shortcuts-agent';

export function agentSkill(pluginDirectory: string): string {
  const powershellPath = Buffer.from(pluginDirectory, 'utf8').toString('base64');
  const shellPath = `'${pluginDirectory.replace(/'/g, "'\\''")}'`;
  return `---
name: vault-shortcuts
description: Create or preview desktop and Windows Start menu shortcuts to Obsidian vault files, searches and note actions. Use when asked to make a shortcut that opens, finds or captures something in this vault.
---

Run from the root of this local vault. The handoff may open or focus Obsidian.
If unavailable, ask the user to open this vault and use
**Settings → Vault Shortcuts → Agent integration → Enable or repair**.

Call \`help\` for request fields and examples, then \`preview\` with the intended
JSON. Check the destination, URI and launch effect. Call \`create\` with the same
JSON when the user has asked for creation. Report the returned path and URI.
Check the JSON's \`ok\` field and report any error, including a path if present.
Use an exact vault-relative path for existing files; resolve ambiguous names
with the user. Use replace only for an explicitly requested overwrite on
launch. Fixed text is embedded in the shortcut and Clipboard reads at launch.
Leave the new shortcut unlaunched. If creation times out, check whether it
completed before retrying so you do not create an extra copy.

### Windows PowerShell

Use PowerShell for Windows vaults, including when your terminal tool defaults
to Git Bash. Repeat the setup block if each tool call starts a fresh shell.

\`\`\`powershell
$vsVault = (Get-Location).ProviderPath
$vsRoot = [regex]::Replace($vsVault.Replace('\\', '/'), '[A-Z]', { param($m) $m.Value.ToLowerInvariant() })
$vsPlugin = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${powershellPath}'))
$vsSha = [Security.Cryptography.SHA256]::Create()
$vsKey = [BitConverter]::ToString($vsSha.ComputeHash([Text.Encoding]::UTF8.GetBytes($vsRoot + [char]10 + $vsPlugin))).Replace('-', '').ToLowerInvariant()
$vsSha.Dispose()
$vsBase = Join-Path $env:USERPROFILE "${AGENT_DIRECTORY}/requests-$vsKey"
if (-not (Test-Path -LiteralPath $vsBase -PathType Container)) {
  throw 'Enable or repair Vault Shortcuts agent integration in this vault.'
}
function Open-VaultShortcutRequest($uri) { Start-Process -FilePath $uri -ErrorAction Stop }
function Invoke-VaultShortcut($operation, $json) {
  if ($operation -cnotin 'help', 'preview', 'create') { throw 'Unknown shortcut operation.' }
  if ($operation -eq 'help') { $json = 'null' }
  $id = [Guid]::NewGuid().ToString('N')
  $dir = Join-Path $vsBase $id
  New-Item -ItemType Directory -Path $dir -ErrorAction Stop | Out-Null
  $ready = Join-Path $dir 'ready'
  $claim = Join-Path $dir 'claimed'
  $body = '{"version":1,"operation":"' + $operation + '","request":' + $json + '}'
  $utf8 = [Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  try {
    [IO.File]::WriteAllText((Join-Path $dir 'request.json'), $body, $utf8)
    $root = [Uri]::EscapeDataString($vsVault.Replace('\\', '/'))
    Open-VaultShortcutRequest "obsidian://${AGENT_ACTION}?path=$root&request=$id"
    for ($i = 0; $i -lt 180; $i++) {
      if (Test-Path -LiteralPath $ready) {
        return [IO.File]::ReadAllText((Join-Path $dir 'result.json'), $utf8)
      }
      Start-Sleep -Milliseconds 250
    }
    throw 'Timed out waiting for Obsidian. Inspect the destination before retrying creation.'
  } finally {
    $canClean = Test-Path -LiteralPath $ready
    if (-not $canClean) {
      try {
        [IO.File]::Open($claim, [IO.FileMode]::CreateNew).Dispose()
        $canClean = $true
      } catch { } # Obsidian may own the request.
    }
    if ($canClean) {
      foreach ($name in 'request.json', 'result.json', 'ready', 'claimed') {
        Remove-Item -LiteralPath (Join-Path $dir $name) -ErrorAction SilentlyContinue
      }
      try { [IO.Directory]::Delete($dir, $false) } catch { }
    }
  }
}
Invoke-VaultShortcut help
\`\`\`

Use \`Invoke-VaultShortcut preview $json\` and \`Invoke-VaultShortcut create $json\`
with JSON built using \`ConvertTo-Json -Depth 8 -Compress\` or a single-quoted
here-string.

### macOS or Linux shell

\`\`\`sh
vs_hash() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi
}
vs_plugin=${shellPath}
vs_root=$(pwd -P)
vs_key=$(printf '%s\\n%s' "$vs_root" "$vs_plugin" | vs_hash)
vs_base="$HOME/${AGENT_DIRECTORY}/requests-\${vs_key%% *}"
vs_escape() {
  LC_ALL=C od -An -v -tx1 | tr -s '[:space:]' '\\n' | sed '/^$/d;s/^/%/' | tr -d '\\n'
}
vs_open() {
  if [ "$(uname -s)" = Darwin ]; then
    /usr/bin/open "$1"
  else
    command -v xdg-open >/dev/null 2>&1 || return 1
    xdg-open "$1" </dev/null >/dev/null 2>&1 &
  fi
}
vs() (
  case "$1" in help|preview|create) ;; *) exit 1;; esac
  [ -d "$vs_base" ] || { printf '%s\\n' 'Enable or repair Vault Shortcuts agent integration in this vault.' >&2; exit 1; }
  umask 077
  id=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \\n')
  [ "\${#id}" -eq 32 ] || exit 1
  dir="$vs_base/$id"
  mkdir "$dir" || exit 1
  trap 'if [ -f "$dir/ready" ] || (set -C; : > "$dir/claimed") 2>/dev/null; then
    rm -f "$dir/request.json" "$dir/result.json" "$dir/ready" "$dir/claimed"
    rmdir "$dir" 2>/dev/null
  fi' 0
  {
    printf '{"version":1,"operation":"%s","request":' "$1"
    if [ "$1" = help ]; then printf 'null'; else cat; fi
    printf '}'
  } > "$dir/request.json" || exit 1
  root=$(printf '%s' "$vs_root" | vs_escape)
  vs_open "obsidian://${AGENT_ACTION}?path=$root&request=$id" >/dev/null || exit 1
  attempts=0
  while [ "$attempts" -lt 45 ]; do
    if [ -f "$dir/ready" ]; then cat "$dir/result.json"; exit $?; fi
    sleep 1
    attempts=$((attempts + 1))
  done
  printf '%s\\n' 'Timed out waiting for Obsidian. Inspect the destination before retrying creation.' >&2
  exit 1
)
vs help
\`\`\`

Supply request JSON via standard input to \`vs preview\` and \`vs create\`,
for example with a quoted heredoc.
`;
}

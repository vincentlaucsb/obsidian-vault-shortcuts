export function buildObsidianUri(vaultName: string, notePath?: string): string {
  if (!vaultName) throw new Error('The vault has no name.');
  // Core open treats a decoded # as a heading separator, including encoded #.
  if (notePath?.includes('#')) {
    throw new Error('Files with # in their path cannot be targeted reliably by Obsidian URLs.');
  }
  if (notePath !== undefined && !notePath) throw new Error('The file has no path.');
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}` +
    (notePath === undefined ? '' : `&file=${encodeURIComponent(notePath)}`);
}

export function buildTagSearchUri(vaultName: string, tag: string): string {
  if (!vaultName) throw new Error('The vault has no name.');
  // Keep one tag operand, including nested tags and Unicode, without search syntax.
  if (!tag.startsWith('#') || tag.length < 2 || /[\s#:"()\\]/u.test(tag.slice(1))) {
    throw new Error('Select a valid tag from this note.');
  }
  return `obsidian://search?vault=${encodeURIComponent(vaultName)}&query=${encodeURIComponent(`tag:${tag}`)}`;
}

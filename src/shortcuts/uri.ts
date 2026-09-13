export function buildObsidianUri(vaultName: string, notePath?: string): string {
  if (!vaultName) throw new Error('The vault has no name.');
  // Core open treats a decoded # as a heading separator, including encoded #.
  if (notePath?.includes('#')) {
    throw new Error('Notes with # in their path cannot be targeted reliably by Obsidian URLs.');
  }
  if (notePath !== undefined && !notePath) throw new Error('The note has no path.');
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}` +
    (notePath === undefined ? '' : `&file=${encodeURIComponent(notePath)}`);
}

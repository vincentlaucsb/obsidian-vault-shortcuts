import { realpath } from 'node:fs/promises';
import { posix, win32 } from 'node:path';
import { cliOutputLines, discoveryErrorMessage, findObsidianCli, runVaultCommand } from './vaultDiscovery';
import { normalizeVaultId } from './shortcuts/requests';

/** Check CLI identity information only; never read the vault registry or notes. */
export async function checkVaultIdentityPath(output: string, expected: string, windows: boolean): Promise<void> {
  const lines = cliOutputLines(output);
  const path = lines[0];
  if (lines.length !== 1 || !path || !(win32.isAbsolute(path) || posix.isAbsolute(path)) || Array.from(path).some(character => character.charCodeAt(0) < 32)) {
    throw new Error('Obsidian did not return a vault path for this ID. Check the ID and CLI setup, or use the vault name.');
  }
  const [actualPath, expectedPath] = await Promise.all([realpath(path), realpath(expected)]);
  if ((windows ? actualPath.toLowerCase() : actualPath) !== (windows ? expectedPath.toLowerCase() : expectedPath)) {
    throw new Error('This ID belongs to a different vault. Copy the ID for the vault containing the clicked file.');
  }
}

export async function verifyVaultId(value: string, expectedPath: string, windows: boolean): Promise<string> {
  const id = normalizeVaultId(value);
  let output: string;
  try {
    const executable = await findObsidianCli(windows);
    output = await runVaultCommand(executable, [`vault=${id}`, 'vault', 'info=path']);
  } catch (error: unknown) {
    throw new Error(`Could not verify this vault ID. ${discoveryErrorMessage(error)} Name mode remains available.`);
  }
  await checkVaultIdentityPath(output, expectedPath, windows);
  return id;
}

import { describeEffect, draftFromRequest } from '../UriForm';
import { basename } from 'node:path';
import { sanitizeFilename, shortcutLabel } from '../shortcuts/files';
import { ShortcutIconError } from '../shortcuts/IShortcutCreator';
import type { IShortcutCreator } from '../shortcuts/IShortcutCreator';
import { buildShortcutUri, folderNotePath, folderSearchQuery, validateVaultRelativePath } from '../shortcuts/requests';
import type { ContentSource, ShortcutContext, ShortcutRequest } from '../shortcuts/requests';
import type { ShortcutDestination } from '../shortcuts/WindowsShortcutCreator';
import type { AgentOperation } from './mailbox';

type Icon = { mode: 'default' } | { mode: 'standard' } | { mode: 'custom'; file: string };
type JsonObject = Record<string, unknown>;
type Verify = () => void;

export interface AgentShortcutHost {
  vaultName(): string;
  file(path: string): { markdown: boolean; verify: Verify } | undefined;
  folder(path: string): Verify | undefined;
  verifyVaultId(value: string): Promise<string>;
  prepareIcon(icon: Icon): Promise<() => Promise<string | undefined>>;
  creator(destination: ShortcutDestination): IShortcutCreator;
  windows: boolean;
  extension: 'url' | 'desktop';
}

const common = ['action', 'name', 'destination', 'icon'];
const write = ['mode', 'content', 'heading', 'spacing', 'silent', 'paneType'];
const actionFields = {
  open: ['file', 'vaultId', 'navigation', 'paneType'],
  new: [...write, 'file', 'vaultId', 'folder', 'noteName'],
  daily: write,
  unique: ['content', 'paneType'],
  search: ['query', 'folder'],
};

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return { ...value };
}

function fields(value: JsonObject, keys: string[]): void {
  const unknown = Object.keys(value).find(key => !keys.includes(key));
  if (unknown !== undefined) throw new Error(`Unsupported field: ${unknown}. Run the help operation for the request fields.`);
}

function optionalText(data: JsonObject, key: string): string | undefined {
  const value = data[key];
  if (value === undefined || typeof value === 'string') return value;
  throw new Error(`${key} must be a string.`);
}

function requiredText(data: JsonObject, key: string): string {
  const value = optionalText(data, key);
  if (!value?.trim()) throw new Error(`${key} is required.`);
  return value;
}

function choice<T extends string>(data: JsonObject, key: string, values: readonly T[]): T | undefined {
  if (data[key] === undefined) return undefined;
  const value = values.find(candidate => candidate === data[key]);
  if (value === undefined) throw new Error(`${key} must be one of: ${values.join(', ')}.`);
  return value;
}

function content(data: JsonObject): ContentSource {
  if (data.content === undefined) return { kind: 'clipboard' };
  const value = object(data.content, 'content');
  const kind = choice(value, 'kind', ['clipboard', 'text', 'none']);
  fields(value, kind === 'text' ? ['kind', 'text'] : ['kind']);
  if (kind === 'clipboard' || kind === 'none') return { kind };
  const text = optionalText(value, 'text');
  if (kind === 'text' && text !== undefined) return { kind, text };
  throw new Error('Supply content.kind and, for text, content.text.');
}

function icon(data: JsonObject): Icon {
  if (data.icon === undefined) return { mode: 'default' };
  const value = object(data.icon, 'icon');
  const mode = choice(value, 'mode', ['default', 'standard', 'custom']);
  fields(value, mode === 'custom' ? ['mode', 'file'] : ['mode']);
  if (mode === 'custom') return { mode, file: validateVaultRelativePath(requiredText(value, 'file')) };
  if (mode) return { mode };
  throw new Error('Supply icon.mode.');
}

function help(host: AgentShortcutHost): object {
  return {
    ok: true, version: 1, vault: host.vaultName(),
    operations: { help: 'Describe available actions and fields', preview: 'Validate and show the URI and launch effect', create: 'Write the shortcut and return its path' },
    common: {
      name: 'Optional shortcut name (without the shortcut extension)',
      destination: host.windows ? 'desktop (default) or start-menu' : 'desktop',
      icon: '{mode:"default"} (default), {mode:"standard"}, or {mode:"custom",file:"vault-relative.png"} (PNG, JPEG, ICO)',
    },
    actions: {
      open: 'Omit file to open the vault. Use exact vault-relative file for a note or attachment. Optional navigation: {kind:"heading"|"block",value:"..."}.',
      new: 'Default mode is create. Use noteName for the default new-note location, file for an exact path, or folder with optional noteName. Empty folder means vault root. Blank name inside a folder uses Untitled.md. For append, prepend or replace, give an existing Markdown file.',
      daily: 'Opens today’s note by default. Use mode append, prepend or replace for capture. Requires the Daily notes core plugin.',
      unique: 'Creates a unique note on launch. Requires the Unique note creator core plugin.',
      search: 'Use query (e.g. "tag:#project/travel") or folder (includes descendants). Empty folder means vault root. Requires the Search core plugin.',
    },
    fields: actionFields,
    options: {
      content: '{kind:"clipboard"} is the writing default. Use {kind:"text",text:"..."} for fixed text or {kind:"none"} for content-free creation. Daily open takes no content.',
      writing: 'Replace overwrites existing note contents at launch. Optional heading and spacing (auto, newline, inline) require append or prepend. Optional boolean silent suppresses opening for writes.',
      paneType: 'tab, split or window, where applicable',
      vaultId: 'Optional, device-local 16-character ID for open or writing to an existing file. The official Obsidian CLI verifies it. Name mode is the default and works without the CLI. Duplicate vault names can be ambiguous.',
    },
    examples: [
      { action: 'open', file: 'Plans/Packing list.md', name: 'Packing list' },
      { action: 'new', folder: 'Inbox', name: 'Capture to inbox' },
      { action: 'daily', mode: 'append', destination: 'desktop', content: { kind: 'clipboard' } },
      { action: 'search', query: 'tag:#project/travel' },
    ],
    result: 'Preview returns URI, filename, destination and launchEffect. Create also returns the absolute path. If icon application fails after writing, the error also includes path and URI.',
  };
}

async function prepare(body: unknown, host: AgentShortcutHost) {
  const data = object(body, 'Request');
  const action = choice(data, 'action', ['open', 'new', 'daily', 'unique', 'search']);
  if (!action) throw new Error('Supply an action from the help operation.');
  fields(data, [...common, ...actionFields[action]]);
  const destination = choice(data, 'destination', ['desktop', 'start-menu']) ?? 'desktop';
  if (destination === 'start-menu' && !host.windows) throw new Error('The Start menu destination is available on Windows.');
  const selection = icon(data);
  const label = optionalText(data, 'name');
  if (label !== undefined && !label.trim()) throw new Error('Enter a shortcut name.');
  const vault = host.vaultName();
  const file = optionalText(data, 'file');
  if (file !== undefined) validateVaultRelativePath(file);
  const folder = optionalText(data, 'folder');
  if (folder) validateVaultRelativePath(folder);
  const paneType = choice(data, 'paneType', ['tab', 'split', 'window']);
  const vaultId = optionalText(data, 'vaultId');
  const mode = choice(data, 'mode', ['create', 'append', 'prepend', 'replace']) ?? 'create';
  const noteName = optionalText(data, 'noteName');
  if (action === 'new' && file !== undefined && (folder !== undefined || noteName !== undefined)) {
    throw new Error('Choose a file path or a folder and note name.');
  }
  if (action === 'new' && mode !== 'create' && file === undefined) {
    throw new Error('Supply an existing Markdown file for this writing mode.');
  }
  let context: ShortcutContext = { kind: 'general', currentVault: vault };
  let verify: Verify = () => {};
  let request: ShortcutRequest;
  let fallback = shortcutLabel(vault, file);

  if (file !== undefined && (action === 'open' || action === 'new' && mode !== 'create')) {
    const entry = host.file(file);
    if (!entry) throw new Error('No file has that exact vault-relative path. Include its extension.');
    const verified = vaultId === undefined ? undefined : await host.verifyVaultId(vaultId);
    context = { kind: 'file', vault, file, markdown: entry.markdown, vaultId: verified };
    verify = entry.verify;
  } else if (vaultId !== undefined) throw new Error('Vault ID mode requires an existing file.');

  if (folder !== undefined || action === 'new' && mode === 'create' && file !== undefined) {
    const parent = folder ?? file?.slice(0, Math.max(0, file.lastIndexOf('/'))) ?? '';
    const checkFolder = host.folder(parent);
    if (!checkFolder) throw new Error('No folder has that exact vault-relative path.');
    verify = checkFolder;
    context = { kind: 'folder', vault, folder: parent };
  }

  const target = { kind: 'vault' as const, vault: context.kind === 'file' ? context.vaultId ?? vault : vault, file };
  if (action === 'open') {
    const navigation = data.navigation === undefined ? undefined : object(data.navigation, 'navigation');
    if (navigation) fields(navigation, ['kind', 'value']);
    const kind = navigation && choice(navigation, 'kind', ['heading', 'block']);
    if (navigation && !kind) throw new Error('Supply navigation.kind.');
    request = { action, target, paneType, navigation: navigation && kind ? { kind, value: requiredText(navigation, 'value') } : undefined };
  } else if (action === 'search') {
    if (folder !== undefined && data.query !== undefined) throw new Error('Choose either a folder or a search query.');
    request = { action, vault, query: folder === undefined ? optionalText(data, 'query') : folderSearchQuery(folder) };
    fallback = `${folder || vault} - Search`;
  } else if (action === 'unique') {
    request = { action, vault, content: content(data), paneType };
    fallback = `${vault} - Unique note`;
  } else {
    const dailyOpen = action === 'daily' && mode === 'create';
    if (dailyOpen && (data.content !== undefined || data.silent !== undefined)) {
      throw new Error('Daily open takes no content or silent option. Choose append, prepend or replace for capture.');
    }
    const silent = data.silent;
    if (silent !== undefined && typeof silent !== 'boolean') throw new Error('silent must be a boolean.');
    const settings = { mode, content: dailyOpen ? { kind: 'none' as const } : content(data), paneType, silent,
      heading: optionalText(data, 'heading'), spacing: choice(data, 'spacing', ['auto', 'newline', 'inline']) };
    if (action === 'daily') {
      request = { action, vault, ...settings };
      fallback = `${vault} - Daily note`;
    } else {
      if (file !== undefined) request = { action, target, ...settings };
      else if (folder !== undefined) {
        const notePath = folderNotePath(folder, noteName ?? '');
        request = { action, target: { ...target, file: notePath }, ...settings };
        fallback = shortcutLabel(vault, notePath);
      } else {
        const name = noteName ?? 'Untitled';
        request = { action, target: { kind: 'name', vault, name }, ...settings };
        fallback = shortcutLabel(vault, name);
      }
    }
  }
  const uri = buildShortcutUri(request, context);
  return { request, context, uri, label: label ?? fallback, destination, selection, verify };
}

export function agentShortcutHandler(host: AgentShortcutHost) {
  return async (operation: AgentOperation, body: unknown, ensureActive: () => void): Promise<object> => {
    if (operation === 'help') return help(host);
    const prepared = await prepare(body, host);
    const saveIcon = await host.prepareIcon(prepared.selection);
    prepared.verify();
    const { request, context, uri, label, destination } = prepared;
    const { action, draft } = draftFromRequest(request, context);
    const result = { uri, destination, filename: `${sanitizeFilename(label)}.${host.extension}`,
      launchEffect: describeEffect(action, draft) };
    if (operation === 'preview') return { ok: true, ...result };
    ensureActive();
    const iconPath = await saveIcon();
    prepared.verify();
    ensureActive();
    try {
      const path = await host.creator(destination).createShortcut(request, label, { iconPath }, context);
      return { ok: true, ...result, filename: basename(path), path };
    } catch (error: unknown) {
      if (!(error instanceof ShortcutIconError)) throw error;
      return { ok: false, ...result, filename: basename(error.path), path: error.path, error: error.message };
    }
  };
}

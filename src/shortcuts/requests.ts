import { posix, win32 } from 'node:path';

export type PaneType = 'tab' | 'split' | 'window';
export type WriteMode = 'create' | 'append' | 'prepend' | 'replace';
export type ContentSource = { kind: 'none' } | { kind: 'text'; text: string } | { kind: 'clipboard' };
export type VaultFileTarget = { kind: 'vault'; vault: string; file?: string } | { kind: 'path'; path: string };
export type NewNoteTarget = VaultFileTarget | { kind: 'name'; vault: string; name: string };
export type ShortcutContext =
  | { readonly kind: 'general'; readonly currentVault: string }
  | { readonly kind: 'file'; readonly vault: string; readonly file: string; readonly markdown: boolean;
      /** Only populated after the host verifies the ID resolves to this vault. */
      readonly vaultId?: string };

export function normalizeVaultId(value: string): string {
  const id = value.trim();
  if (!/^[0-9a-f]{16}$/i.test(id)) throw new Error('Enter the 16-character vault ID copied from the vault switcher.');
  return id.toLowerCase();
}

interface WriteFields {
  mode: WriteMode;
  content: ContentSource;
  heading?: string;
  spacing?: 'auto' | 'newline' | 'inline';
  silent?: boolean;
  paneType?: PaneType;
  xSuccess?: string;
}

export type ShortcutRequest =
  | { action: 'open'; target: VaultFileTarget; navigation?: { kind: 'heading' | 'block'; value: string }; paneType?: PaneType }
  | ({ action: 'new'; target: NewNoteTarget } & WriteFields)
  | ({ action: 'daily'; vault: string } & WriteFields)
  | { action: 'unique'; vault: string; content: ContentSource; paneType?: PaneType; xSuccess?: string }
  | { action: 'search'; vault: string; query?: string }
  | { action: 'choose-vault' }
  | { action: 'hook-get-address'; vault?: string; xSuccess?: string; xError?: string };

function hasControl(value: string): boolean {
  return Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function required(value: string, label: string): string {
  if (!value.trim() || hasControl(value)) throw new Error(`${label} is required and cannot contain control characters.`);
  return value;
}

function filePath(value: string): string {
  required(value, 'File path');
  if (value.includes('#')) throw new Error('Files with # in their path cannot be targeted reliably by Obsidian URLs.');
  return value;
}

function vaultPath(value: string): string {
  filePath(value);
  if (value.startsWith('/') || value.includes('\\') || /^[a-z]:/i.test(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Use a file path relative to the vault, without parent-directory segments.');
  }
  return value;
}

function absolutePath(value: string): string {
  filePath(value);
  if (!(posix.isAbsolute(value) || win32.isAbsolute(value)) || /^[/\\][^/\\]/.test(value) && !posix.isAbsolute(value)) {
    throw new Error('Use an absolute native file path.');
  }
  return value;
}

function markdownWriteTarget(value: NewNoteTarget): void {
  const file = value.kind === 'path' ? value.path : value.kind === 'vault' ? value.file : undefined;
  const basename = file?.split(/[\\/]/).pop();
  if (basename?.includes('.') && !/\.md$/i.test(basename)) {
    throw new Error('Writing actions require a Markdown note, with .md or no file extension.');
  }
}

function callback(value: string): string {
  required(value, 'Callback URI');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error('A callback must be a URI with a scheme.');
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error('Enter a valid callback URI.'); }
  if (['javascript:', 'data:', 'vbscript:', 'file:', 'about:', 'blob:'].includes(parsed.protocol)) {
    throw new Error('Use an application or HTTP callback URI.');
  }
  return value;
}

function checkContext(request: ShortcutRequest, context?: ShortcutContext): void {
  if (!context) return;
  if (context.kind === 'file') {
    if (request.action !== 'open' && request.action !== 'new') throw new Error('This action cannot target the clicked file.');
    if (request.target.kind !== 'vault' ||
        (request.target.vault !== context.vault && (!context.vaultId || request.target.vault !== context.vaultId)) ||
        request.target.file !== context.file) {
      throw new Error('The shortcut must keep the clicked file and its vault.');
    }
    if (!context.markdown && (request.action !== 'open' || request.navigation !== undefined)) {
      throw new Error('Attachments support opening only, without Markdown navigation.');
    }
    if (request.action === 'new' && request.mode === 'create') throw new Error('Choose append, prepend or replace for an existing note.');
  } else if (request.action === 'new' && request.mode === 'create') {
    if (request.target.kind === 'path' || request.target.vault !== context.currentVault) {
      throw new Error('Create a note in the current vault.');
    }
  }
}

/** Serialize structured core URI actions; no clipboard or note data is read here. */
export function buildShortcutUri(request: ShortcutRequest, context?: ShortcutContext): string {
  checkContext(request, context);
  const parameters: [string, string][] = [];
  const add = (name: string, value: string): void => { parameters.push([name, value]); };
  const vault = (value: string): void => { add('vault', required(value, 'Vault')); };
  const pane = (value?: PaneType): void => {
    if (value === undefined) return;
    if (!['tab', 'split', 'window'].includes(value)) throw new Error('Choose a supported opening location.');
    add('paneType', value);
  };
  const target = (value: NewNoteTarget): void => {
    if (value.kind === 'path') add('path', absolutePath(value.path));
    else {
      vault(value.vault);
      if (value.kind === 'name') {
        const name = required(value.name, 'Note name');
        if (/[\\/#]/.test(name) || name === '.' || name === '..') throw new Error('Use a note name without path separators, parent-directory segments or #.');
        add('name', name);
      } else if (value.file !== undefined) add('file', vaultPath(value.file));
    }
  };
  const content = (value: ContentSource): void => {
    if (value.kind === 'text') {
      if (Array.from(value.text).some(character => character.charCodeAt(0) < 32 && !['\r', '\n', '\t'].includes(character))) {
        throw new Error('Note text contains unsupported control characters.');
      }
      add('content', value.text);
    } else if (value.kind === 'clipboard') add('clipboard', 'true');
    else if (value.kind !== 'none') throw new Error('Choose a supported content source.');
  };
  const success = (value?: string): void => { if (value !== undefined) add('x-success', callback(value)); };
  const write = (value: WriteFields): void => {
    if (!['create', 'append', 'prepend', 'replace'].includes(value.mode)) throw new Error('Choose a supported writing operation.');
    const merge = value.mode === 'append' || value.mode === 'prepend';
    if (!merge && (value.heading !== undefined || value.spacing !== undefined)) {
      throw new Error('Heading and spacing require append or prepend.');
    }
    if (value.mode !== 'create' && value.content.kind === 'none') throw new Error('Choose text or clipboard content for a writing operation.');
    if (value.mode === 'append' || value.mode === 'prepend') add(value.mode, 'true');
    else if (value.mode === 'replace') add('overwrite', 'true');
    content(value.content);
    if (value.heading !== undefined) add('heading', required(value.heading, 'Heading'));
    if (value.spacing !== undefined) {
      if (!['auto', 'newline', 'inline'].includes(value.spacing)) throw new Error('Choose supported content spacing.');
      add('spacing', value.spacing);
    }
    if (value.silent && value.paneType !== undefined) throw new Error('Opening location is unavailable when opening is suppressed.');
    if (value.silent) add('silent', 'true');
    else pane(value.paneType);
    success(value.xSuccess);
  };
  switch (request.action) {
    case 'open': {
      target(request.target);
      const file = request.target.kind === 'path' ? request.target.path : request.target.file;
      if (!file && (request.navigation !== undefined || request.paneType !== undefined)) {
        throw new Error('Navigation and opening location require a file.');
      }
      if (request.navigation !== undefined) {
        if (file && /\.[^/.]+$/.test(file) && !/\.md$/i.test(file)) throw new Error('Heading and block navigation require a Markdown note.');
        const navigation = required(request.navigation.value, 'Navigation target');
        if (navigation.includes('#') || request.navigation.kind === 'block' && !/^[a-z0-9-]+$/i.test(navigation)) {
          throw new Error('Enter a heading without # or a valid block ID.');
        }
        const index = parameters.findIndex(([key]) => key === 'file' || key === 'path');
        parameters[index][1] += `#${request.navigation.kind === 'block' ? '^' : ''}${navigation}`;
      }
      pane(request.paneType);
      break;
    }
    case 'new':
      if (request.target.kind === 'vault' && request.target.file === undefined) throw new Error('Choose a filename or file path for the new note.');
      markdownWriteTarget(request.target);
      target(request.target);
      write(request);
      break;
    case 'daily': vault(request.vault); write(request); break;
    case 'unique': vault(request.vault); content(request.content); pane(request.paneType); success(request.xSuccess); break;
    case 'search':
      vault(request.vault);
      if (request.query !== undefined) {
        if (hasControl(request.query)) throw new Error('Search query cannot contain control characters.');
        add('query', request.query);
      }
      break;
    case 'hook-get-address':
      if (request.vault !== undefined) vault(request.vault);
      success(request.xSuccess);
      if (request.xError !== undefined) add('x-error', callback(request.xError));
      break;
    case 'choose-vault': break;
    default: throw new Error('Choose a supported Obsidian URI action.');
  }
  return `obsidian://${request.action}` + (parameters.length ? `?${parameters.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}` : '');
}

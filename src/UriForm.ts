import type { ShortcutContext, ShortcutRequest, WriteMode } from './shortcuts/requests';

export type UriAction = 'open' | 'new' | 'append' | 'prepend' | 'replace' | 'daily' | 'unique' | 'search' | 'choose-vault' | 'hook-get-address';
export type Pane = '' | 'tab' | 'split' | 'window';
export interface UriDraft {
  vault: string;
  vaultReference: 'name' | 'id';
  file: string;
  name: string;
  targetMode: 'vault' | 'file' | 'path' | 'name';
  path: string;
  navigation: 'none' | 'heading' | 'block';
  anchor: string;
  contentSource: 'none' | 'text' | 'clipboard';
  text: string;
  heading: string;
  spacing: 'auto' | 'newline' | 'inline';
  silent: boolean;
  pane: Pane;
  query: string;
  dailyMode: 'open' | 'append' | 'prepend' | 'replace';
  xSuccess: string;
  xError: string;
}

export const ACTION_LABELS: Readonly<Record<UriAction, string>> = {
  open: 'Open vault or file', new: 'Create a note', append: 'Append to a note',
  prepend: 'Prepend to a note', replace: 'Replace a note’s contents', daily: 'Today’s daily note',
  unique: 'Create a unique note', search: 'Search', 'choose-vault': 'Open vault manager',
  'hook-get-address': 'Copy focused note address (Hook)',
};

export function availableActions(context: ShortcutContext): UriAction[] {
  if (context.kind === 'file') return context.markdown ? ['open', 'append', 'prepend', 'replace'] : ['open'];
  return ['open', 'new', 'append', 'prepend', 'replace', 'daily', 'unique', 'search', 'choose-vault', 'hook-get-address'];
}

export function initialDraft(context: ShortcutContext, action: UriAction): UriDraft {
  return {
    vault: context.kind === 'file' ? context.vault : context.currentVault, vaultReference: 'name',
    file: context.kind === 'file' ? context.file : '', name: '',
    targetMode: context.kind === 'file' || ['append', 'prepend', 'replace'].includes(action) ? 'file' : action === 'new' ? 'name' : 'vault',
    path: '', navigation: 'none', anchor: '', contentSource: action === 'new' || action === 'daily' ? 'none' : 'text',
    text: '', heading: '', spacing: 'auto', silent: false, pane: '', query: '', dailyMode: 'open', xSuccess: '', xError: '',
  };
}

export function requestFromDraft(action: UriAction, draft: UriDraft, context: ShortcutContext): ShortcutRequest {
  if (!availableActions(context).includes(action)) throw new Error('This action cannot target the clicked file.');
  if (context.kind === 'file' && draft.vaultReference === 'id' && !context.vaultId) throw new Error('Verify this vault ID before creating the shortcut, or use the vault name.');
  const vault = context.kind === 'file' ? draft.vaultReference === 'id' ? context.vaultId ?? context.vault : context.vault : action === 'new' ? context.currentVault : draft.vault;
  const file = context.kind === 'file' ? context.file : draft.file;
  const target = context.kind !== 'file' && draft.targetMode === 'path' ? { kind: 'path' as const, path: draft.path } :
    { kind: 'vault' as const, vault, ...(file && (context.kind === 'file' || draft.targetMode !== 'vault') ? { file } : {}) };
  const paneType = draft.pane || undefined;
  const content = draft.contentSource === 'text' ? { kind: 'text' as const, text: draft.text } : { kind: draft.contentSource };
  const xSuccess = draft.xSuccess || undefined;
  if (action === 'choose-vault') return { action };
  if (action === 'hook-get-address') return { action, vault: vault || undefined, xSuccess, xError: draft.xError || undefined };
  if (action === 'search') return { action, vault, query: draft.query };
  if (action === 'open') {
    const hasFile = target.kind === 'path' || Boolean(target.file);
    const path = target.kind === 'path' ? target.path : target.file ?? '';
    const markdown = !/\.[^/.]+$/.test(path) || /\.md$/i.test(path);
    return { action, target, ...(hasFile ? { paneType } : {}),
      ...(hasFile && markdown && draft.navigation !== 'none' ? { navigation: { kind: draft.navigation, value: draft.anchor } } : {}) };
  }
  if (action === 'unique') return { action, vault, content, paneType, xSuccess };
  const mode: WriteMode = action === 'daily' ? draft.dailyMode === 'open' ? 'create' : draft.dailyMode : action === 'new' ? 'create' : action;
  const merge = mode === 'append' || mode === 'prepend';
  const writing = { mode, content: action === 'daily' && draft.dailyMode === 'open' ? { kind: 'none' as const } : content,
    ...(merge ? { heading: draft.heading || undefined, spacing: draft.spacing } : {}),
    silent: action === 'daily' && draft.dailyMode === 'open' ? undefined : draft.silent || undefined,
    ...(draft.silent && !(action === 'daily' && draft.dailyMode === 'open') ? {} : { paneType }), xSuccess };
  if (action === 'daily') return { action, vault, ...writing };
  const newTarget = action === 'new' && draft.targetMode === 'name' ? { kind: 'name' as const, vault, name: draft.name } : target;
  return { action: 'new', target: newTarget, ...writing };
}

export function draftFromRequest(request: ShortcutRequest, context: ShortcutContext): { action: UriAction; draft: UriDraft } {
  const action = request.action === 'new' && request.mode !== 'create' ? request.mode : request.action;
  const draft = initialDraft(context, action);
  if ('vault' in request && request.vault !== undefined) draft.vault = request.vault;
  if ('target' in request) {
    if (request.target.kind === 'path') { draft.targetMode = 'path'; draft.path = request.target.path; }
    else {
      draft.vault = request.target.vault;
      if (request.target.kind === 'name') { draft.targetMode = 'name'; draft.name = request.target.name; }
      else if (request.target.file) { draft.targetMode = 'file'; draft.file = request.target.file; }
    }
  }
  if ('navigation' in request && request.navigation) { draft.navigation = request.navigation.kind; draft.anchor = request.navigation.value; }
  if ('paneType' in request) draft.pane = request.paneType ?? '';
  if ('content' in request) {
    draft.contentSource = request.content.kind;
    if (request.content.kind === 'text') draft.text = request.content.text;
  }
  if ('heading' in request) draft.heading = request.heading ?? '';
  if ('spacing' in request) draft.spacing = request.spacing ?? 'auto';
  if ('silent' in request) draft.silent = request.silent ?? false;
  if (request.action === 'daily') draft.dailyMode = request.mode === 'create' ? 'open' : request.mode;
  if (request.action === 'search') draft.query = request.query ?? '';
  if ('xSuccess' in request) draft.xSuccess = request.xSuccess ?? '';
  if ('xError' in request) draft.xError = request.xError ?? '';
  return { action, draft };
}

export function describeEffect(action: UriAction, draft: UriDraft): string {
  if (action === 'replace' || action === 'daily' && draft.dailyMode === 'replace') return 'When launched, replaces the target note’s contents. Repeated launches repeat the write.';
  if (action === 'append' || action === 'prepend' || action === 'daily' && draft.dailyMode !== 'open') return 'When launched, writes to the target note. Repeated launches repeat the write.';
  if (action === 'new') return 'When launched, creates a note. Literal text is stored in the shortcut; clipboard content is read only when launched.';
  if (action === 'unique') return 'When launched, creates a uniquely named note. Requires the Unique note creator core plugin.';
  if (action === 'daily') return 'When launched, opens today’s note using Daily notes settings. Requires the Daily notes core plugin.';
  if (action === 'search') return 'When launched, opens vault-wide search with this query.';
  if (action === 'hook-get-address') return 'When launched, uses the focused note, not a fixed file. Callbacks can receive note information.';
  if (action === 'choose-vault') return 'When launched, opens the vault manager.';
  return 'When launched, opens the selected vault or file. Creating this shortcut does not launch it.';
}

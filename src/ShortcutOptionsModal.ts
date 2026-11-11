import { App, Modal, Notice, Platform, Setting } from 'obsidian';
import type { ButtonComponent, TextComponent } from 'obsidian';
import { addIconControl } from './IconControl';
import type { IconSelection } from './IconControl';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';
import { buildShortcutUri } from './shortcuts/requests';
import type { ShortcutContext, ShortcutRequest } from './shortcuts/requests';
import { discoverVaults, discoveryErrorMessage } from './vaultDiscovery';
import { ACTION_LABELS, availableActions, describeEffect, draftFromRequest, initialDraft, requestFromDraft } from './UriForm';
import type { UriAction, UriDraft } from './UriForm';

export interface ShortcutOptionsModalOptions {
  context: ShortcutContext;
  defaultIcon?: string;
  initialIcon?: IconSelection;
  target?: ShortcutDestination;
  initialRequest?: ShortcutRequest;
  headingSuggestions?: readonly string[];
  blockSuggestions?: readonly string[];
  create: (request: ShortcutRequest, label: string, destination: ShortcutDestination, icon: IconSelection) => Promise<boolean>;
}

let nextDialog = 0;

export class ShortcutOptionsModal extends Modal {
  private generation = 0;
  constructor(app: App, private readonly options: ShortcutOptionsModalOptions) { super(app); }

  onOpen(): void {
    const generation = ++this.generation;
    const context = this.options.context;
    const currentVault = context.kind === 'file' ? context.vault : context.currentVault;
    const bound = context.kind === 'file';
    const allowed = availableActions(context);
    const seeded = this.options.initialRequest ? draftFromRequest(this.options.initialRequest, context) : undefined;
    let action: UriAction = seeded && allowed.includes(seeded.action) ? seeded.action : 'open';
    const drafts = new Map<UriAction, UriDraft>();
    if (seeded && allowed.includes(seeded.action)) drafts.set(seeded.action, seeded.draft);
    let draft = drafts.get(action) ?? initialDraft(context, action);
    drafts.set(action, draft);
    let target: ShortcutDestination = Platform.isWin ? this.options.target ?? 'desktop' : 'desktop';
    let icon: IconSelection = this.options.initialIcon ?? { mode: draft.vault !== currentVault ? 'standard' : 'default' };
    let busy = false;
    let nameEdited = false;
    let label = '';
    let request: ShortcutRequest | undefined;
    let uri = '';
    let createButton: ButtonComponent | undefined;
    let nameInput: TextComponent | undefined;
    let importing = (): boolean => false;
    let discovery: Promise<string[]> | undefined;
    let validateIcon = (): string | undefined => undefined;
    const live = (): boolean => this.generation === generation;
    this.setTitle('Create shortcut with options');
    this.modalEl.addClass('vault-shortcuts-uri-modal');
    this.contentEl.addClass('vault-shortcuts-uri-content');
    this.contentEl.createEl('p', { text: bound ? `${currentVault} / ${context.file}` : currentVault, cls: 'vault-shortcuts-uri-origin' });
    const previewSetting = new Setting(this.contentEl).setName('URI preview');
    const preview = previewSetting.controlEl.createEl('textarea', { cls: 'vault-shortcuts-uri-preview', attr: { 'aria-label': 'URI preview', rows: '3', spellcheck: 'false' } });
    preview.readOnly = true;
    previewSetting.addButton(button => button.setButtonText('Copy URI').onClick(async () => {
      if (!uri || !live()) return;
      try {
        const clipboard = this.contentEl.ownerDocument.defaultView?.navigator.clipboard;
        if (!clipboard) throw new Error('Clipboard is unavailable in this window.');
        await clipboard.writeText(uri);
        if (live()) new Notice('URI copied.');
      } catch (error: unknown) { if (live()) new Notice(`Could not copy URI: ${error instanceof Error ? error.message : String(error)}`); }
    }));
    const tabBar = new Setting(this.contentEl).setClass('vault-shortcuts-uri-tabs');
    tabBar.settingEl.setAttribute('role', 'tablist');
    tabBar.settingEl.setAttribute('aria-label', 'Shortcut options');
    const panels = this.contentEl.createDiv({ cls: 'vault-shortcuts-uri-panels' });
    const generalPanel = panels.createDiv();
    const advancedPanel = panels.createDiv();
    const tabGroup = `vault-shortcuts-tabs-${++nextDialog}`;
    const tabs: HTMLButtonElement[] = [];
    const selectTab = (selected: number, focus = false): void => {
      if (!live()) return;
      for (const [index, tab] of tabs.entries()) {
        const active = index === selected;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      }
      generalPanel.hidden = selected !== 0;
      advancedPanel.hidden = selected !== 1;
      panels.scrollTop = 0;
      if (focus) tabs[selected]?.focus();
    };
    for (const [index, [label, panel]] of ([['General', generalPanel], ['Advanced', advancedPanel]] as const).entries()) {
      const tabId = `${tabGroup}-${index}`;
      panel.id = `${tabId}-panel`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.tabIndex = 0;
      tabBar.addButton(button => {
        const tab = button.buttonEl;
        tabs.push(tab);
        tab.id = tabId;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', panel.id);
        button.setButtonText(label).onClick(() => selectTab(index));
        tab.onkeydown = event => {
          const next = event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? (index + 1) % 2 :
            event.key === 'Home' ? 0 : event.key === 'End' ? 1 : undefined;
          if (next === undefined) return;
          event.preventDefault();
          selectTab(next, true);
        };
      });
    }
    selectTab(0);
    new Setting(generalPanel).setName('Shortcut name').setDesc('Display filename only; the URI target stays independent.').addText(input => {
      nameInput = input;
      input.inputEl.setAttribute('data-uri-field', 'label');
      input.onChange(value => { nameEdited = true; label = value; refresh(); });
    });
    if (Platform.isWin) new Setting(generalPanel).setName('Destination').addDropdown(dropdown => dropdown
      .addOption('desktop', 'Desktop').addOption('start-menu', 'Start menu').setValue(target)
      .onChange(value => { target = value === 'start-menu' ? 'start-menu' : 'desktop'; }));
    if (Platform.isWin) {
      const setting = new Setting(generalPanel).setName('Shortcut icon');
      const custom = generalPanel.createDiv();
      const group = `vault-shortcuts-icon-${++nextDialog}`;
      let customPath = icon.mode === 'custom' ? icon.path : undefined;
      let mode: 'default' | 'custom' | 'standard' = icon.mode;
      const radios = new Map<string, HTMLInputElement>();
      for (const [value, text] of [['default', 'Vault default'], ['custom', 'Custom image'], ['standard', 'Obsidian icon']] as const) {
        const item = setting.controlEl.createEl('label', { cls: 'vault-shortcuts-icon-choice' });
        const radio = item.createEl('input', { type: 'radio', attr: { name: group, value } });
        radio.checked = value === mode;
        item.createSpan({ text });
        radios.set(value, radio);
        radio.onchange = () => {
          if (busy || importing()) { radio.checked = false; const previous = radios.get(mode); if (previous) previous.checked = true; return; }
          mode = value;
          icon = value === 'custom' && customPath ? { mode: 'custom', path: customPath } : { mode: value === 'default' ? 'default' : 'standard' };
          custom.hidden = value !== 'custom';
          refresh();
        };
      }
      custom.hidden = mode !== 'custom';
      // The custom picker must not display the vault default as though it were
      // an explicitly imported custom image when no custom image exists yet.
      importing = addIconControl(custom, icon.mode === 'custom' ? icon : { mode: 'standard' }, selection => {
        icon = selection;
        if (selection.mode === 'custom') customPath = selection.path;
        mode = selection.mode === 'custom' ? 'custom' : 'standard';
        for (const [value, radio] of radios) radio.checked = value === mode;
        custom.hidden = mode !== 'custom';
        refresh();
        return Promise.resolve();
      }, undefined, false);
      generalPanel.createEl('p', { cls: 'vault-shortcuts-icon-status', text: 'Other-vault targets use the Obsidian icon unless you choose a custom image.' });
      validateIcon = () => mode === 'custom' && !customPath ? 'Choose an image for the custom icon.' : undefined;
    }
    new Setting(advancedPanel).setName('Action').addDropdown(dropdown => {
      for (const item of allowed) dropdown.addOption(item, ACTION_LABELS[item]);
      dropdown.setValue(action).onChange(value => {
        const next = allowed.find(item => item === value);
        if (!next || busy) return;
        action = next;
        draft = drafts.get(action) ?? initialDraft(context, action);
        drafts.set(action, draft);
        renderFields();
      });
      dropdown.selectEl.setAttribute('data-uri-field', 'action');
    });
    if (bound) advancedPanel.createEl('p', { text: context.markdown ? 'Vault and file stay fixed to the clicked note for both navigation and writing.' : 'Attachments support opening only. Vault and file stay fixed.', cls: 'vault-shortcuts-icon-status' });
    const fields = advancedPanel.createDiv({ cls: 'vault-shortcuts-uri-fields' });
    const effect = this.contentEl.createEl('p', { cls: 'vault-shortcuts-uri-effect', attr: { 'aria-live': 'polite' } });
    const validation = this.contentEl.createEl('p', { cls: 'vault-shortcuts-uri-validation', attr: { role: 'status', 'aria-live': 'polite' } });
    const footer = new Setting(this.contentEl).setClass('vault-shortcuts-uri-footer');
    footer.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()));
    footer.addButton(button => {
      createButton = button;
      button.setButtonText('Create shortcut').setCta().onClick(async () => {
        if (busy || !live()) return;
        if (importing()) { new Notice('Wait for the icon import to finish.'); return; }
        refresh();
        if (!request || !label.trim() || validateIcon()) return;
        const snapshot = request;
        const selectedIcon = icon.mode === 'default' && draft.vault !== currentVault && context.kind === 'general' && action !== 'new' ? { mode: 'standard' as const } : icon;
        busy = true; button.setDisabled(true);
        try {
          if (await this.options.create(snapshot, label, target, selectedIcon) && live()) this.close();
        } catch (error: unknown) {
          if (live()) new Notice(`Could not create shortcut: ${error instanceof Error ? error.message : String(error)}`);
        } finally { busy = false; if (live()) refresh(); }
      });
    });
    const refresh = (): void => {
      if (!live()) return;
      if (!nameEdited) {
        const identity = bound ? context.file.split('/').pop() : draft.targetMode === 'file' ? draft.file : draft.targetMode === 'name' ? draft.name : draft.targetMode === 'path' ? draft.path : draft.vault;
        label = `${identity || currentVault} - ${action === 'open' ? 'Obsidian' : ACTION_LABELS[action]}`;
        nameInput?.setValue(label);
      }
      effect.setText(describeEffect(action, draft));
      try {
        request = requestFromDraft(action, draft, context);
        uri = buildShortcutUri(request, context);
        const iconError = validateIcon();
        if (iconError) throw new Error(iconError);
        if (!label.trim()) throw new Error('Enter a shortcut name.');
        validation.setText('');
      } catch (error: unknown) {
        request = undefined; uri = '';
        validation.setText(error instanceof Error ? error.message : String(error));
      }
      preview.value = uri;
      createButton?.setDisabled(busy || !request);
    };
    const renderFields = (): void => {
      fields.empty();
      const active = draft;
      const text = (container: HTMLElement, key: string, name: string, value: string, change: (value: string) => void, help = '', locked = false): HTMLInputElement => {
        let element: HTMLInputElement | undefined;
        new Setting(container).setName(name).setDesc(help).addText(input => {
          element = input.inputEl;
          input.inputEl.setAttribute('data-uri-field', key);
          input.inputEl.readOnly = locked;
          input.setValue(value).onChange(next => {
            if (locked) return;
            const focused = input.inputEl.ownerDocument.activeElement === input.inputEl;
            const start = input.inputEl.selectionStart;
            const end = input.inputEl.selectionEnd;
            change(next);
            if (focused && !input.inputEl.isConnected) {
              const replacement = fields.querySelector<HTMLInputElement>(`[data-uri-field="${key}"]`);
              replacement?.focus();
              replacement?.setSelectionRange(start, end);
            }
            refresh();
          });
        });
        if (!element) throw new Error('Text control could not be created.');
        return element;
      };
      const select = (container: HTMLElement, key: string, name: string, value: string, choices: readonly (readonly [string, string])[], change: (value: string) => void): void => {
        new Setting(container).setName(name).addDropdown(dropdown => {
          for (const [id, label] of choices) dropdown.addOption(id, label);
          dropdown.selectEl.setAttribute('data-uri-field', key);
          dropdown.setValue(value).onChange(next => { change(next); refresh(); });
        });
      };
      const toggle = (container: HTMLElement, key: string, name: string, value: boolean, change: (value: boolean) => void): void => {
        new Setting(container).setName(name).addToggle(control => {
          control.toggleEl.setAttribute('data-uri-field', key);
          control.setValue(value).onChange(next => { change(next); refresh(); });
        });
      };
      const isWrite = ['new', 'append', 'prepend', 'replace', 'daily', 'unique'].includes(action);
      const fileAction = ['open', 'new', 'append', 'prepend', 'replace'].includes(action);
      const manager = action === 'choose-vault';
      if (!manager && !(fileAction && !bound && active.targetMode === 'path')) {
        const vault = text(fields, 'vault', 'Vault name or ID', bound ? context.vault : action === 'new' ? currentVault : active.vault,
          value => { active.vault = value; }, bound ? 'Fixed to the clicked file.' : action === 'new' ? 'New notes use the current vault.' : 'Use an exact known vault name or ID.', bound || action === 'new');
        if (!bound && action !== 'new') {
          const details = fields.createEl('details');
          details.createEl('summary', { text: 'Choose a known vault' });
          const status = details.createEl('p', { text: 'Loading known vaults…' });
          const list = details.createEl('select', { cls: 'vault-shortcuts-vault-list', attr: { size: '4', 'aria-label': 'Known vaults' } });
          list.disabled = true;
          list.onchange = () => { active.vault = list.value; vault.value = list.value; refresh(); };
          discovery ??= discoverVaults(Platform.isWin);
          void discovery.then(names => {
            if (!live() || draft !== active || !details.isConnected) return;
            for (const name of names) list.createEl('option', { value: name, text: name });
            list.selectedIndex = -1; list.disabled = names.length === 0;
            status.setText(names.length ? 'Select a vault or enter its name manually.' : 'No known vaults returned. Manual entry is available.');
          }).catch((error: unknown) => { if (live() && details.isConnected) status.setText(discoveryErrorMessage(error)); });
        }
      }
      if (fileAction) {
        if (!bound) {
          const choices: [string, string][] = action === 'new' ? [['name', 'Default new-note location'], ['file', 'Vault-relative file path']] :
            action === 'open' ? [['vault', 'Vault only'], ['file', 'File in vault'], ['path', 'Absolute file path (advanced)']] : [['file', 'File in vault'], ['path', 'Absolute file path (advanced)']];
          select(fields, 'target-mode', 'Target', active.targetMode, choices, value => {
            const mode = choices.find(([id]) => id === value)?.[0];
            if (mode === 'vault' || mode === 'file' || mode === 'path' || mode === 'name') active.targetMode = mode;
            renderFields();
          });
        }
        const isMarkdown = (value: string): boolean => !/\.[^/.]+$/.test(value) || /\.md$/i.test(value);
        const updateFile = (key: 'file' | 'path', value: string): void => {
          const changedType = isMarkdown(active[key]) !== isMarkdown(value);
          active[key] = value;
          if (!isMarkdown(value)) active.navigation = 'none';
          if (changedType) renderFields();
        };
        if (bound || active.targetMode === 'file') text(fields, 'file', 'File path', bound ? context.file : active.file,
          value => { updateFile('file', value); }, bound ? 'Fixed to the clicked file.' : 'Vault-relative path including the full extension.', bound);
        if (!bound && active.targetMode === 'path') text(fields, 'path', 'Absolute file path', active.path, value => { updateFile('path', value); }, 'Native absolute path; replaces the vault/file target.');
        if (!bound && active.targetMode === 'name') text(fields, 'name', 'Note name', active.name, value => { active.name = value; }, 'Created in the vault’s configured new-note location.');
      }
      if (action === 'open' && (bound ? context.markdown : active.targetMode !== 'vault')) {
        const navigation = fields.createDiv();
        const path = bound ? context.file : active.targetMode === 'path' ? active.path : active.file;
        const markdown = !/\.[^/.]+$/.test(path) || /\.md$/i.test(path);
        if (markdown) {
          select(navigation, 'navigation', 'Jump to', active.navigation, [['none', 'Start of note'], ['heading', 'Heading'], ['block', 'Block ID']], value => {
            active.navigation = value === 'heading' || value === 'block' ? value : 'none'; renderFields();
          });
          if (active.navigation !== 'none') {
            const input = text(navigation, 'anchor', active.navigation === 'heading' ? 'Heading' : 'Block ID', active.anchor, value => { active.anchor = value; });
            const suggestions = active.navigation === 'heading' ? this.options.headingSuggestions : this.options.blockSuggestions;
            if (suggestions?.length && bound) {
              const id = `vault-shortcuts-navigation-${++nextDialog}`;
              const list = navigation.createEl('datalist', { attr: { id } });
              input.setAttribute('list', id);
              for (const value of suggestions) list.createEl('option', { value });
            }
          }
        }
      }
      if (action === 'search') text(fields, 'query', 'Search query', active.query, value => { active.query = value; }, 'Empty query opens search. Tag searches can use tag:#parent/child.');
      if (action === 'daily') select(fields, 'daily-mode', 'When launched', active.dailyMode,
        [['open', 'Open today’s note'], ['append', 'Append'], ['prepend', 'Prepend'], ['replace', 'Replace contents']], value => {
          active.dailyMode = value === 'append' || value === 'prepend' || value === 'replace' ? value : 'open';
          if (active.dailyMode !== 'open' && active.contentSource === 'none') active.contentSource = 'text';
          renderFields();
        });
      if (isWrite && !(action === 'daily' && active.dailyMode === 'open')) {
        const choices: [string, string][] = [['text', 'Specified text'], ['clipboard', 'Clipboard when launched']];
        if (action === 'new' || action === 'unique') choices.push(['none', 'No initial content']);
        select(fields, 'content-source', 'Content source', active.contentSource, choices, value => {
          active.contentSource = value === 'none' || value === 'clipboard' ? value : 'text'; renderFields();
        });
        if (active.contentSource === 'text') new Setting(fields).setName('Content').setDesc('Stored inside the shortcut.').addTextArea(input => {
          input.inputEl.setAttribute('data-uri-field', 'text');
          input.inputEl.rows = 4;
          input.setValue(active.text).onChange(value => { active.text = value; refresh(); });
        });
        const merge = action === 'append' || action === 'prepend' || action === 'daily' && (active.dailyMode === 'append' || active.dailyMode === 'prepend');
        if (merge) {
          text(fields, 'heading', 'Target heading (optional)', active.heading, value => { active.heading = value; });
          select(fields, 'spacing', 'Spacing', active.spacing, [['auto', 'Blank line'], ['newline', 'New line'], ['inline', 'Inline']], value => {
            active.spacing = value === 'newline' || value === 'inline' ? value : 'auto';
          });
        }
        if (action !== 'unique') toggle(fields, 'silent', 'Don’t open after writing', active.silent, value => { active.silent = value; renderFields(); });
      }
      const paneEnabled = action === 'open' && (bound || active.targetMode !== 'vault') || action === 'unique' || isWrite && (!active.silent || action === 'daily' && active.dailyMode === 'open');
      if (paneEnabled) select(fields, 'pane', 'Open in', active.pane, [['', 'Current tab'], ['tab', 'New tab'], ['split', 'New tab group'], ['window', 'New window']], value => {
        active.pane = value === 'tab' || value === 'split' || value === 'window' ? value : '';
      });
      if (isWrite || action === 'hook-get-address') {
        const advanced = fields.createEl('details');
        advanced.createEl('summary', { text: 'Callbacks' });
        advanced.createEl('p', { text: 'The callback app may receive note information. Obsidian controls callback permissions.', cls: 'vault-shortcuts-icon-status' });
        text(advanced, 'x-success', 'On success', active.xSuccess, value => { active.xSuccess = value; });
        if (action === 'hook-get-address') text(advanced, 'x-error', 'On error', active.xError, value => { active.xError = value; });
      }
      refresh();
    };
    renderFields();
  }
  onClose(): void { ++this.generation; this.contentEl.empty(); }
}

import { addIconControl } from './IconControl';
import type { IconSelection } from './IconControl';
import { App, Modal, Notice, Platform, Setting } from 'obsidian';
import { discoveryErrorMessage, discoverVaults } from './vaultDiscovery';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';

export class OtherVaultModal extends Modal {
  private generation = 0;

  constructor(app: App, private readonly create: (vaultName: string, target: ShortcutDestination, icon?: IconSelection) => Promise<void>,
    private readonly configure?: (vaultName: string, target: ShortcutDestination, icon: IconSelection) => void) {
    super(app);
  }

  onOpen(): void {
    const generation = ++this.generation;
    this.setTitle('Create shortcut to another vault');
    let name = '';
    let target: ShortcutDestination = 'desktop';
    let busy = false;
    let icon: IconSelection = { mode: 'standard' };
    const status = this.contentEl.createEl('p', { text: 'Loading known vaults…' });
    const list = this.contentEl.createEl('select', {
      cls: 'vault-shortcuts-vault-list',
      attr: { 'aria-label': 'Known vaults', size: '6' },
    });
    list.disabled = true;
    let selectedNameChanged = (): void => {};
    let updateOptions = (): void => {};
    new Setting(this.contentEl).setName('Or enter a vault name or ID')
      .setDesc('Use the exact name of a known vault. For duplicate names, use its vault ID.')
      .addText(input => {
        input.onChange(value => {
          name = value;
          list.selectedIndex = -1;
          selectedNameChanged();
        });
        list.onchange = () => {
          name = list.value;
          input.setValue('');
          selectedNameChanged();
        };
      });
    if (Platform.isWin) {
      new Setting(this.contentEl).setName('Destination').addDropdown(dropdown => dropdown
        .addOption('desktop', 'Desktop').addOption('start-menu', 'Start menu')
        .onChange(value => { target = value === 'start-menu' ? 'start-menu' : 'desktop'; }));
    }
    const importing = Platform.isWin ? addIconControl(this.contentEl, icon, value => { icon = value; return Promise.resolve(); }, undefined, false) : () => false;
    new Setting(this.contentEl).addButton(button => {
      selectedNameChanged = () => { button.setDisabled(busy || !name.trim()); updateOptions(); };
      button.setButtonText('Create shortcut').setCta().setDisabled(true).onClick(async () => {
        if (busy || !name.trim() || this.generation !== generation) return;
        if (importing()) { new Notice('Wait for the icon import to finish.'); return; }
        busy = true;
        selectedNameChanged();
        try { await this.create(name, target, icon); }
        finally {
          busy = false;
          if (this.generation === generation) selectedNameChanged();
        }
      });
    });
    if (this.configure) new Setting(this.contentEl).addButton(button => {
      updateOptions = () => { button.setDisabled(busy || !name.trim()); };
      button.setButtonText('More options…').setDisabled(true).onClick(() => {
        if (busy || !name.trim() || importing() || this.generation !== generation) return;
        this.configure?.(name, target, icon);
        this.close();
      });
    });
    void discoverVaults(Platform.isWin).then(names => {
      if (this.generation !== generation) return;
      for (const vault of names) list.createEl('option', { value: vault, text: vault });
      list.selectedIndex = -1;
      list.disabled = names.length === 0;
      status.setText(names.length ? 'Select a vault, then create its shortcut.' :
        'No known vaults were returned. Enter a vault name manually below.');
    }).catch((error: unknown) => {
      if (this.generation === generation) status.setText(discoveryErrorMessage(error));
    });
  }

  onClose(): void {
    ++this.generation;
    this.contentEl.empty();
  }
}

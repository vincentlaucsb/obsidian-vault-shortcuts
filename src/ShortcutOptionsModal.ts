import { App, Modal, Notice, Setting } from 'obsidian';
import { addIconControl } from './IconControl';
import type { IconSelection } from './IconControl';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';

export class ShortcutOptionsModal extends Modal {
  private generation = 0;
  constructor(app: App, private readonly defaultPath: string | undefined,
    private readonly initialTarget: ShortcutDestination,
    private readonly create: (target: ShortcutDestination, icon: IconSelection) => Promise<boolean>) { super(app); }

  onOpen(): void {
    const generation = ++this.generation;
    this.setTitle('Create shortcut with options');
    let icon: IconSelection = { mode: 'default' };
    let target = this.initialTarget;
    let busy = false;
    new Setting(this.contentEl).setName('Destination').addDropdown(dropdown => dropdown
      .addOption('desktop', 'Desktop').addOption('start-menu', 'Start menu').setValue(target)
      .onChange(value => { target = value === 'start-menu' ? 'start-menu' : 'desktop'; }));
    const importing = addIconControl(this.contentEl, icon, value => { icon = value; return Promise.resolve(); }, this.defaultPath);
    new Setting(this.contentEl).addButton(button => button.setButtonText('Create shortcut').setCta().onClick(async () => {
      if (busy || this.generation !== generation) return;
      if (importing()) { new Notice('Wait for the icon import to finish.'); return; }
      busy = true; button.setDisabled(true);
      try { if (await this.create(target, icon) && this.generation === generation) this.close(); }
      finally { busy = false; if (this.generation === generation) button.setDisabled(false); }
    }));
  }
  onClose(): void { ++this.generation; this.contentEl.empty(); }
}

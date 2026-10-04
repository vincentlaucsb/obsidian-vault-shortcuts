import { App, Modal, Platform, Setting } from 'obsidian';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';

export class TagShortcutModal extends Modal {
  private generation = 0;

  constructor(
    app: App,
    private readonly tags: readonly string[],
    private readonly create: (tag: string, target: ShortcutDestination) => Promise<boolean>,
  ) {
    super(app);
  }

  onOpen(): void {
    const generation = ++this.generation;
    this.setTitle('Create tag shortcut');
    let selected: string | undefined;
    let target: ShortcutDestination = 'desktop';
    let busy = false;
    let updateButton = (): void => {};
    this.contentEl.createEl('p', {
      text: 'Choose a tag from this note. The shortcut opens its search results in this vault.',
    });
    const list = this.contentEl.createEl('select', {
      cls: 'vault-shortcuts-tag-list',
      attr: { 'aria-label': 'Tags in this note', size: '6' },
    });
    // Avoid the unselected native listbox state present during the reported
    // Windows flicker before the first click, without preselecting a real tag.
    const placeholder = list.createEl('option', { value: '', text: 'Select a tag' });
    placeholder.disabled = true;
    for (const tag of this.tags) list.createEl('option', { value: tag, text: tag });
    list.selectedIndex = 0;
    list.onchange = () => {
      selected = this.tags.find(tag => tag === list.value);
      updateButton();
    };
    if (Platform.isWin) {
      new Setting(this.contentEl).setName('Destination').addDropdown(dropdown => dropdown
        .addOption('desktop', 'Desktop').addOption('start-menu', 'Start menu').setValue('desktop')
        .onChange(value => { target = value === 'start-menu' ? 'start-menu' : 'desktop'; }));
    }
    new Setting(this.contentEl).addButton(button => {
      updateButton = () => { button.setDisabled(busy || !selected); };
      button.setButtonText('Create shortcut').setCta().setDisabled(true).onClick(async () => {
        if (busy || !selected || this.generation !== generation) return;
        busy = true;
        updateButton();
        try {
          const created = await this.create(selected, target);
          if (created && this.generation === generation) this.close();
        } finally {
          busy = false;
          if (this.generation === generation) updateButton();
        }
      });
    });
  }

  onClose(): void {
    ++this.generation;
    this.contentEl.empty();
  }
}

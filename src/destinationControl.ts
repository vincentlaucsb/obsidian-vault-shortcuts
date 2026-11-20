import { Platform, Setting } from 'obsidian';
import type { ShortcutDestination } from './shortcuts/WindowsShortcutCreator';

export function addDestinationControl(
  container: HTMLElement, initial: ShortcutDestination, changed: (destination: ShortcutDestination) => void,
): void {
  if (!Platform.isWin) return;
  new Setting(container).setName('Destination').addDropdown(dropdown => dropdown
    .addOption('desktop', 'Desktop').addOption('start-menu', 'Start menu').setValue(initial)
    .onChange(value => { changed(value === 'start-menu' ? 'start-menu' : 'desktop'); }));
}

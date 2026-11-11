import { Modal } from './modal-fixture';
import type { ShortcutOptionsModalOptions } from '../src/ShortcutOptionsModal';

// Main-layer integration tests inspect requests at the modal boundary. The
// production modal itself is exercised separately by uri-modal tests.
export const optionDialogs: ShortcutOptionsModalOptions[] = [];
export class ShortcutOptionsModal extends Modal {
  constructor(app: unknown, private readonly options: ShortcutOptionsModalOptions) { super(app); }
  onOpen(): void { optionDialogs.push(this.options); }
}

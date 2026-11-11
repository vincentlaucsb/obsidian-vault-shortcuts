import type { IconSelection } from '../src/IconControl';

export interface IconControl {
  initial: IconSelection;
  defaultPath?: string;
  allowDefault: boolean;
  busy: boolean;
  change: (selection: IconSelection) => Promise<void>;
}
export const iconControls: IconControl[] = [];

export function addIconControl(
  _container: unknown, initial: IconSelection,
  changed: (selection: IconSelection) => Promise<void>,
  defaultPath?: string, allowDefault = true,
): () => boolean {
  const control = { initial, defaultPath, allowDefault, change: changed, busy: false };
  iconControls.push(control);
  return () => control.busy;
}

export function readIcon(path: string): Promise<Buffer> {
  return path.includes('missing') ? Promise.reject(new Error('Missing icon')) : Promise.resolve(Buffer.from('icon'));
}

export interface ContextMenuOptions {
  desktop: boolean;
  startMenu: boolean;
  tags: boolean;
}

export function readContextMenuOptions(data: unknown): ContextMenuOptions {
  return {
    desktop: typeof data === 'object' && data !== null && 'desktop' in data && typeof data.desktop === 'boolean' ? data.desktop : true,
    startMenu: typeof data === 'object' && data !== null && 'startMenu' in data && typeof data.startMenu === 'boolean' ? data.startMenu : true,
    tags: typeof data === 'object' && data !== null && 'tags' in data && typeof data.tags === 'boolean' ? data.tags : true,
  };
}

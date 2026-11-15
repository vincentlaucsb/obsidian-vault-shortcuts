// The leaf function is TypeScript-checked here and serialized for macOS's JXA
// host. It has no closures and receives paths as data, never interpolated code.
interface NativeImage { isNil(): boolean }
declare const ObjC: { import: (framework: string) => void };
declare const $: {
  NSImage: { alloc: { initWithContentsOfFile: (path: string) => NativeImage } };
  NSWorkspace: { sharedWorkspace: { setIconForFileOptions: (image: NativeImage, path: string, options: number) => boolean } };
};

export function macIconBridge(argv: readonly string[]): void {
  if (argv.length !== 2) throw new Error('Expected image and shortcut paths.');
  ObjC.import('AppKit');
  const image = $.NSImage.alloc.initWithContentsOfFile(argv[0]);
  if (image.isNil()) throw new Error('macOS could not load the icon image.');
  if (!$.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, argv[1], 0)) {
    throw new Error('macOS could not attach the custom file icon.');
  }
}

export function macIconArguments(imagePath: string, shortcutPath: string): string[] {
  return ['-l', 'JavaScript', '-e', `function run(argv) { (${macIconBridge.toString()})(argv); }`, imagePath, shortcutPath];
}

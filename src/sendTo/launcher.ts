interface ScriptHost {
  ScriptFullName: string;
  Arguments: { length: number; Item: (index: number) => string };
  Quit: (code: number) => never;
}
interface TextFile { Write: (value: string) => void; Close: () => void }
interface InputFile { ReadAll: () => string; Close: () => void }
interface FileSystem {
  BuildPath: (folder: string, name: string) => string;
  GetParentFolderName: (path: string) => string;
  GetTempName: () => string;
  FileExists: (path: string) => boolean;
  CreateTextFile: (path: string, overwrite: boolean, unicode: boolean) => TextFile;
  OpenTextFile: (path: string) => InputFile;
  MoveFile: (source: string, destination: string) => void;
}
interface ScriptShell { Popup: (message: string, seconds: number, title: string, style: number) => void }
interface DesktopShell {
  ShellExecute: (file: string, args: string, directory: string, verb: 'open', show: number) => void;
}
declare const ActiveXObject: {
  new (program: 'Scripting.FileSystemObject'): FileSystem;
  new (program: 'WScript.Shell'): ScriptShell;
  new (program: 'Shell.Application'): DesktopShell;
};

function openSendToVault(uri: string): void {
  new ActiveXObject('Shell.Application').ShellExecute(uri, '', '', 'open', 1);
}

// This leaf function is serialized for Windows Script Host's ES3 interpreter.
// Explorer arguments are data. All image and vault handling stays in the plugin.
function receiveImage(host: ScriptHost, files: FileSystem, openVault: (uri: string) => void): void {
  function publish(directory: string, temporary: string): void {
    function write(file: TextFile): void {
      try { file.Write(host.Arguments.Item(0) + '\n' + host.Arguments.Item(1)); }
      finally { file.Close(); }
    }
    if (!files.FileExists(files.BuildPath(directory, 'enabled'))) throw new Error('Install Windows Send to entries in Vault Shortcuts settings.');
    write(files.CreateTextFile(temporary, false, true));
    files.MoveFile(temporary, temporary + '.request');
  }
  function enqueue(directory: string): void {
    publish(directory, files.BuildPath(directory, files.GetTempName()));
    try { openVault(readVaultUri(files.OpenTextFile(files.BuildPath(directory, 'vault-open-uri')))); }
    catch (error: unknown) {
      new ActiveXObject('WScript.Shell').Popup('Image queued. Open the destination vault to finish importing. ' +
        (error instanceof Error ? error.message : String(error)), 12, 'Vault Shortcuts', 48);
    }
  }
  function readVaultUri(file: InputFile): string {
    function validate(uri: string): string {
      if (!/^obsidian:\/\/open\?path=(?:%[0-9A-F]{2}|[\w.!~*'()-])+$/.test(uri)) throw new Error('Invalid vault URL.');
      return uri;
    }
    try { return validate(file.ReadAll()); }
    finally { file.Close(); }
  }
  try {
    if (host.Arguments.length !== 2) throw new Error('Select one image and try again.');
    enqueue(files.GetParentFolderName(host.ScriptFullName));
  } catch (error: unknown) {
    new ActiveXObject('WScript.Shell').Popup(error instanceof Error ? error.message : String(error), 12, 'Vault Shortcuts', 48);
    host.Quit(1);
  }
}

export function sendToLauncher(): string {
  // Supply a fixed Shell verb so the encoded URL is data passed to Windows.
  return `(${receiveImage.toString()})(WScript, new ActiveXObject('Scripting.FileSystemObject'), ${openSendToVault.toString()});\r\n`;
}

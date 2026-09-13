import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLI_SETUP_HELP, discoverVaults, discoveryErrorMessage, parseVaultNames, runVaultCommand } from '../src/vaultDiscovery';

void test('verbose vault rows tolerate observed startup diagnostics without selecting them', () => {
  const output = '\r\n2026-09-13 22:33:24 Loading updated app package C:\\Users\\test\\obsidian.asar\r\n' +
    'Your Obsidian installer is out of date. Please download the latest installer which includes better CLI support: https://obsidian.md/download\n' +
    'Truck\tE:\\Obsidian\\Truck\nWork & café\t/home/user/Work & café\n';
  assert.deepEqual(parseVaultNames(output), ['Truck', 'Work & café']);
  assert.deepEqual(parseVaultNames('Truck\tE:\\Truck\nTruck\tE:\\Other\\Truck'), ['Truck']);
  for (const invalid of ['', 'CLI is disabled', 'Truck', 'Truck\trelative', 'Error\nTruck\tE:\\Truck']) {
    assert.throws(() => parseVaultNames(invalid), /response/);
  }
});

void test('CLI subprocess receives EOF and exits without Enter', async () => {
  const output = await runVaultCommand(process.execPath, ['-e',
    'process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("Truck\\tE:\\\\Truck\\n"));']);
  assert.deepEqual(parseVaultNames(output), ['Truck']);
});

void test('hanging CLI times out with a distinct actionable message', async () => {
  await assert.rejects(runVaultCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], 100), (error: unknown) => {
    assert.match(discoveryErrorMessage(error), /did not finish/);
    assert.doesNotMatch(discoveryErrorMessage(error), /not found/);
    return true;
  });
});

void test('missing CLI rejects promptly and setup guidance includes manual fallback', async () => {
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = '';
    for (const windows of [true, false]) {
      await assert.rejects(discoverVaults(windows), (error: unknown) => {
        assert.match(discoveryErrorMessage(error), /not found on PATH/);
        return true;
      });
    }
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
  assert.match(CLI_SETUP_HELP, /Settings → General → Command line interface/);
  assert.match(CLI_SETUP_HELP, /register the CLI on PATH/);
  assert.match(CLI_SETUP_HELP, /manually/);
});

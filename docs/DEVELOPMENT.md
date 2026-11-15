# Development and releases

Use Node 22.13.0 or newer for development. Install the locked dependencies, then run:

```text
npm ci --ignore-scripts
npm run lint
npm run build
npm test
npm audit
```

Copy `main.js`, `manifest.json` and `styles.css` to the `vault-shortcuts` folder in your vault's
configured plugins directory (normally `<vault>/.obsidian/plugins/vault-shortcuts/`).
Reload Obsidian and enable **Vault Shortcuts** in Community plugins. The stylesheet
sizes the vault list. The compiled JavaScript includes the plugin's runtime helpers.

Use a test vault when trying a development build.

The lockfile overrides Moment to 2.31.0 because the Obsidian typings pin an
affected version, and minimatch 7–10 to 11.0.1 for the lint toolchain advisory.
Recheck advisory ranges and dependency paths before changing either override.
These are development dependencies; the runtime bundle externalizes Obsidian.

## Development

Read [AGENTS.md](../AGENTS.md) for strict TypeScript and official Obsidian review rules,
and [PLAN.md](PLAN.md) for decisions and the creator interface. The runtime uses
`IShortcutCreator`, a public `ShortcutCreator` factory/facade and one creator per OS.
URI construction and safe file creation are shared.

Implementation lives in `src/`, with entry point `src/main.ts` and creators/helpers
in `src/shortcuts/`. Tests and fixtures live in `tests/`. Build configuration and
the generated `main.js` remain at the repository root, preserving installed symlinks.

`npm test` runs the fast suite. On Windows with Obsidian 1.15.0 installed,
`npm run test:ui` runs real-host Playwright regressions in fresh fictional vaults;
`npm run screenshots` generates the light/dark listing assets. Both commands build
first. See [UI testing](UI-TESTING.md) for executable selection, isolation,
reviewed visual baselines and the remaining native OS checks. Existing Linux CI
checks these TypeScript files but does not launch the Windows host.

## Releases

GitHub Actions runs lint, tests and the build for pushes to master and pull requests.
Check remote tags and releases before choosing a version. Keep an untagged,
unreleased candidate's planned version for validation/dependency fixes. Changed
source or artifacts already bound to a public release require a new patch version;
never move or rewrite its tag. Unchanged publication retries retain the version.

When publication is authorized, align manifest.json, the current versions.json
compatibility entry, package.json and package-lock.json (including its root
package entry), commit the changes, and push a matching x.y.z tag without a v
prefix. Push the version commit to master as well, so the
Community directory sees the correct manifest on the default branch.

The Release workflow builds that tag, checks that main.js, manifest.json and
styles.css are nonempty, and generates GitHub build-provenance attestations for
all three files before attaching them to a GitHub release. An attestation failure
stops publication. Generated main.js stays out
of source control. The workflow can also be run manually against an existing tag;
a rerun replaces same-named release attachments. Do not move published tags; use
a new version for changes. Linux CI skips the two native Windows integration tests;
run npm test on Windows before a release to exercise those as well.

The workflow uses `actions/attest@v4`, matching the csvzall release setup, with
`id-token: write` and `attestations: write` permissions scoped to the release job.
Editing the workflow or building locally does not attest existing downloads:
the updated workflow must successfully run for an authorized release. Verify each
downloaded asset afterward, for example:

```text
gh attestation verify main.js --repo vincentlaucsb/obsidian-vault-shortcuts
gh attestation verify manifest.json --repo vincentlaucsb/obsidian-vault-shortcuts
gh attestation verify styles.css --repo vincentlaucsb/obsidian-vault-shortcuts
```

See [GitHub's artifact attestation documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

Handle scorecard and validation feedback through the
[warning remediation procedure](obsidian-warning-remediation.md). Local success
does not prove a hosted scorecard has refreshed. A request to push source changes
does not itself request tagging, release publication or directory submission.


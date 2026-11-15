# November 15, 2026 review remediation

## Evidence

The supplied screenshot shows a pending master preview at `5335c68`, with
`manifest.json:6` rejected because the description contains “Obsidian”. Its
checks were explicitly incomplete. This review does not claim that pending
preview contained no further findings.

The [public scorecard](https://community.obsidian.md/plugins/vault-shortcuts#scorecard)
was retrieved on November 15 at 21:28 UTC using an inspected, workspace-only
adaptation of csvzall's evidence collector. All groups, including Other and
Disclosures, were read. The public listing is version 0.0.3, distinct from the
1.0.0 candidate and supplied preview. Remote tags and GitHub releases confirm
0.0.3 is the latest published version; retain the untagged 1.0.0 candidate.

Official policies, requirements, plugin guidelines, submission instructions and
declarative settings migration guidance were retrieved at documentation revision
`1c26772ac13d6e9870c865936d389fdfe694e742`. Raw evidence and normalized-content
hashes are in ignored `.test-build/obsidian-review/complete.json`.

## Findings and dispositions

| Finding | Disposition |
| --- | --- |
| Preview description contains “Obsidian” | Removed redundant branding; a TypeScript metadata regression checks this, description length/punctuation, desktop-only status and version alignment. |
| Missing attestations for main.js/styles.css | Release workflow now attests all three release files before uploading, with scoped permissions and failure blocking publication. Hosted clearance requires an authorized release run. |
| Direct filesystem access | Required for external shortcuts and retained icon assets; preserved and disclosed in README. Exclusive writes and context validation remain enforced. |
| Shell execution | Required for native directory queries, official CLI identity/discovery and macOS icon metadata. Fixed code, separate arguments, hidden Windows execution and bounded timeouts remain enforced. |
| Malware scan unavailable | External review-service limitation; no local code change can supply that scan. |
| Missing contributing guide | Added CONTRIBUTING.md with setup, checks, scoped contributions and private-data guidance. |
| Local dependency audit: 15 affected dependency entries | Patched Moment and scoped minimatch with documented overrides; compatible lockfile updates patch brace-expansion and fast-uri. Audit now reports zero vulnerabilities. |
| Windows concurrent icon reuse fails with EBUSY | Existing bounded verification loop now retries transient busy metadata/read failures. Persistent busy and other errors still surface; mismatched assets are never overwritten. Deterministic boundary tests cover recovery, exhaustion, access denial, mismatch and cleanup. |
| Stale README folder/heading and installation claims | Corrected; documented explicit Copy URI clipboard writes. Maintainer build/release instructions moved to docs/DEVELOPMENT.md. |
| Missing compatibility map | Added versions.json using verified historical tag minima and the current 1.15.0 minimum. Release workflow and tests check the current entry. |

The public scorecard also reports successful network-pattern, dependency,
obfuscation and reproducible-build checks for the published release. Those do
not establish candidate success. Maintenance, responsiveness and adoption are
repository metrics, not defects to conceal with code changes.

## Standing guidance

Adapted csvzall's review process, capability-warning treatment, deprecated-API
triage, native controls, dependency review, consumer README and candidate/public
version discipline into AGENTS and the new remediation/development documents.
Preserved project-specific rules; did not import CSV, mobile, helper-installation
or Sync behavior. No nonexistent review commands or skills are required.
Added explicit lint errors for unsupported/deprecated APIs, unsafe type
assertions, non-thenable awaits and runtime dynamic imports while retaining the
official recommended checks. No rule was weakened.

## Validation and limits

- Strict typecheck, official zero-warning lint and production build passed.
- All 52 tests passed, including native Windows checks and both new regressions.
- All seven isolated Windows Obsidian UI regressions passed after the storage
  fix, with unchanged visual baselines and synthetic-profile guards intact.
- Fresh `npm ci --ignore-scripts` and build passed in an isolated source fixture
  without `.git`, inherited node_modules or a prebuilt main.js; audit found zero
  vulnerabilities. The fixture is retained under ignored `.test-build/`.
- Bundle inspection found only Obsidian/Node external imports and no fixture or
  debug markers. No third-party runtime package is bundled by this change.
- Diff formatting and local documentation links were checked.
- Native macOS/Linux behavior remains experimental. Automated Windows UI tests
  do not prove native picker visibility, icon display or shortcut launching.

Source push to master is authorized. No release tag, publication, listing edit
or reviewer message is authorized by that push. Hosted warning clearance remains
unverified until the service reviews the relevant new source/release.

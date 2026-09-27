# Code review and cleanup

Version 0.21.1 · 2026-09-27

## Scope and outcome

Reviewed the three extension entry points, page identity/message boundaries, basic extraction, JEV request and cache orchestration, credential settings, IndexedDB transactions and backups, employer snapshots/matching, UI translations, tests, dependency use, generated assets and documentation.

This pass identified unused code and obsolete work products. The changes preserve basic no-Key use, JEV request semantics, employer matching and stored-data compatibility. No new runtime dependency, replacement provider or storage abstraction was introduced.

## Code changes

| Finding                                                                                                       | Resolution                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Four translation keys remained after the save-label and badge-query UI was removed                            | Removed `page.saveJob`, `page.saved`, `errors.badgesUnsupported` and `errors.badgesRead` from all five language catalogues |
| `isCanonicalSeekJobUrl` had no caller and duplicated checks already performed by the active message validator | Removed the unused function and re-export; retained the active page-identity checks and their tests                        |
| `OCCUPATION_SCOPE` remained as unused display metadata                                                        | Removed the constant and re-export; retained the complete occupation catalogue and taxonomy version                        |
| JEV normalization still exposed a generic model interface from the retired shared-provider design             | Made question construction and normalization private to the JEV module and used its concrete result type                   |
| Test setup still mocked the removed badge-query path                                                          | Removed the unused response case and storage mock; retained assertions that the retired request is never made              |
| Extension versions were separately hardcoded in the package and manifest config                               | Let WXT read the manifest version from `package.json`                                                                      |
| Formatting scripts omitted README, developer docs and Chrome locale metadata                                  | Added these maintained files to `format` and `format:check`                                                                |

JEV model, prompt, analysis and cache-version identifiers remain unchanged. Existing cache-identity, response-validation, retry, cancellation, authorization and backup regressions still pass.

## File cleanup

Moved these historical/generated work products out of the project:

- `.cache/`: retired Codex schemas, experiments, installer toolchains/downloads, smoke-test runtimes and old working backups.
- `.playwright-cli/`: old browser snapshots.
- `output/`: previous screenshots, synthetic browser profile, evaluation reports, source/package snapshots and generated skill archive.
- `.output/`: previous builds, regenerated for the current release.
- Release ZIPs for 0.20.0 and 0.21.0, and the root `.DS_Store`.

The recoverable archive is `../SEEK-FILTER-cleanup-20260927-194144`, relative to the project root. It also contains a pre-edit source snapshot and `cleanup.json`. These are historical evidence, not runtime dependencies. New `output/` contents contain only verification reports from this review.

Preserved `.env.local`, current dependencies, source fixtures, attribution and both stable Chrome installation directories. Removed the obsolete `release/installers/` ignore rule. Legacy IndexedDB identifiers, archive schemas, migration logic and precise synthetic-demo removal are required compatibility code and remain in place.

## Documentation

Rewrote the main README around installation, capabilities, the directory tree and the implementation of DOM extraction, basic excerpts, employer matching, JEV analysis and transactional caching. Added a development/maintenance guide and rewrote privacy, evaluation, catalogue, fixture and installation documentation. Removed the accumulated historical review narrative and replaced it with this current report.

Documentation now distinguishes temporary basic excerpts from persisted AI results, optional Key setup from local functionality, candidate retrieval from model accuracy, and installation-file synchronization from browser activation.

## Verification

- TypeScript checking passed.
- **804 tests in 28 files passed**, with two workers.
- Prettier checked maintained code, data, public metadata and documentation.
- Offline retrieval evaluation: occupation reference recall **23/24**, skill candidates **75/75**, experience candidates **13/13**. These are synthetic retrieval measures, not model-accuracy results.
- Dependency audit against the npm registry reported **0 known vulnerabilities** across **593 resolved dependencies**. This describes the registry result at review time, not a guarantee against all vulnerabilities.
- The 0.21.1 production build and ZIP passed integrity checks. The manifest version matches `package.json`; ZIP members and both existing unpacked installation directories match the production output byte for byte. `release/SHA256SUMS` records the current archive.
- Local Markdown links and documented source paths were checked after cleanup.

This pass does not change rendered UI behavior. No fresh live SEEK browser acceptance or paid JEV call was performed. The previous synthetic five-language browser evidence is in the external archive. Reload the extension in Chrome and refresh open SEEK tabs to activate the new build.

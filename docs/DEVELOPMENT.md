# Development and maintenance

## Local workflow

Use the Node.js and pnpm versions declared in `package.json`, plus Python 3.10+ for release validation (no Python packages needed). Install with `pnpm install --frozen-lockfile`. `postinstall` and `pnpm typecheck` run `wxt prepare`, which generates `.wxt/`; it must not be maintained by hand.

`pnpm dev` starts WXT's extension development workflow. This is a browser extension, not a standalone website with a backend server. For a production check, use `pnpm build` and load `.output/chrome-mv3` as an unpacked extension in an isolated Chrome profile.

Routine verification:

```sh
pnpm typecheck
pnpm exec vitest run --maxWorkers=2
pnpm test:release
pnpm eval:jev
pnpm format:check
pnpm zip
pnpm release:prepare
```

Two test workers limit resource contention. Do not increase test timeouts to mask resource contention or a failing operation. `pnpm check` also runs type checking, the test suite and a production build, using Vitest's default worker count.

## Module boundaries

| Boundary                         | Responsibility                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Content script → background      | Strict message schemas, browser-supplied sender identity, current-tab and job-URL checks           |
| Settings → credential storage    | Shared Web Lock, trusted-context storage access, independent AI consent and auto-analysis opt-in   |
| Orchestrator → provider          | Task ownership, cache identity, cancellation and the bounded validation retry policy               |
| Provider → response parser       | Timeout/size limits, allowed choices, probabilities, exact source membership and evidence offsets  |
| Storage → imported data          | Runtime schemas, record consistency checks, byte/count limits and atomic writes                    |
| Dataset download → local matcher | Date/schema/size/row-count/checksum validation, atomic snapshot replacement, candidate uncertainty |

Basic excerpts run in the content script and have no dependency on credential readiness. New local features must not implicitly opt users into AI requests.

## Data stores and compatibility

| Store                             | Contents                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `chrome.storage.session`          | Session-only JEV Key                                                                                    |
| `chrome.storage.local`            | Optional remembered Key, consent, automatic-analysis preference, language and settings migration marker |
| IndexedDB `seek-filter`           | `jobs` and `tasks` object stores                                                                        |
| IndexedDB `seek-filter-employers` | `employers` and `metadata` object stores                                                                |

The `seek-filter` names in databases, backup envelopes and DOM markers are intentional compatibility identifiers. Do not rename them as cosmetic cleanup. `archive-schema.ts` validates historical local/Codex/Qwen records; the corresponding engines are not active. The retired-demo cleanup removes only the known synthetic demo identity, not arbitrary saved jobs.

`ANALYSIS_VERSION`, `JEV_PROMPT_VERSION`, `TAXONOMY_VERSION` and `RULES_VERSION` participate in result identity. Change the appropriate version when result interpretation changes. Pure cleanup or presentation changes should preserve those identities and their cache regression test. A stale bookmarked result can remain stored while being ineligible for cache reuse.

## UI and browser verification

Use an isolated browser profile and synthetic public SEEK markup for repeatable tests. Verify the packaged content script and background together, including no-Key use, language updates, navigation, cancellation, failed AI calls and employer-list availability.

Check both a desktop width and a narrow width in all five languages. Confirm quotations preserve qualifiers, additional excerpts remain accessible, controls fit, and no unintended paid request occurs. Mocked DOM tests and synthetic browser checks do not establish compatibility with current live SEEK markup; record that distinction in review notes.

Store temporary screenshots and reports under ignored `output/`. Do not add browser profiles, real Keys, storage exports or captured private pages to source fixtures. See [test-data rules](../tests/fixtures/README.md).

## Rebuild maintained assets

- Occupation catalogue: `pnpm catalog:import`, with pinned-source checksum validation. See [catalogue instructions](../data/occupations/README.md).
- Icons: `node --experimental-strip-types scripts/icons.ts`. This writes the four PNG sizes under `public/icon/` using `sharp`.
- Chrome metadata: maintain all five `public/_locales/*/messages.json` files alongside the UI translations.
- Formatting: `pnpm format` / `pnpm format:check` cover application code, tests, data, scripts, public metadata and Markdown documentation.

`web-ext` supports WXT's development browser workflow. `read-excel-file` and `sharp` are used by asset generation scripts. They are intentional development dependencies. The `addons-linter>image-size` override pins 2.0.3 while the installed linter declares 2.0.2; reassess it when upgrading that tool rather than deleting it without checking the resolved dependency tree.

## Package and upgrade

`package.json` supplies the release version to WXT. Keep README, privacy/review notes and installation instructions aligned with a release, then run `pnpm zip`.

For this release:

```sh
rsync -a --delete .output/chrome-mv3/ release/chrome-extension/
rsync -a --delete .output/chrome-mv3/ release/roleharbour-0.11.0-chrome/
cp .output/roleharbour-0.21.1-chrome.zip release/
(cd release && shasum -a 256 roleharbour-0.21.1-chrome.zip > SHA256SUMS)
unzip -t release/roleharbour-0.21.1-chrome.zip
```

Use `--delete` only for these generated installation directories. Verify their files match `.output/chrome-mv3` and the ZIP members byte for byte. The legacy folder name is stable installation identity, not the version of its contents. Keep both existing paths; do not replace a loaded directory with a newly named directory.

These commands update files on disk. Users must reload the extension at `chrome://extensions` and refresh existing SEEK tabs to activate them. A completed build alone does not prove that an already open browser is running the new code.

## GitHub Actions and releases

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`, manual dispatch, and calls from the release workflow. It uses Ubuntu 24.04, Node.js 24 and the pnpm version in `package.json`. It installs the frozen lockfile, checks formatting/types/tests, runs the offline evaluation, rejects high/critical dependency vulnerabilities, builds the ZIP and validates release assets. Packages and evaluation reports are retained for 14 days. External actions are pinned to commit SHAs; Dependabot checks actions and npm dependencies weekly. The verification job has read-only repository permissions and no JEV credentials.

`.github/workflows/release.yml` runs for `v*` tags and can be retried manually against a tag. It calls the same CI workflow, downloads that run's verified artifact, checks SHA-256 and uses GitHub CLI to create a draft, upload assets and publish. Only the publication job receives `contents: write`. No personal access token or paid-service secret is required. A failed upload leaves a draft that can be retried; an already published version is never replaced by rerunning this workflow.

For a new version:

1. Update `package.json`, `release/INSTALL.txt` and version references in the documentation. Add a `## MAJOR.MINOR.PATCH` section to `CHANGELOG.md`. WXT derives the manifest version from `package.json`.
2. Run the local verification commands above. `release:prepare` checks the build/ZIP contents, version, changelog and installation notes, then creates `output/release-assets/` with the ZIP, installation notes, SHA-256 checksums and the release body. Keep local `.env` files and generated reports out of Git.
3. Commit and push the changes to `main`, then wait for CI to pass. Update maintained local installation assets separately if needed, using the preceding section.
4. Tag the tested commit and push the tag (replace the example version with the new one):

   ```sh
   git tag v0.21.2
   git push origin v0.21.2
   gh run list --workflow release.yml
   gh run watch RUN_ID --exit-status
   gh release view v0.21.2
   ```

5. Verify the published files:

   ```sh
   gh release download v0.21.2 --dir output/release-download-v0.21.2
   (cd output/release-download-v0.21.2 && shasum -a 256 -c SHA256SUMS)
   unzip -t output/release-download-v0.21.2/roleharbour-0.21.2-chrome.zip
   ```

To retry an unpublished version after a transient runner or upload failure, run `gh workflow run release.yml --ref v0.21.2`. A source fix requires a new version and tag; do not move a published tag. GitHub Release assets come from the clean CI build. ZIP timestamps can differ from a locally built ZIP, so use the checksums supplied with the downloaded release.

Branch protection is a separate repository setting; these workflow files do not enforce it. Release automation distributes unpacked Chrome extensions and does not submit them to the Chrome Web Store. Browser testing and any explicitly requested live JEV evaluation remain separate from CI.

## Cleanup policy

Keep source, the current release, stable installation directories, the lockfile and attribution. Keep local credential configuration private. Generated build files, test-browser profiles, old screenshots, obsolete installers and former model experiments are not source.

Archive useful historical evidence outside the project before clearing old work products. Do not delete archive schemas, migrations or synthetic regression fixtures solely because they mention a retired feature. Update documentation links and release checksums when removing an old artifact.

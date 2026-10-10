# Development and maintenance

## Local workflow

Use the Node.js and pnpm versions declared in `package.json`, plus Python 3.10+ for release validation (no Python packages needed). Install with `pnpm install --frozen-lockfile`. `postinstall` and `pnpm typecheck` run `wxt prepare`, which generates `.wxt/`; it must not be maintained by hand.

`pnpm dev` starts WXT's extension development workflow. This is a browser extension, not a standalone website with a backend server. For a production check, use `pnpm build` and load `.output/chrome-mv3` as an unpacked extension in an isolated Chrome profile.

Routine verification:

```sh
pnpm typecheck
pnpm lint
pnpm exec vitest run --maxWorkers=2
pnpm test:release
pnpm format:check
pnpm zip
pnpm release:prepare
```

Two test workers limit resource contention. Do not increase test timeouts to mask resource contention or a failing operation. `pnpm check` also runs type checking, ESLint (typescript-eslint, react-hooks and `no-floating-promises`), the test suite and a production build, using Vitest's default worker count.

## Module boundaries

| Boundary                         | Responsibility                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Content script → background      | Strict message schemas, browser-supplied sender identity, current-tab and job-URL checks            |
| Background → local engine        | Contact redaction, bounded input (24,000-character description), synchronous on-device analysis     |
| Local engine → panel             | Checklist, experience and visa items carry exact source segments: `body.slice(start, end) === text` |
| Dataset download → local matcher | Date/schema/size/row-count/checksum validation, atomic snapshot replacement, candidate uncertainty  |
| Settings → employer backups      | Runtime schemas, byte limits and atomic replacement                                                 |

The extension makes no request other than the employer-list download (`connect-src` in `wxt.config.ts`). New features must stay on-device; adding a remote service needs a new privacy review, not just a permission.

## Local engine

`localAnalysis()` in `src/core/local-analysis.ts` is the single entry point, called by the background worker for the `page:local` message. SEEK pages load no vocabulary or catalogue.

| Path                               | Responsibility                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/local-engine/structure.ts`    | Statement spans, headings, lead-ins and the section context each statement sits in                                |
| `src/local-engine/candidates.ts`   | Heading/keyword selection of requirement and experience candidates, stated-year parsing                           |
| `src/local-engine/markers.ts`      | Shared required/preferred/negated wording markers                                                                 |
| `src/local-engine/requirements.ts` | Required/preferred/unclear level of each statement                                                                |
| `src/local-engine/experience.ts`   | Experience estimate band when no years are stated                                                                 |
| `src/local-engine/prep.ts`         | Preparation checklist: languages, tools, knowledge, spoken languages, qualifications, qualities, materials, other |
| `src/local-engine/visa.ts`         | Sponsorship, existing work-rights and citizen-or-resident wording, including conflicts                            |
| `src/local-engine/types.ts`        | Shared decision and evidence types                                                                                |
| `src/rules/occupations.ts`         | ANZSCO retrieval; the panel shows a reference only when the title names the occupation (`titleRank ≥ 2`)          |
| `data/skills/onet-software.json`   | Generated O\*NET 31.0 Software Skills list (CC BY 4.0)                                                            |
| `data/skills/vocabulary.ts`        | Hand-curated programming and spoken languages, NZ tools, knowledge areas, qualities and materials                 |
| `data/occupations/`                | ANZSCO catalogue, O\*NET title synonyms, NZ titles (`nz-titles.ts`) and IT keywords                               |

Vocabulary entries are matched only inside selected requirement statements, never across the whole advertisement. Keep project-authored vocabulary original; do not copy licensed taxonomies into `vocabulary.ts`.

`tests/fixtures/role-benchmark.json` is a labelled synthetic dataset across sectors (requirement levels, experience and visa expectations). `tests/local-visa.test.ts` requires its visa labels to match exactly; `tests/local-requirements.test.ts` enforces requirement-level accuracy floors and expected experience abstentions. Set `LOCAL_REQUIREMENTS_REPORT=1` to print the per-level tally and misses. Update its labels only when the advertisement wording justifies them, never to fit engine output. It does not measure accuracy on live SEEK advertisements.

## Data stores and compatibility

| Store                             | Contents                                 |
| --------------------------------- | ---------------------------------------- |
| `chrome.storage.local`            | Language setting                         |
| IndexedDB `seek-filter-employers` | `employers` and `metadata` object stores |

`src/storage/retired-data.ts` runs on every worker start. It removes the retired AI keys (`jevKey`, `jevConsent`, `autoAnalyze`, `analysisProvider`, `codexConsent`, `qwenEnabled`) from local and session storage and deletes the IndexedDB database `seek-filter` (saved jobs and tasks). It is idempotent; keep it until upgrades from 0.21.x are no longer supported. Do not reuse those key names or the `seek-filter` database name.

The `seek-filter` prefix in the employer database and DOM markers is an intentional compatibility identifier. Do not rename it as cosmetic cleanup.

No analysis results are cached, so the rules carry no version identifier. The occupation catalogue is identified by `CATALOGUE_METADATA` (source, licence and SHA-256 hashes).

## UI and browser verification

Use an isolated browser profile and synthetic public SEEK markup for repeatable tests. Verify the packaged content script and background together, including language updates, navigation, job changes and employer-list availability.

Check both a desktop width and a narrow width in all five languages. Confirm source sentences preserve qualifiers and appear on hover, controls fit, and no request other than the employer-list download occurs. Mocked DOM tests and synthetic browser checks do not establish compatibility with current live SEEK markup; record that distinction in review notes.

Store temporary screenshots and reports under ignored `output/`. Do not add browser profiles, credentials, storage exports or captured private pages to source fixtures. See [test-data rules](../tests/fixtures/README.md).

## Rebuild maintained assets

- Occupation catalogue: `pnpm catalog:import`, with pinned-source checksum validation. See [catalogue instructions](../data/occupations/README.md).
- Occupation title synonyms: `pnpm catalog:synonyms` (O\*NET 31.0 titles linked through ISCO-08), writing `data/occupations/onet-synonyms.json`.
- Software and tools: `pnpm catalog:software` (`scripts/import-software-skills.ts`) downloads the pinned O\*NET 31.0 Software Skills CSV into `.cache/onet-31.0`, checks its SHA-256 and writes `data/skills/onet-software.json`. A local word list (`WORD_LIST`, default `/usr/share/dict/words`) decides which one-word names stay case-sensitive. Run Prettier on generated JSON afterwards.
- Attribution: keep `public/occupation-sources.txt` aligned with every bundled O\*NET or ABS source.
- Icons: `node --experimental-strip-types scripts/icons.ts`. This writes the four PNG sizes under `public/icon/` using `sharp`.
- Chrome metadata: maintain all five `public/_locales/*/messages.json` files alongside the UI translations.
- Formatting: `pnpm format` / `pnpm format:check` cover application code, tests, data, scripts, public metadata and Markdown documentation.

`typescript` resolves to `@typescript/typescript6` (the TypeScript 6 JavaScript API that typescript-eslint and editors need) and `@typescript/native` is TypeScript 7, which provides `tsc`; this is the side-by-side layout Microsoft documents for 7.0. `web-ext` supports WXT's development browser workflow. `read-excel-file` and `sharp` are used by asset generation scripts. They are intentional development dependencies. The `addons-linter>image-size` override pins 2.0.3 while the installed linter declares 2.0.2; reassess it when upgrading that tool rather than deleting it without checking the resolved dependency tree. `pnpm-workspace.yaml` also carries advisory floors (`shell-quote`, `source-map-js`) and an `auditConfig.ignoreGhsas` entry for an advisory with no published fix; each is commented with its reason and removal condition, and `pnpm audit --audit-level=high` in CI is the check that keeps them honest.

## Package and upgrade

`package.json` supplies the release version to WXT. Keep README, the privacy notice and installation instructions aligned with a release, then run `pnpm zip`.

For this release:

```sh
rsync -a --delete .output/chrome-mv3/ release/chrome-extension/
rsync -a --delete .output/chrome-mv3/ release/roleharbour-0.11.0-chrome/
unzip -t .output/roleharbour-0.22.0-chrome.zip
```

The ZIP and `SHA256SUMS` are published as GitHub Release assets by `release:prepare` and the release workflow; they are not committed (see `.gitignore`).

Use `--delete` only for these generated installation directories. Verify their files match `.output/chrome-mv3` and the ZIP members byte for byte. The legacy folder name is stable installation identity, not the version of its contents. Keep both existing paths; do not replace a loaded directory with a newly named directory.

These commands update files on disk. Users must reload the extension at `chrome://extensions` and refresh existing SEEK tabs to activate them. A completed build alone does not prove that an already open browser is running the new code.

## GitHub Actions and releases

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`, manual dispatch, and calls from the release workflow. It uses Ubuntu 24.04, Node.js 24 and the pnpm version in `package.json`. It installs the frozen lockfile, checks formatting/types/tests, rejects high/critical dependency vulnerabilities, builds the ZIP and validates release assets. Packages are retained for 14 days. External actions are pinned to commit SHAs; Dependabot checks actions and npm dependencies weekly. The verification job has read-only repository permissions and needs no secrets.

`.github/workflows/release.yml` runs for `v*` tags and can be retried manually against a tag. It calls the same CI workflow, downloads that run's verified artifact, checks SHA-256 and uses GitHub CLI to create a draft, upload assets and publish. Only the publication job receives `contents: write`. No personal access token or service secret is required. A failed upload leaves a draft that can be retried; an already published version is never replaced by rerunning this workflow.

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

Branch protection is a separate repository setting; these workflow files do not enforce it. Release automation distributes unpacked Chrome extensions and does not submit them to the Chrome Web Store. Browser testing remains separate from CI.

## Cleanup policy

Keep source, the current release, stable installation directories, the lockfile and attribution. Generated build files, test-browser profiles, old screenshots, obsolete installers and former model experiments are not source.

Archive useful historical evidence outside the project before clearing old work products. Do not delete the retired-data cleanup or synthetic regression fixtures solely because they mention a retired feature. Update documentation links and release checksums when removing an old artifact.

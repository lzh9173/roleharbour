# Development and maintenance

## Local workflow

Use the Node.js and pnpm versions declared in `package.json`. Install with `pnpm install --frozen-lockfile`. `postinstall` and `pnpm typecheck` run `wxt prepare`, which generates `.wxt/`; it must not be maintained by hand.

`pnpm dev` starts WXT's extension development workflow. This is a browser extension, not a standalone website with a backend server. For a production check, use `pnpm build` and load `.output/chrome-mv3` as an unpacked extension in an isolated Chrome profile.

Routine verification:

```sh
pnpm typecheck
pnpm exec vitest run --maxWorkers=2
pnpm eval:jev
pnpm format:check
pnpm zip
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

## Cleanup policy

Keep source, the current release, stable installation directories, the lockfile and attribution. Keep local credential configuration private. Generated build files, test-browser profiles, old screenshots, obsolete installers and former model experiments are not source.

Archive useful historical evidence outside the project before clearing old work products. Do not delete archive schemas, migrations or synthetic regression fixtures solely because they mention a retired feature. Update documentation links and release checksums when removing an old artifact.

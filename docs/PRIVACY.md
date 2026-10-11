# Privacy notice

Version 0.22.0 · updated 2026-10-10 for on-device analysis

RoleHarbour runs entirely on your device. Job content is read, analysed and displayed locally and is never sent to any server. There is no RoleHarbour account, hosted server, analytics, AI service or credential.

## Information read from SEEK

The extension reads supported, visible job cards, descriptions and job dialogs on `https://nz.seek.com` and `https://www.seek.co.nz`. It reads job title, employer, location, description and job identity. It excludes private profiles and application pages, does not read cookies, and does not crawl unopened jobs or call private SEEK APIs.

The page passes the title and description to the extension's own service worker, which computes the occupation reference, experience, visa wording and preparation checklist locally. Common email addresses and New Zealand phone numbers are redacted before analysis. Results stay in memory for the open job and are not saved. Language translations are bundled; no translation service is used.

## Network requests

The only outbound requests go to `https://data.nzaei.zemo.bio`, which publishes the public [NZAEI dataset](https://nzaei.zemo.bio/open-data/). The extension's content security policy allows no other connection. The background worker checks the dataset on first use, every seven days, or on manual refresh. Requests contain no job text, company names or other user data; the host can receive ordinary connection information such as an IP address.

A changed snapshot must pass date, schema, size, row-count and checksum checks before replacement. A failed update preserves the previous local list. Matching and review-candidate generation happen locally. The dataset is a dated independent observation, not the complete live INZ register; a match does not establish current accreditation or job sponsorship.

## Local storage

| Data              | Storage and retention                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Employer list     | IndexedDB `seek-filter-employers`, replaced after a successful download or validated import. |
| Language setting  | `chrome.storage.local`, restricted to trusted extension contexts. No Chrome Sync.            |
| Job panel results | Memory only, for the open job.                                                               |
| Retired data      | Deleted on every worker start (see below).                                                   |

Earlier versions offered optional AI analysis and a saved-job archive. On every start the worker deletes their data: the `chrome.storage` keys `jevKey`, `jevConsent`, `autoAnalyze`, `analysisProvider`, `codexConsent` and `qwenEnabled` (local and session), and the IndexedDB database `seek-filter` with its saved jobs and tasks. Saved jobs cannot be exported after upgrading. The employer list and language setting are kept.

The extension does not use historical résumé or per-company query-cache databases and does not proactively delete them. Previously installed external connectors and browser model caches are also left untouched.

## Permissions

Required permissions are `storage`, `sidePanel`, `alarms`, the two supported SEEK domains and the NZAEI download domain. There are no optional host permissions. The extension has no native-messaging, offscreen or model-download permission and grants no WebAssembly execution permission.

Background tab queries are restricted to the supported SEEK domains. The worker only answers language, employer-match, local-analysis and open-settings requests from public SEEK pages; opening settings needs a real click. External links open when selected by the user.

## Backups and deletion

Settings can export and import the employer list. Files are generated and read locally, without upload. Employer backups are limited to 12 MiB; a validated import replaces the current list.

Uninstalling removes extension-local data. Reloading or upgrading in the same unpacked directory preserves the employer list and language setting.

## Distribution

RoleHarbour is published on the [Chrome Web Store](https://chromewebstore.google.com/detail/roleharbour-%C2%B7-nz-job-comp/mbeoakplonnbmiekenheljopipkhdhpe) as "RoleHarbour · NZ Job Companion" and supplied as an unpacked installation package on GitHub Releases. Store updates go through Google's review, so the store version can briefly lag behind the version this notice describes.

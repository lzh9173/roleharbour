# Privacy notice

Version 0.21.1 · 2026-09-27

RoleHarbour offers local job excerpts and employer matching without a Key. TypeSafe JEV is an optional AI service. There is no RoleHarbour account, hosted server, analytics or shared credential.

## Information read from SEEK

The extension reads supported, visible job cards, descriptions and job dialogs on `https://nz.seek.com` and `https://www.seek.co.nz`. It reads job title, employer, location, description and job identity. It excludes private profiles and application pages, does not read cookies, and does not crawl unopened jobs or call private SEEK APIs.

Basic requirement and experience excerpts are computed in the page. They do not require credentials or make AI requests, and are not saved as analysis records or included in backups. Language translations are bundled; no translation service is used.

## Optional TypeSafe requests

Before a model request, users must save their own Key, accept data transfer and grant access to the optional API domain. Manual analysis requires the page notice to be accepted; automatic analysis is a separate opt-in and is disabled by default. Saving a Key makes no test request.

Requests go directly to `https://api.typesafe.ai/v1/systemone`. They contain the job title, processed description segments, up to eight occupation candidate descriptions and analysis questions. Saved job collections and employer databases are not sent. Common email addresses and New Zealand phone numbers are redacted, but this is not a guarantee of complete anonymisation.

Requests use the user's TypeSafe credits and are subject to TypeSafe's data policies. Eligible results are cached for 30 days. A received choice/probability mismatch can trigger two validation retries; other failures and interrupted requests are not automatically resubmitted. Failed requests may still cost credits. Cancelling cannot guarantee the provider has stopped processing or charging. Saved token counts cover the successful response, not necessarily all attempts.

## Employer-list downloads

The background worker downloads the public [NZAEI dataset](https://nzaei.zemo.bio/open-data/) from `https://data.nzaei.zemo.bio`. It checks on first use, every seven days, or on manual refresh. Company names, job text and Keys are not included in these requests. The dataset host can receive ordinary connection information such as an IP address.

A changed snapshot must pass date, schema, size, row-count and checksum checks before replacement. A failed update preserves the previous local list. Matching and review-candidate generation happen locally. The dataset is a dated independent observation, not the complete live INZ register; a match does not establish current accreditation or job sponsorship.

## Local storage

| Data           | Storage and retention                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JEV Key        | `chrome.storage.session` by default; `chrome.storage.local` when remembered. Both are restricted to trusted extension contexts. This is not an encrypted vault.                                                                         |
| Preferences    | Browser-local language, AI consent, auto-analysis setting and migration marker. No Chrome Sync.                                                                                                                                         |
| Jobs and tasks | IndexedDB `seek-filter`. Successful results include source evidence. The current page adapter does not retain full descriptions. Unbookmarked records and task history expire after 30 days; historical bookmarks remain until deleted. |
| Employer list  | IndexedDB `seek-filter-employers`, replaced after successful download or validated import.                                                                                                                                              |
| Basic excerpts | Temporary page memory only.                                                                                                                                                                                                             |

Older records that explicitly retained full descriptions still contain them. Historical local/Codex/Qwen records can be exported or imported as validated backups, but do not enable retired engines. Migration from a non-JEV mode disables automatic analysis; existing JEV opt-ins remain unchanged.

The extension no longer uses historical résumé or per-company query-cache databases and does not proactively delete them. Previously installed external connectors and browser model caches are also left untouched. The known synthetic product demo is removed by its fixed identity; genuine or ambiguous records are preserved.

## Permissions

Required permissions are `storage`, `sidePanel`, `alarms`, the two supported SEEK domains and the NZAEI download domain. TypeSafe is an optional host permission. The extension has no native-messaging, offscreen or model-download permission and grants no WebAssembly execution permission.

Background tab queries are restricted to the supported SEEK domains. Content messages expose no Key or arbitrary stored collection. External links open when selected by the user.

## Backups and deletion

Settings provides separate job and employer-list backups. Files are generated and read locally, without upload. Job backups may contain source excerpts and full descriptions retained by earlier versions. API Keys are excluded.

- Job backups: up to 1,000 records and 5 MB; validated before an atomic import.
- Employer backups: up to 12 MiB; a validated import replaces the current list.
- Clear Key removes credentials, consent and automatic-analysis opt-in.
- Clear job records removes saved jobs and tasks.
- Uninstalling removes extension-local data. Reloading or upgrading in the same unpacked directory normally preserves it.

## Distribution

This version is supplied as a local Chrome installation package and has not been submitted to the Chrome Web Store. Store publication still requires developer contact information, a hosted privacy page and completed store disclosures.

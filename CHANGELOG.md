# Changelog

## 0.21.1

First GitHub release of RoleHarbour, a Chrome extension for SEEK New Zealand.

- View requirement and experience excerpts without a Key.
- Match employers against a locally stored NZAEI snapshot, with weekly updates and clearly marked review candidates.
- Optionally use your own TypeSafe JEV Key for requirement analysis, occupation references and hiring-statement assessment.
- Use English, Simplified Chinese, Traditional Chinese, Japanese or Korean interfaces.
- Keep local analysis caching and separate job/employer backups; Keys are excluded from backups.
- Remove unused code and obsolete work products; document the architecture, privacy boundaries and maintenance workflow.
- Add CI checks and verified GitHub Releases with ZIP, installation instructions and SHA-256 checksums.

Requires Chrome 116 or later. Extract the attached ZIP and load its directory at `chrome://extensions` with Developer mode enabled. Existing users should replace files in their current unpacked installation directory, reload the extension and refresh SEEK tabs.

Basic excerpts are keyword-selected quotations. Employer-list matches are dated observations. Neither these nor optional AI results determine personal immigration eligibility. AI requests and validation retries can use your TypeSafe credits.

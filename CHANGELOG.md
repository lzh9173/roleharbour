# Changelog

## Unreleased

- Replace the extension icons with Haru, RoleHarbour's mascot: her whole head at 48 and 128 px, and a close crop inside a sky rim at 16 and 32 px so the toolbar icon stays legible.
- Keep the border on visa verdict pills such as "Required", which could disappear because the pill's own style competed with a button reset, and show the "Try again" button in link colour.
- Add the brand kit (Haru, the lighthouse sticker logo, the lockup and README banner) and a 26-second promo video rendered from source, with an illustrative job ad and employer results.

## 0.22.0

RoleHarbour now runs entirely on your device. Job content is never sent to any server.

- Remove the optional AI analysis (TypeSafe JEV), its Key settings and optional host permission, and the saved-job archive with its job backups.
- Delete retired data on every start: any stored API Key, AI consent and automatic-analysis settings, and the saved jobs and tasks database. Saved jobs cannot be exported after upgrading. The employer list and language setting are kept.
- Add an on-device application preparation checklist: programming languages, tools and platforms (O\*NET 31.0 Software Skills plus curated NZ tools), knowledge areas, spoken languages, qualifications, personal qualities, application materials, nice-to-haves and other requirements. Items in example lists ("such as", "e.g.") appear as individual chips under their kind, and application logistics, pay, perks and visa wording are kept out of other requirements.
- Read sponsorship, existing work-rights and citizen-or-resident wording, occupation references and experience locally. Visa verdicts are colour-coded and show the source sentence on hover. Experience shows stated years or a labelled local estimate; an occupation reference appears only when the advertised title names it.
- Redesign the job panel and settings. Settings now cover the accredited employer list, language, and privacy and data sources, and follow the system dark mode.
- Preserve list bullets when reading job descriptions, so requirement lists are recognised.
- Keep the job panel in place when SEEK re-renders the same job or fills in the advertiser late, offer a retry when the local reading fails, check employers once a background tab becomes visible, and bring an open settings tab forward instead of opening another.
- Redact phone numbers and email addresses without splitting statements or swallowing the next line, and stop reading ordinary phrases ("a high degree of accuracy", "support tickets", "a natural networker") as qualifications or tools.
- Recognise more web stack tools (jQuery, Symfony, Spring, Redux, Webpack, Node, Gradle, Postgres and others) and Agile wording, and keep equal-opportunity and accessibility statements out of the checklist. Checked against the SkillSpan job-posting dataset (CC BY 4.0) without adding it to the repository.
- Read the list under headings such as "Is this you?", "Your profile", "What it takes", "To be successful" and "You'll be a good fit if:" as requirements; these lists were previously dropped. An "Us:" section ends the requirement list.
- Stop discarding statements that mention role words such as "assistant", "classifier" or "LLM"; only text addressed to a machine reader ("ignore previous instructions") is ignored.
- Keep internal storage or tab errors out of page messages.
- Remove dead code left from the retired AI analysis and cache (version identifiers, unused styles, test-only wrappers, translated chip labels that were never shown) and share SEEK URL, broadcast, download and error helpers.
- Apply review fixes and replace the offline JEV evaluation with a local-engine regression fixture.
- Retry a failed employer-list download after an hour instead of waiting a week, bring an open settings side panel forward instead of opening a tab, and let visa verdicts and checklist chips show their source sentence on click as well as on hover.
- Skip re-reading the job description when SEEK changes other parts of the page, build the occupation index on first use rather than at worker start, and bound clause splitting on pathological comma lists.
- Add ESLint (typescript-eslint, react-hooks, no-floating-promises) to `pnpm check` and CI, and stop committing release ZIPs; Releases host them.
- End the requirement list at pitch headings such as "Why this role matters", "Join our team" and "Why our team loves working at …", which previously left culture and diversity prose under "other requirements". Read "What your day could look like" as duties, drop ", or equivalent experience" from a qualification chip, and list application materials asked for under the apply section.

Upgrading deletes saved jobs and any stored API Key. Local readings describe the advertisement only and do not determine personal immigration eligibility.

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

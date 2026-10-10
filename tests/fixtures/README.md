# Test fixtures

The suite uses synthetic job text and employer records, mocked Chrome/network APIs and temporary IndexedDB. It makes no network requests to any analysis provider.

## Conventions

- Job IDs are arbitrary fixture identifiers. Tests do not visit those SEEK jobs.
- DOM fixtures contain only the markup needed to exercise page identity, visibility and navigation behavior.
- Contact-redaction cases use reserved example domains such as `example.org`.
- Credential tests use clearly synthetic sentinel strings, including `private-test-key` and `must-not-export`. These are not real credentials.
- Public occupation codes/titles come from the bundled catalogue. Alias regressions can use public legal names and NZBNs, but their dates and status records are synthetic and do not establish current accreditation.
- `sampleJob` in `job.ts` is a synthetic advert for a fictional employer. It is not shipped as a user-facing example. Historical backup fixtures protect upgrade compatibility.

For a bug, add the smallest synthetic example that reproduces its behavior and a meaningful counterexample when ambiguity is involved. Keep source offsets and quoted text consistent. Do not rewrite labels to fit a model prediction.

Do not commit real credentials, browser profiles, cookies, storage exports, personal account identifiers, CVs, application records, downloaded employer lists or full captured job pages. Put temporary test artifacts under ignored `output/` and record the limits of any browser verification.

Passing unit tests is not evidence of on-device rule accuracy or live SEEK compatibility.

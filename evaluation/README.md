# JEV evaluation

This diagnostic benchmark uses the production occupation retrieval, contact redaction, requirement candidate extraction and JEV provider. It bypasses Chrome, UI rendering, storage, caching and orchestration retries. Its prompts are the production prompts, not a second implementation.

## Offline run

```sh
pnpm eval:jev
pnpm eval:jev --limit 8
```

The default processes all 24 synthetic advertisements. Offline mode needs no Key, makes no API request and measures candidate retrieval only. It does not measure the stricter basic-overview filter or AI accuracy.

## Optional paid inference

Create a private configuration only if one does not already exist:

```sh
test -e .env.local || cp .env.example .env.local
chmod 600 .env.local
# Edit JEV_API_KEY locally; never place a Key in command arguments or fixtures.
pnpm eval:jev --live --limit 8
```

An existing `JEV_API_KEY` environment variable takes precedence over `.env.local`. Offline runs do not load that file. The evaluator does not read browser profiles or extension storage.

Live mode calls TypeSafe using the account's credits. It sends synthetic job text and the production shortlist. The allowed limit is 1–24, with 24 as the default; selection rotates across sectors, so eight cases cover all eight sectors.

Each case makes at most one sequential request with the production timeout and no retry. Authentication, permission, rate-limit, invalid-input and interruption errors stop the run; three consecutive other failures also stop it. Re-running starts a new run and may incur further charges.

## Reference data

`jev-benchmark.json` contains 24 synthetic English advertisements: three each for healthcare, education, trades, transport, hospitality, finance/administration, customer service/retail and IT. Twelve specify experience durations. Cases exercise requirement strength, licences and registration, qualification alternatives, negation, visa contradictions and prompt injection.

Labels are AI-authored and independently AI-reviewed, not human-expert annotations. Accepted occupation IDs must exist in the bundled catalogue, and reference quotations must occur exactly once in their input. The dataset is development data and is not bundled into the extension.

Label conventions are fixed before inference:

- A duration plus a named capability can be both a skill and an experience reference. A bare duration of professional experience is experience only.
- The inpatient personal-care case accepts Personal Care Assistant or Nursing Support Worker, consistent with the [ABS unit-group descriptions](https://www.abs.gov.au/ausstats/abs%40.nsf/Latestproducts/37A4C3404AA76C97CA2584A8000E79DC).
- Labels are not changed to match a prediction after observing results.

## Metrics

| Metric                           | Interpretation                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Occupation recall at 8           | Whether retrieval supplies an accepted occupation to the model                           |
| Conditional occupation agreement | Accepted model choice among valid calls whose shortlist contains a reference             |
| End-to-end occupation agreement  | Correct choice across all attempted cases, including retrieval and delivery failures     |
| Requirement candidate recall     | Complete reference statements retained before inference                                  |
| Detection precision/recall       | One-to-one source-statement matches, allowing only formatting normalization              |
| Strict precision/recall/F1       | Statement match plus correct strength; experience also needs the correct duration bounds |
| Explicit duration recall         | Correct source scope, strength and numeric duration                                      |
| Visa state agreement             | Exact advertisement labels with confusion tables for each axis                           |
| Required estimate abstention     | Whether inferred years were omitted when the reference requires abstention               |

A broad quote cannot satisfy several narrow references. Lost qualifiers, duplicate predictions, wrong levels and mixed duration scopes do not receive strict credit. A wrong strength counts as both a false positive and false negative. Invalid/missing responses contribute no correct categorical decisions; unattempted cases remain separate. Precision is undefined when no predictions exist.

There is no factual ground truth for inferred years in advertisements that state no duration. Reports measure estimate emission and required abstention, not the accuracy of invented experience requirements. Local suppression also contributes to abstention, so this metric does not isolate model behavior.

## Reports and exit status

Each run writes `output/jev-eval/<run>/` and checkpoints after completed live requests:

| File             | Contents                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `benchmark.json` | Exact frozen input and reference labels                                                                |
| `report.json`    | Dataset/source hashes, coverage, request outcomes, normalized results, mismatches and confusion tables |
| `report.md`      | Human-readable summary                                                                                 |

Files use owner-only permissions and are Git-ignored. Raw responses, headers and Keys are not written. Token totals include valid responses only; rejected or interrupted calls may still cost credits.

Exit code 1 indicates setup failure. A live run exits with code 2 if any request failed or selected cases were left unattempted. Offline runs are explicitly labelled as local retrieval results.

This small synthetic set does not represent current SEEK advertisements, long-page behavior, multilingual input, UI quality or repeated-run variability. Public accuracy claims require independently human-labelled representative data and a held-out set. Do not combine these different metrics into one accuracy percentage.

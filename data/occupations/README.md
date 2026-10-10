# Occupation catalogue

The bundled catalogue contains **1,023 active six-digit ANZSCO v1.3 (2019) occupations**, 358 unit groups and 2,219 additional indexed names. It is local input for occupation retrieval; it is bundled with the extension and never downloaded or sent anywhere at runtime.

## Files

| File                                  | Purpose                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `anzsco-v1.3.json`                    | Generated records, official source URLs, checksums and transformation metadata |
| `index.ts`                            | Typed runtime records and catalogue metadata                                   |
| `it.ts`                               | Project-authored retrieval keywords for twelve IT occupations                  |
| `../../scripts/import-occupations.ts` | Import and validate the pinned official XLSX workbooks                         |

## Source and attribution

Source: Australian Bureau of Statistics and Stats NZ, [ANZSCO Version 1.3, released 5 November 2019](https://www.abs.gov.au/AUSSTATS/abs@.nsf/DetailsPage/1220.02013,%20Version%201.3?OpenDocument=). ABS material is licensed under [CC BY 4.0](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer). Adaptations are not endorsed by ABS or Stats NZ.

The source workbook URLs and SHA-256 values are pinned in the importer and retained in the generated metadata. `public/occupation-sources.txt` carries attribution into the distributed extension and must remain in the package.

## Rebuild

Use the project's supported Node.js and pnpm versions from the [main README](../../README.md), then run:

```sh
pnpm catalog:import
pnpm exec prettier --write data/occupations/anzsco-v1.3.json
```

The importer downloads `structure.xlsx` and `index.xlsx` into `.cache/anzsco-v1.3`. It can also use an existing directory:

```sh
pnpm catalog:import /path/to/workbooks
```

A source checksum mismatch stops the import. Review the upstream material before intentionally changing a checksum.

The importer reads Table 5 of the structure workbook and Table 2 of the title index. It excludes nine retired codes and operational/residual codes, checks six-digit uniqueness and expected counts, keeps the New Zealand skill level where country levels differ, removes trailing P/A/S/N markers and preserves spelling variants as aliases.

## Retrieval and limits

Runtime retrieval normalizes names and text, removes stop words and applies light inflection matching. Exact title and phrase matches rank ahead of lexical scores based on term rarity and BM25-style frequency saturation. Supplemental IT phrases activate only when the phrase occurs. O\*NET title synonyms activate only when they occur in the advertised title, and do not change term statistics.

## O\*NET title synonyms

`onet-synonyms.json` adds about 4,000 everyday titles (for example Bartender → Bar Attendant, Head Chef → Chef) to roughly 500 occupations. `../../scripts/import-occupation-synonyms.ts` builds it from pinned files:

- O\*NET 31.0 occupation, reported and lay job titles, and the O\*NET ESCO to O\*NET-SOC crosswalk ([CC BY 4.0](https://www.onetcenter.org/license_db.html)). An ESCO code begins with its ISCO-08 unit group.
- The ABS ANZSCO v1.3 to ISCO-08 correspondence (same release and licence as the catalogue).

An O\*NET occupation is linked to an ANZSCO occupation only when ISCO-08 connects them **and** one of its O\*NET titles exactly equals an official ANZSCO name (after US/UK spelling, plural and spacing normalisation; "X or Y Z" names count as "X Z" and "Y Z"). Titles are excluded when they are already official names, generic, numeric, longer than four words, claimed by several occupations, use a word belonging to another occupation's names, or are single catalogue words such as "Driver". Lay titles need at least two words and are capped at twelve per occupation. ESCO labels are used only as codes, not as synonyms.

```sh
pnpm catalog:synonyms
pnpm exec prettier --write data/occupations/onet-synonyms.json
```

Downloads are cached in `.cache/onet-31.0`. A checksum mismatch stops the import. The required O\*NET attribution is in `public/occupation-sources.txt`. O\*NET describes US occupations; synonyms are retrieval hints, not a mapping endorsed by USDOL/ETA, ABS or Stats NZ. Weak evidence can produce no candidate. The job panel shows a reference only when the advertised title itself names the occupation.

The generated `official_directory_context` combines official names, aliases and classification hierarchy. It is not a full duties definition. A vague title or description without catalogue vocabulary may miss the appropriate candidate. Supplemental keywords do not determine catalogue coverage.

ANZSCO references do not establish Green List, SMC or personal visa eligibility. NOL is a different classification and is not mixed into these identifiers. Catalogue coverage is not a claim of classification accuracy.

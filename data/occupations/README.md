# Occupation catalogue

The bundled catalogue contains **1,023 active six-digit ANZSCO v1.3 (2019) occupations**, 358 unit groups and 2,219 additional indexed names. It is local input for occupation retrieval; the complete catalogue is not sent to JEV or downloaded at runtime.

## Files

| File                                  | Purpose                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `anzsco-v1.3.json`                    | Generated records, official source URLs, checksums and transformation metadata |
| `index.ts`                            | Typed runtime records, catalogue metadata and taxonomy version                 |
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

Runtime retrieval normalizes names and text, removes stop words and applies light inflection matching. Exact title and phrase matches rank ahead of lexical scores based on term rarity and BM25-style frequency saturation. Supplemental IT phrases activate only when the phrase occurs. Weak evidence can produce no candidate; at most eight are passed to JEV in normal analysis.

The generated `official_directory_context` combines official names, aliases and classification hierarchy. It is not a full duties definition. A vague title or description without catalogue vocabulary may miss the appropriate candidate. Supplemental keywords do not determine catalogue coverage.

ANZSCO references do not establish Green List, SMC or personal visa eligibility. NOL is a different classification and is not mixed into these identifiers. Catalogue coverage is not a claim of classification accuracy.

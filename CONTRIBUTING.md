# Contributing

Thanks for helping improve RoleHarbour. Bug reports, wording fixes, translations and rule improvements are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so the approach can be agreed.
- RoleHarbour stays on-device. Changes must not add accounts, analytics, AI services or any network request other than the employer-list download. See the [privacy notice](docs/PRIVACY.md).
- Do not scrape SEEK or add code that crawls unopened jobs or calls private SEEK APIs.

## Set up and verify

Follow [Develop and verify](README.md#develop-and-verify) for the supported Node.js, pnpm and Python versions. Before opening a pull request, run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm format:check
pnpm test:release
```

The [development guide](docs/DEVELOPMENT.md) describes module boundaries, the local engine and browser verification.

## Test data

Read the [test-data rules](tests/fixtures/README.md). In short:

- Use synthetic job text. Do not paste complete real job adverts into fixtures, issues or pull requests; paraphrase the wording that matters.
- Never commit credentials, browser profiles, storage exports, CVs or personal details.
- Change benchmark labels only when the advert wording justifies it, never to fit engine output.

## Pull requests

- Keep each pull request focused on one change and describe what it fixes and how you verified it.
- Add or update tests for behaviour changes, and update the five UI languages when you change interface text.
- `main` only accepts pull requests whose CI check ("Check and package") passes.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).

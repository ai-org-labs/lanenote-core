# LaneNote Core Release Plan

Current planning date: 2026-07-20

LaneNote Core should release under the ai-org-labs identity:

- GitHub repository: `ai-org-labs/lanenote-core`
- npm package: `@ai-org-labs/lanenote-core`
- CDN path: `https://cdn.jsdelivr.net/npm/@ai-org-labs/lanenote-core@<version>/dist/lanenote-core.js`
- GitHub Pages demo: `https://ai-org-labs.github.io/lanenote-core/`
- License: Apache-2.0

As of 2026-07-20, npm lookup returned 404 for both `lanenote-core` and `@ai-org-labs/lanenote-core`, so the scoped package name appears unclaimed or inaccessible from this environment.

## Recommended Timeline

| Date | Release | Channel | Purpose |
| --- | --- | --- | --- |
| 2026-07-22 | `v0.2.0-alpha.1` | GitHub tag/release only | Freeze current browser-local DSL direction and invite close review. |
| 2026-07-29 | `v0.2.0-beta.1` | GitHub + npm beta tag | Validate npm/CDN consumption and browser-local authoring with real notes. |
| 2026-08-05 | `v0.2.0` | GitHub + npm latest + Pages | Public MVP release if beta gates pass without source-truth regressions. |

This timing is deliberately compact because the artifact is a local, dependency-free browser plugin. The release should slip rather than weaken source-truth, date, or packaging gates.

## Release Gates

Alpha can ship when:

- `dist/lanenote-core.js` exposes the documented `LaneNoteCore` global API.
- `examples/browser-local.html` works from a local file URL.
- `LICENSE` exists and package metadata declares Apache-2.0.
- `docs/SYNTAX.md` and `docs/AI_AUTHORING_GUIDE.md` describe textarea-full DSL accurately.
- `npm test` passes.
- `npm run qif` passes.
- AOF `organization-verify` passes.

Beta can ship when:

- GitHub repository exists under `ai-org-labs/lanenote-core`.
- npm scoped package metadata is correct.
- `npm pack --dry-run` includes `dist`, `examples`, `docs`, `README.md`, `LICENSE`, and `qif`.
- GitHub Pages workflow deploys the root static site and the public demo opens.
- CDN URL loads the published beta bundle.
- Safari and Chrome both render matrix layout without grid drift in the browser-local demo.
- A user can copy only the textarea content and preserve Lens/role/filter behavior.

Public `v0.2.0` can ship when:

- Beta feedback confirms the Mermaid-like textarea-full DSL is understandable.
- Date rules for `M/D`, `今日`, and `明日` are accepted as human-readable and non-drifting.
- Card chips remain compact and do not reintroduce noisy provenance.
- Missing date and missing role lanes remain visible.
- README examples use the final scoped npm package and CDN path.
- GitHub Pages URL is public and points to the browser-local demo.
- GitHub release notes state v0.2 limitations clearly.

## Versioning

Use semver:

- `0.2.0-alpha.1`: close-review snapshot.
- `0.2.0-beta.1`: public package dry run with beta npm dist-tag.
- `0.2.0`: first public MVP.

Breaking syntax changes before `1.0.0` are allowed, but release notes must call them out. Once notes are published and users start copying textarea DSL between environments, front matter keys should be treated carefully even in `0.x`.

## npm Publishing Shape

`package.json` should publish as:

```json
{
  "name": "@ai-org-labs/lanenote-core",
  "version": "0.2.0",
  "main": "./dist/lanenote-core.js",
  "browser": "./dist/lanenote-core.js",
  "license": "Apache-2.0",
  "publishConfig": {
    "access": "public"
  }
}
```

Recommended publish commands:

```sh
npm publish --access public --tag beta
npm publish --access public
```

Use `--tag beta` for `0.2.0-beta.1`. Use the default `latest` tag only for `0.2.0`.

## GitHub Release Shape

Repository setup checklist:

- Create `ai-org-labs/lanenote-core`.
- Push source with `.aof`, `dist`, `docs`, `examples`, `qif`, `test`, `README.md`, and `package.json`.
- Add topics: `lanenote`, `browser-local`, `cdn`, `markdown`, `dsl`, `aof`, `qif`.
- Enable GitHub Pages with GitHub Actions as the source.
- Protect `main` after the first release if the repository will accept external changes.
- Attach release notes that include CDN usage and current limitations.

## GitHub Pages Shape

Pages is included in the public release. The repository contains:

- `index.html`: redirects the root Pages URL to the browser-local demo.
- `examples/browser-local.html`: interactive demo.
- `dist/lanenote-core.js`: script loaded by the demo through a relative path.
- `.github/workflows/pages.yml`: deploys the static repository contents to Pages on `main`.

Expected public URL:

```txt
https://ai-org-labs.github.io/lanenote-core/
```

Suggested release note outline:

```md
# LaneNote Core v0.2.0

LaneNote Core is a CDN-loadable browser-local renderer for Mermaid-like project notes.

## Highlights

- Textarea-full LaneNote DSL with Lens, role, group, alias, filter, and note body definitions.
- Deterministic local parsing for dates, assignees, tasks, deadlines, and candidates.
- Browser-local matrix rendering with checkbox sync back to Markdown.
- AI authoring guide and QIF evidence package included.

## Limitations

- No server-side storage.
- No runtime AI extraction.
- No external calendar or Noblit API adapter yet.
- Browser metadata is needed to preserve existing relative-date bases across reopen.
```

## Verification Commands

Run before each release candidate:

```sh
npm test
npm run qif
npm_config_cache=/private/tmp/lanenote-npm-cache npm pack --dry-run
/Users/mn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/mn/codex/.cache/aof-v6.5.0/src/cli.js organization-verify
```

Current 2026-07-20 status:

- Runtime tests: passing.
- QIF validation: passing.
- AOF organization verification: passing, 47 checks.
- npm scoped package lookup: 404, package appears not published from this environment.
- npm dry-run packaging: passing after using a writable temporary npm cache.
- License decision: Apache-2.0.
- Pages decision: publish the browser-local demo through GitHub Pages.

## Open Release Decisions

- Decide whether `dist/lanenote-core.js` is the only distributed artifact or whether a minified copy should be added.
- Decide whether `docs/AI_AUTHORING_GUIDE.md` should be advertised as the canonical AI-facing contract for downstream agents.

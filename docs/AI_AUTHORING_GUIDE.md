# LaneNote AI Authoring Guide v0.2

This guide is for AI agents that generate, edit, review, or integrate LaneNote source. It should be enough to understand the notation, the browser-local tool surface, and the boundaries of safe interpretation.

LaneNote is a Mermaid-like, browser-local note renderer. The textarea is the complete durable source. It contains both:

- `lanenote:` front matter DSL for views, roles, aliases, groups, and opening filters.
- Markdown-like body text for everyday notes and tasks.

Host JavaScript may pass a fallback `profile`, but source-local DSL wins. When in doubt, preserve the textarea text and make the derived view explainable from that text.

## Mental Model

LaneNote turns informal notes into a Lens matrix. The renderer does not ask a server or AI model to infer meaning at runtime. It uses deterministic local rules.

Primary goals:

- Let humans write rough project notes without cleaning them into a database.
- Keep the textarea as the source of truth.
- Render missing dates and missing assignees explicitly instead of hiding them.
- Keep scheduled dates and due dates separate.
- Freeze relative dates by line writing time in browser metadata.
- Avoid noisy cards; show only actionable or disambiguating chips.

Non-goals in v0.2:

- AI extraction in the browser runtime.
- External calendar sync.
- Noblit document API integration.
- Server-side storage.
- Arbitrary natural-language scheduling guesses.

## Complete Source Shape

Use this as the canonical source pattern:

```md
---
lanenote:
  profile.defaultLens: timeline
  lenses.timeline.label: 時系列 × 担当
  lenses.timeline.rows: scheduledAt
  lenses.timeline.columns: assignee
  lenses.reverse.label: 担当 × 日付
  lenses.reverse.rows: assignee
  lenses.reverse.columns: scheduledAt
  lenses.productPhase.label: 製品 × 工程
  lenses.productPhase.rows: product
  lenses.productPhase.columns: phase
  roles.PM.group: 推進
  roles.企画.group: 推進
  roles.開発.group: 開発系
  roles.インフラ.group: 開発系
  roles.評価.aliases: QA
  roles.評価.group: 品質系
  roles.私.group: 個人
  filters.status: All
  filters.assignee: All
  filters.dateRole: All
---

# Product A v2.4 リリース計画

8/5
開発
- [ ] Product A 認証API実装 !8/8
- [ ] Product A データ移行手順レビュー !8/9

インフラ
- [ ] Product A 本番監視設定 !8/9

8/10
QA
- [ ] Product A 結合試験 !8/12
```

The front matter is intentionally flat. Do not invent nested YAML objects unless the runtime has been extended to parse them.

## Front Matter Keys

Recognized current keys:

| Key | Meaning | Example |
| --- | --- | --- |
| `profile.defaultLens` | Opening Lens ID | `timeline` |
| `defaultLens` | Legacy alias for opening Lens | `productPhase` |
| `lens` | Legacy alias for opening Lens | `reverse` |
| `lenses.<id>.label` | Human label in toolbar | `時系列 × 担当` |
| `lenses.<id>.rows` | Matrix row axis | `scheduledAt` |
| `lenses.<id>.columns` | Matrix column axis | `assignee` |
| `roles.<name>.aliases` | Comma-separated aliases | `QA, tester` |
| `roles.<name>.group` | Role group header | `品質系` |
| `filters.status` | Opening status filter | `Open` |
| `filters.assignee` | Opening assignee filter | `開発` |
| `filters.dateRole` | Opening date-role filter | `planned` |
| `filters.query` | Opening text filter | `Product A` |
| `baseDate` | Import-time date basis fallback | `2026-07-20` |
| `dateRole` | Default role for plain dates | `planned` |
| `assignees` | Comma-separated role dictionary | `開発, 評価, PM` |
| `groups.<group>` | Legacy group-to-role mapping | `開発, インフラ` |
| `rows` | Legacy row axis | `date` |
| `columns` | Legacy column axis | `assignee` |

Supported axes:

- `date`
- `scheduledAt`
- `dueAt`
- `eventAt`
- `recordedAt`
- `assignee`
- `product`
- `phase`
- `quality`
- `status`

Supported status values:

- `Open`
- `In Progress`
- `Blocked`
- `Done`
- `Hidden`
- `Archive`

## Body Syntax

Use three human-friendly rules:

1. A date-only line sets the scheduled date for following items.
2. A standalone line immediately followed by list items becomes the assignee lane.
3. `[ ]` creates an Open task, `[x]` creates a Done task, and `!date` sets only the due date.

Example:

```md
7/20

開発
- [ ] API修正 !7/21
- [ ] APIレビュー !7/24

評価
- APIテスト

明日 私 散髪
```

Derived meaning:

- `API修正`: `scheduledAt=2026-07-20`, `dueAt=2026-07-21`, `assignee=開発`, `status=Open`.
- `APIレビュー`: same scheduled context, separate due date.
- `APIテスト`: action candidate, not an Open task because it has no checkbox.
- `散髪`: event candidate with a relative scheduled date and assignee `私`.

Fast-capture lane syntax is also valid:

```md
7/20
:アプリ
あれやる
これやる
それやる

7/21
:データ
あちら
こちら

7/21 [ ]そちら !7/25
```

AI agents should preserve this style when the user is writing rough notes. `:アプリ` and `:データ` are explicit assignee lanes. Bare lines under an active date or lane become dated items or candidates. The final line is an Open task with `scheduledAt=7/21`, inherited `assignee=データ`, and `dueAt=7/25`.

## Date Rules

Recognized human dates:

- `YYYY-MM-DD`
- `M/D`
- `今日`
- `明日`

Date behavior:

- Plain dates set `scheduledAt` by default.
- `!7/21`, `〆7/21`, `期限7/21`, and `締切7/21` set `dueAt`.
- `dueAt` does not replace `scheduledAt`.
- `M/D` uses the writing year.
- If `M/D` would be more than 90 days behind the writing date, it rolls to the next year.
- Invalid dates such as `2/30` are not normalized; the item lands in `日付なし`.
- `today`, `tomorrow`, and English month names are not recognized in v0.2.

Relative dates:

- Browser editing stores line IDs and `writtenAt` timestamps outside the visible source in local metadata.
- `今日` and `明日` resolve from each line's writing timestamp.
- The text remains `明日`; reopening later does not move that existing line.
- A newly appended `明日` line gets a new writing timestamp and resolves from that later edit time.
- Plain Markdown imported without metadata receives a new import-time basis.
- `@written 2026-07-20T10:00:00+09:00` is accepted for deterministic fixtures and legacy text, but normal users do not need to type it.

## Assignee Rules

Assignee detection is deterministic:

- A `:名前` line is an explicit assignee lane.
- A standalone heading before list items is learned as a role.
- A role or alias at the exact start of an item line is recognized.
- `assignee:<name>` and `role:<name>` fields are recognized.
- Arbitrary title substrings are not roles.

Example:

```md
評価
- APIテスト

QA - [x] 結合試験完了
- [ ] OpenAI APIを確認
```

If `roles.評価.aliases: QA` exists, `QA` resolves to `評価`. `AI` inside `OpenAI` must not become an assignee.

Missing assignees render in `役割なし`.

## Inline Fields

Inline fields override or enrich a single item:

```md
- [ ] assignee:開発 planned:7/20 due:7/21 product:ProductA phase:実装 API修正
- [ ] role:QA status:Blocked quality:レビュー 結合試験が詰まっている
- event:2026-08-14 product:ProductA リリース判定
- recorded:2026-08-15 障害メモ
```

Supported token and hash forms:

- `date:<date>` or `#date/<date>`
- `planned:<date>` or `#planned/<date>`
- `due:<date>` or `#due/<date>`
- `event:<date>` or `#event/<date>`
- `recorded:<date>` or `#recorded/<date>`
- `assignee:<name>` or `#assignee/<name>`
- `role:<name>` or `#role/<name>`
- `group:<name>` or `#group/<name>`
- `product:<name>` or `#product/<name>`
- `phase:<name>` or `#phase/<name>`
- `quality:<name>` or `#quality/<name>`
- `status:<value>` or `#status/<value>`

Quoted token values are accepted for spaces:

```md
- [ ] product:"Product A" phase:"結合 試験" 確認
```

## Tasks, Notes, And Candidates

Classification:

- Checkbox line: `kind=task`, `task=true`, status from checkbox unless overridden.
- Non-checkbox actionable line: `kind=action-candidate`, not an Open task.
- Dated non-action line: `kind=event-candidate`, calendar candidate.
- Other content: `kind=note`.

Actionable words currently include Japanese terms such as `する`, `対応`, `確認`, `作る`, `修正`, `登録`, `準備`, `レビュー`, `試験`, `テスト`, `リリース`, and `依頼`.

Do not turn non-checkbox candidates into tasks automatically. The source must stay honest.

## Product, Phase, And Quality

LaneNote can derive lightweight work hints.

Product:

- Explicit `product:<name>` wins.
- Otherwise the runtime detects strings such as `Product A`, `製品A`, or `認証API`.

Phase hints include:

- `結合試験`
- `単体試験`
- `要件`
- `設計`
- `実装`
- `開発`
- `試験`
- `テスト`
- `QA`
- `リリース`
- `運用`

Quality hints include:

- `レビュー`
- `結合試験`
- `単体試験`
- `証跡`
- `品質`
- `ブロック`
- `Blocked`

Use explicit inline fields when precision matters.

## Rendering Behavior

The matrix is computed from Lens axes:

- `rows` chooses row lanes.
- `columns` chooses column lanes.
- If both axes are the same, the renderer falls back to a useful different column axis.
- Empty axis values render as visible lanes such as `日付なし`, `役割なし`, `製品なし`, or `工程なし`.
- Assignee columns can be grouped and folded in the browser without changing source.
- Toolbar filters affect only the current view unless written into front matter.

Card display is intentionally compact:

- Show due dates and overdue/past-open alerts.
- Show product and one useful work hint such as phase or quality.
- Show candidate state for non-task suggestions.
- Show relative or rollover provenance when useful.
- Do not show routine chips such as `planned` or `8/5→2026-08-05`.
- Keep provenance in the evidence/decision line when it helps debugging.

## Browser Plugin API

Load the runtime as a plain script:

```html
<div id="lanenote"></div>
<script src="https://cdn.example.com/lanenote-core@0.2.0/dist/lanenote-core.js"></script>
<script>
  const app = LaneNoteCore.create("#lanenote", {
    storageKey: "my-note"
  });
</script>
```

Global:

```js
window.LaneNoteCore
```

Static helpers:

- `LaneNoteCore.version`
- `LaneNoteCore.create(container, options)`
- `LaneNoteCore.parse(source, options)`
- `LaneNoteCore.renderMatrix(model, target, options)`
- `LaneNoteCore.getDefaultProfile()`
- `LaneNoteCore.getDefaultTemplates()`
- `LaneNoteCore.exportProjectedMarkdown(model, options)`
- `LaneNoteCore.exportPortableJSON(model, lineMetadata)`
- `LaneNoteCore.replaceCheckboxAtLine(source, lineIndex, done)`

`create(container, options)` options:

- `source`: initial full LaneNote source.
- `storageKey`: localStorage key for autosaved source.
- `assignees`: fallback role dictionary.
- `profile`: optional host fallback profile.
- `templates`: optional additional templates.
- `lens`: explicit current-session Lens override.
- `baseDate`: fallback basis for yearless and relative dates when no line metadata exists.
- `defaultDateRole`: fallback role for plain scheduled dates.
- `onChange(model)`: callback after parse/render.

Returned instance:

- `parse()`
- `render()`
- `getSource()`
- `setSource(text)`
- `getLens()`
- `setLens(idOrDefinition)`
- `getTemplates()`
- `applyTemplate(id)`
- `exportMarkdown()`
- `downloadMarkdown(filename)`
- `exportJSON()`
- `downloadJSON(filename)`
- `destroy()`

## Derived Model Shape

`parse(source, options)` returns:

```js
{
  version,
  source,
  config,
  profile,
  assigneeGroups,
  items,
  assignees,
  dates,
  dateRoles,
  groups
}
```

Each item includes:

- identity: `id`, `anchor`, `lineIndex`
- text: `title`
- classification: `kind`, `task`, `calendarCandidate`, `status`
- dates: `date`, `dateRole`, `scheduledAt`, `dueAt`, `eventAt`, `recordedAt`
- raw date/provenance: `dateRaw`, `dateBasis`, `dateInference`, `scheduledRaw`, `scheduledSource`, `dueRaw`, `dueSource`, `eventRaw`, `recordedRaw`, `dateSource`, `writtenAt`
- organization: `assignee`, `assigneeSource`, `group`, `product`, `phase`, `quality`
- state hints: `pastDate`, `pastOpen`, `overdue`, `confidence`, `provenance`

The compatibility `date` field is the projected date used when a Lens asks for `date`. It falls back through scheduled, event, due, then recorded date.

## Authoring Guidance For AI

When generating LaneNote text:

- Put the complete `lanenote:` DSL at the top when creating a reusable note or template.
- Use short date context lines for grouped work.
- Use standalone role headings when several items share an assignee.
- Use checkboxes only for tasks the human is expected to track.
- Use `!date` for deadlines.
- Use explicit fields for high-precision product, phase, quality, status, or date-role needs.
- Prefer `YYYY-MM-DD` when a date must be unambiguous across years.
- Preserve user wording in titles; do not silently rewrite rough notes into formal task names.
- Keep unknown or missing values visible rather than guessing.

When editing existing LaneNote text:

- Do not remove front matter unless replacing it with an equivalent complete DSL.
- Do not rewrite `明日` or `今日` into absolute dates unless the user asks.
- Do not convert all candidates into checkbox tasks.
- Do not collapse scheduled and due dates into one field.
- Do not infer roles from substrings inside words.
- Do not remove local evidence comments from exported Markdown unless explicitly cleaning an export.

When reviewing generated text:

- Check that every Lens has both `rows` and `columns`.
- Check that role aliases point to the intended canonical role.
- Check that `profile.defaultLens` names an existing Lens.
- Check that `M/D` dates are acceptable for the intended writing year.
- Check that `!date` is used only for deadlines.
- Check that important work without a checkbox is intentionally a candidate, not an accidentally missed task.
- Check that noisy metadata is not shown as user-facing card chips.

## Safe Defaults

If an AI is unsure:

- Use `timeline` as the default Lens.
- Use `scheduledAt` rows and `assignee` columns for timeline planning.
- Use `assignee` rows and `scheduledAt` columns for WBS scanning.
- Use `product` rows and `phase` columns for product/process tracking.
- Put missing date/role information into source-visible gaps rather than inventing data.
- Keep filters at `All` unless the user asks for a narrowed opening view.
- Use `baseDate` only in tests, deterministic examples, or imports without browser metadata.

## Verification Commands

Run these before claiming implementation correctness:

```sh
npm test
npm run qif
/Users/mn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/mn/codex/.cache/aof-v6.5.0/src/cli.js organization-verify
```

Expected current results:

- `npm test`: `LaneNoteCore v0.2 tests passed`
- `npm run qif`: QIF package validation passed
- `organization-verify`: 47 checks passed, 0 failed

These commands are evidence for the current implementation structure and rule coverage. They are not a claim that the product is ready for public release or external integrations.

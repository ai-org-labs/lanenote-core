# LaneNote Syntax v0.2

LaneNote source is ordinary Markdown plus a small `lanenote:` front matter DSL. The textarea is the complete durable source: view definitions, role aliases, groups, filters, and daily notes live together in one text block.

There are two layers:

- Textarea DSL: the source of truth, similar to a Mermaid diagram block.
- Host fallback: optional JavaScript defaults supplied by an embedding page.

When both exist, the textarea DSL wins. Copying the textarea to another browser should preserve the intended view.

## Full Textarea DSL

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
  roles.開発.group: 開発系
  roles.評価.aliases: QA
  roles.評価.group: 品質系
  filters.status: All
  filters.assignee: All
  filters.dateRole: All
---

8/5
開発
- [ ] Product A 認証API実装 !8/8

QA
- [ ] Product A 結合試験 !8/12
```

`lanenote:` keys are deliberately flat and copyable:

- `profile.defaultLens` chooses the opening Lens.
- `lenses.<id>.label`, `lenses.<id>.rows`, and `lenses.<id>.columns` define a Lens.
- `roles.<name>.aliases` defines comma-separated aliases.
- `roles.<name>.group` assigns a role to a column group.
- `filters.status`, `filters.assignee`, `filters.dateRole`, and `filters.query` define the opening filter state.

The legacy `lens:`, `rows:`, `columns:`, `dateRole:`, `assignees:`, and `groups.<name>:` keys remain readable.

## The Three Rules

1. A date-only line sets the scheduled date until the next date line.
2. A standalone line immediately followed by list items is an assignee lane, including a role not seen before.
3. `[ ]` creates a Task and `!date` sets only that Task's due date.

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

- `API修正`: `scheduledAt=7/20`, `dueAt=7/21`, `assignee=開発`, Task/Open
- `APIレビュー`: `scheduledAt=7/20`, `dueAt=7/24`, `assignee=開発`, Task/Open
- `APIテスト`: `scheduledAt=7/20`, `assignee=評価`, action candidate, not an Open Task
- `散髪`: scheduled for the resolved `明日`, assigned to `私`, event candidate

No front matter is required for normal authoring.

## Context And Scope

- A date context remains active until another date context appears.
- An assignee context remains active until another assignee context appears.
- Blank lines are for readability and do not reset context.
- A date or assignee written on an item line applies only to that item.
- Missing values remain visible in `日付なし` and `役割なし` lanes.

Combined context is accepted:

```md
7/20 開発
- [ ] API修正
```

The expanded form is recommended when several items share the same context.

For faster capture, a role lane may be written with a leading colon. Bare lines under an active date or role are kept as dated items or candidates.

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

Derived meaning:

- `あれやる`, `これやる`, `それやる`: `scheduledAt=7/20`, `assignee=アプリ`, action candidates.
- `あちら`, `こちら`: `scheduledAt=7/21`, `assignee=データ`.
- `そちら`: checkbox task, `scheduledAt=7/21`, inherited `assignee=データ`, `dueAt=7/25`.

## Assignee Recognition

Deterministic recognition uses structure and exact leading tokens. LaneNote does not search arbitrary substrings in the title.

```md
評価
- APIテスト

明日 私 散髪
QA - [x] 結合試験完了
- [ ] OpenAI APIを確認
```

- `評価` is learned from its position immediately before list items.
- `私` and `QA` are exact leading role tokens.
- `AI` inside `OpenAI` is not treated as an assignee and is not removed from the title.
- Explicit `assignee:` and `role:` remain available as compatibility and integration forms.

## Date Model

One item can retain multiple dates.

| Field | Meaning | Normal source |
| --- | --- | --- |
| `scheduledAt` | Work or placement date | date context or leading date |
| `dueAt` | Deadline | `!7/21` |
| `eventAt` | Explicit event date | integration field `event:` |
| `recordedAt` | Observation or journal date | daily heading or integration field |

The default timeline uses `scheduledAt`, falling back to event, due, then recorded date when no scheduled date exists. A due marker never erases the scheduled date.

Recognized human dates are `YYYY-MM-DD`, `M/D`, `今日`, and `明日`. `M/D` uses the writing year and rolls to the next year when that date would be more than 90 days behind the writing date. Invalid dates such as `2/30` are not normalized into another day.

## Relative Dates

The browser runtime assigns each source line a stable block ID and a written timestamp in local metadata. `今日`, `明日`, and yearless dates resolve from that timestamp, so reopening the note later does not move them.

- The source text remains `明日`.
- Cards show the resolved absolute date.
- Newly appended lines receive their own writing timestamp.
- Portable JSON includes source text and line metadata.
- Plain Markdown without its metadata is treated as a new import and receives a new import-time basis.
- `@written` remains readable for legacy files and deterministic fixtures, but users do not need to type it during normal browser editing.

## Tasks And Candidates

```md
- [ ] Open Task
- [x] Done Task
- APIテスト
明日 私 散髪
```

- Only checkbox items are Tasks with Open/Done state.
- A non-checkbox action line is an action candidate.
- A dated non-action line is an event candidate.
- Candidates can later offer Task or Calendar actions without changing the source automatically.

## Roles, Aliases, And Groups

Roles discovered in the note are usable immediately. Stable aliases and groups belong in the textarea DSL.

```md
---
lanenote:
  roles.開発.group: 開発系
  roles.評価.aliases: QA
  roles.評価.group: 品質系
  roles.私.group: 個人
---
```

This allows `QA` and `評価` to share one identity. Group and column folding affect only the current browser view.

## Lens Definitions

Lens definitions are written in the textarea DSL.

```md
---
lanenote:
  profile.defaultLens: productPhase
  lenses.timeline.label: 時系列 × 担当
  lenses.timeline.rows: scheduledAt
  lenses.timeline.columns: assignee
  lenses.productPhase.label: 製品 × 工程
  lenses.productPhase.rows: product
  lenses.productPhase.columns: phase
---
```

Supported axes are currently `date`, `scheduledAt`, `dueAt`, `eventAt`, `recordedAt`, `assignee`, `product`, `phase`, `quality`, and `status`. `date` is a compatibility projection field.
When the source contains multiple lenses, the browser toolbar exposes a Lens selector; `setLens()` provides the same switch through the plugin API for the current session.

The current default profile is still available to host pages as a fallback:

```js
const profile = LaneNoteCore.getDefaultProfile();
```

Source notes may select an already defined Lens with the short legacy key:

```md
---
lanenote:
  lens: productPhase
---
```

The source-local `lens:` override is treated like `profile.defaultLens`.

## View Filters

Filters can be expressed in front matter when a saved note or template should open with a specific view state.

```md
---
lanenote:
  filters.status: Open
  filters.assignee: 開発
  filters.dateRole: planned
  filters.query: Product A
---
```

Supported filter keys:

- `filters.status`
- `filters.assignee`
- `filters.dateRole`
- `filters.query`

Rules:

- Filters affect only the derived view.
- Filters do not rewrite the source note.
- Browser toolbar changes override the initial front matter filter during the current session.
- Templates may include filters when the template is meant to answer a narrow question.

## Card Display

Cards intentionally do not show every derived attribute as a chip.

Visible chips are reserved for:

- deadline or overdue state
- relative date provenance when it would otherwise be confusing, such as `明日→7/20`
- product and one useful work hint such as phase or quality
- candidate state for non-task action/event suggestions

Routine provenance, such as `8/5` being normalized to `2026-08-05`, is kept in the card title tooltip and the small evidence line instead of becoming another chip.

## View Templates

Templates are ordinary complete LaneNote source text linked to a Lens. The built-in set includes the full `lanenote:` DSL plus a Product A release project and provides `リリース計画`, `担当別WBS`, and `製品別工程管理` examples.

```md
---
lanenote:
  profile.defaultLens: timeline
  lenses.timeline.rows: scheduledAt
  lenses.timeline.columns: assignee
  roles.開発.group: 開発系
---

8/5
開発
- [ ] Product A 認証API実装 !8/8
```

- The active Lens determines which templates appear in the toolbar.
- Applying a template replaces the current source after confirmation and switches to the template's Lens.
- `getTemplates()` and `applyTemplate(id)` expose the same behavior to host code.
- `LaneNoteCore.getDefaultTemplates()` returns a copy of the built-in templates.
- Templates reduce repeated setup text; they do not introduce a second source format.

## Export

`exportMarkdown()` produces a human-oriented Markdown projection. Source evidence is retained in hidden HTML comments instead of visible metadata strings.

`exportJSON()` produces a portable bundle containing:

- source Markdown
- stable block IDs and written timestamps
- profile data
- derived semantic items and provenance

Neither export rewrites the active source note.

## Compatibility Syntax

Existing v0.1 notes remain readable. These forms are no longer recommended for everyday writing:

```md
---
lanenote:
  rows: date
  columns: assignee
  baseDate: 2026-07-19
  dateRole: planned
  assignees: 開発, 評価, PM
  groups.開発系: 開発, インフラ
---

- [ ] assignee:開発 due:7/21 phase:実装 API修正
```

Legacy `due:`, `planned:`, `event:`, `recorded:`, `date:`, `assignee:`, `role:`, hash fields, `期限`, and `締切` remain parser inputs for host systems and migration. `!date` is the only canonical human deadline form.

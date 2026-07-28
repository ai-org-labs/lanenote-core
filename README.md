# LaneNote Core

LaneNote Core is a browser-local smart note renderer. It keeps the Markdown-compatible source note as the source of truth, extracts deterministic task/date/assignee signals, and renders the default `timeline x assignee` Lens without requiring a server.

This repository is structured so the runtime can be published as a CDN-loaded plugin, similar to small browser plugins that expose a single global object.

License: Apache-2.0.

GitHub Pages can publish the browser-local demo from this repository. The root page redirects to `examples/browser-local.html`.

## CDN Style Usage

```html
<div id="lanenote"></div>
<script src="https://cdn.jsdelivr.net/npm/@ai-org-labs/lanenote-core@0.2.0/dist/lanenote-core.js"></script>
<script>
  const laneNote = LaneNoteCore.create("#lanenote", {
    storageKey: "my-note",
    source: [
      "---",
      "lanenote:",
      "  default: timeline",
      "  view.timeline: 時系列 × 担当 | scheduledAt x assignee",
      "  role.評価: QA @品質系",
      "---",
      "",
      "8/5",
      "開発",
      "- [ ] Product A 認証API実装 !8/8"
    ].join("\n")
  });
</script>
```

For local development, open [examples/browser-local.html](/Users/mn/development/LaneNote/examples/browser-local.html) in a browser.

## Standalone Local Tool

Open [examples/standalone.html](/Users/mn/development/LaneNote/examples/standalone.html) directly after downloading the repository or npm package. It is a single-file web tool with the LaneNote runtime inlined, so it can run from `file://` without a dev server, CDN, or upload endpoint.

The standalone tool stores data only in the browser's `localStorage`:

- Latest state is saved continuously under `lanenote-standalone:latest:v1` and restored on startup.
- Manual backup is saved when the user clicks `バックアップ保存`.
- Automatic backup runs on a periodic change check when the current source differs enough from the last backup.
- Backup history keeps the latest 10 generations under `lanenote-standalone:backups:v1`.
- `復元` replaces the editor with a selected backup while keeping the pre-restore content as the latest saved state.

To regenerate the standalone file after changing `dist/lanenote-core.js`, run:

```sh
npm run standalone
```

## Syntax

The implemented MVP syntax is documented in [docs/SYNTAX.md](/Users/mn/development/LaneNote/docs/SYNTAX.md).

LaneNote follows a Mermaid-like source model: the textarea contains the complete LaneNote DSL, including view definitions, role aliases, groups, filters, and the everyday note body. The optional JavaScript `profile` remains as a host fallback for embedding pages, but source-local DSL takes precedence.

## Plugin API

`LaneNoteCore.create(container, options)` mounts an editor and Lens preview into a DOM element.

Options:

- `source`: initial Markdown-compatible source note.
- `storageKey`: localStorage key for browser-local autosave.
- `assignees`: assignee dictionary used by the deterministic parser.
- `profile`: optional host fallback for roles, aliases, groups, and Lens definitions.
- `templates`: additional view-linked templates; equivalent to adding entries to `profile.templates`.
- `lens`: Lens ID from `profile.lenses`, or an inline Lens definition object.
- `baseDate`: compatibility fallback used when parsing text without browser block metadata.
- `defaultDateRole`: fallback date role for plain dates when front matter is absent.
- `onChange(model)`: callback called after parsing and rendering.

Returned instance:

- `parse()`: returns the current derived model.
- `render()`: reparses and rerenders.
- `getSource()`: returns the source note.
- `exportMarkdown()`: returns a cleaned Markdown snapshot of the currently projected view.
- `downloadMarkdown(filename)`: downloads that projected Markdown snapshot in the browser.
- `exportJSON()`: returns a portable JSON bundle with source, block timestamps, profile, and derived items.
- `downloadJSON(filename)`: downloads that portable JSON bundle.
- `getLens()` / `setLens(idOrDefinition)`: reads or switches the active Lens during the current browser session.
- `getTemplates()`: returns the merged built-in and host-defined templates.
- `applyTemplate(id)`: replaces the source with a template and switches to its linked Lens.
- `setSource(text)`: replaces the source note and rerenders.
- `destroy()`: unmounts the plugin.

Static helpers:

- `LaneNoteCore.parse(source, options)`
- `LaneNoteCore.renderMatrix(model, target, options)`
- `LaneNoteCore.getDefaultProfile()`
- `LaneNoteCore.getDefaultTemplates()`
- `LaneNoteCore.exportProjectedMarkdown(model, options)`
- `LaneNoteCore.exportPortableJSON(model, lineMetadata)`
- `LaneNoteCore.replaceCheckboxAtLine(source, lineIndex, done)`

## Current v0.2 Scope

- Textarea source is the complete durable DSL, including view definitions and the note body.
- Rule-based extraction works offline for separate scheduled/due/event/recorded dates, checkboxes, structural assignee lanes, product, phase, quality, and task state.
- Default Lens renders rows as dates and columns as assignees.
- `rows` and `columns` read resolved item fields, not space-separated token positions.
- Short context lines such as `7/20`, `開発`, and previously unknown `評価` are the normal writing style for repeated work items.
- `!7/21` sets only `dueAt`; it does not replace the inherited `scheduledAt` used by the default timeline.
- Assignee detection uses structural headings and exact leading tokens. It does not scan arbitrary title substrings.
- Inline fields such as `assignee:開発`, `role:QA`, `due:7/21`, and `date:2026-07-20` remain available when a single line needs an override.
- `!7/21` is the canonical due-date shorthand. Legacy long forms remain readable for compatibility.
- Cards expose `dateSource` and `assigneeSource` so users can see whether values came from explicit fields, context dates, exact leading roles, inherited context, or missing data.
- `rows: assignee` and `columns: date` reverse the view orientation for WBS-like scanning.
- Built-in project-management templates cover release timeline, assignee WBS, and product-by-phase views; the toolbar filters templates by the active Lens.
- Assignee columns can be grouped and folded without mutating the source note.
- Checkbox state syncs from Lens back to the Markdown checkbox line.
- The projected view can be downloaded as cleaned Markdown, preserving current filters, orientation, and folding state.
- Browser editing records stable block IDs and written timestamps outside the visible source, so relative dates keep provenance and do not drift on later renders.
- Non-checkbox items remain notes or action/event candidates rather than becoming Open tasks.
- Search, status filter, date-role filter, assignee filter, past-open highlighting, and source anchor context are available in the browser.

AI extraction, external calendar adapters, and Noblit document APIs are intentionally outside this first browser-local core.

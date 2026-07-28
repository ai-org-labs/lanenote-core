const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtimePath = path.join(__dirname, "..", "dist", "lanenote-core.js");
const runtimeSource = fs.readFileSync(runtimePath, "utf8");
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(runtimeSource, sandbox, { filename: runtimePath });

const LaneNoteCore = sandbox.LaneNoteCore;
const normalize = (value) => JSON.parse(JSON.stringify(value));

assert.equal(LaneNoteCore.version, "0.2.0");
assert.equal(typeof LaneNoteCore.exportPortableJSON, "function");
assert.equal(typeof LaneNoteCore.getDefaultTemplates, "function");
assert.equal(typeof LaneNoteCore.getDefaultProfile, "function");

const defaultProfileCopy = normalize(LaneNoteCore.getDefaultProfile());
assert.equal(defaultProfileCopy.defaultLens, "timeline");
assert.ok(defaultProfileCopy.lenses.timeline);
assert.ok(defaultProfileCopy.roles["開発"]);

const templates = normalize(LaneNoteCore.getDefaultTemplates());
assert.deepEqual(Object.keys(templates), ["releaseTimeline", "assigneeWbs", "productPhase"]);
assert.equal(templates.releaseTimeline.lens, "timeline");
assert.equal(templates.assigneeWbs.lens, "reverse");
assert.equal(templates.productPhase.lens, "productPhase");
assert.match(templates.releaseTimeline.source, /Product A v2\.4 リリース計画/);
assert.match(templates.releaseTimeline.source, /view\.timeline: 時系列 × 担当 \| scheduledAt x assignee/);
assert.match(templates.releaseTimeline.source, /role\.評価: QA @品質系/);
assert.match(templates.assigneeWbs.source, /担当別WBS/);
assert.match(templates.productPhase.source, /Product B/);

const releaseTemplateModel = normalize(LaneNoteCore.parse(templates.releaseTimeline.source, {
  baseDate: "2026-07-20"
}));
assert.ok(releaseTemplateModel.items.length >= 8);
assert.ok(releaseTemplateModel.items.some((item) => item.title.includes("認証API実装") && item.assignee === "開発"));
assert.ok(releaseTemplateModel.items.some((item) => item.title.includes("結合試験") && item.dueAt === "2026-08-12"));

const productTemplateModel = normalize(LaneNoteCore.parse(templates.productPhase.source, {
  baseDate: "2026-07-20"
}));
assert.ok(productTemplateModel.items.some((item) => item.product === "Product A" && item.phase === "結合試験"));
assert.ok(productTemplateModel.items.some((item) => item.product === "Product B"));

const canonicalSource = [
  "7/20",
  "",
  "開発",
  "- [ ] API修正 !7/21",
  "- [ ] APIレビュー !7/24",
  "",
  "評価",
  "- APIテスト",
  "",
  "明日 私 散髪",
  "- [ ] OpenAI APIを確認"
].join("\n");

const canonical = normalize(LaneNoteCore.parse(canonicalSource, {
  baseDate: "2026-07-19",
  now: "2026-07-22"
}));

assert.equal(canonical.items.length, 5);
assert.deepEqual(canonical.assignees, ["開発", "私", "評価"]);

const repair = canonical.items.find((item) => item.title === "API修正");
assert.ok(repair);
assert.equal(repair.kind, "task");
assert.equal(repair.scheduledAt, "2026-07-20");
assert.equal(repair.dueAt, "2026-07-21");
assert.equal(repair.date, "2026-07-20");
assert.equal(repair.dateRole, "planned");
assert.equal(repair.dueSource, "shorthand:due");
assert.equal(repair.assignee, "開発");
assert.equal(repair.assigneeSource, "inherited");
assert.equal(repair.status, "Open");
assert.equal(repair.overdue, true);

const review = canonical.items.find((item) => item.title === "APIレビュー");
assert.equal(review.scheduledAt, "2026-07-20");
assert.equal(review.dueAt, "2026-07-24");
assert.equal(review.overdue, false);

const apiTest = canonical.items.find((item) => item.title === "APIテスト");
assert.equal(apiTest.assignee, "評価");
assert.equal(apiTest.kind, "action-candidate");
assert.equal(apiTest.task, false);
assert.equal(apiTest.status, "");
assert.equal(apiTest.pastOpen, false);

const haircut = canonical.items.find((item) => item.title === "散髪");
assert.equal(haircut.assignee, "私");
assert.equal(haircut.scheduledAt, "2026-07-20");
assert.equal(haircut.dateRaw, "明日");
assert.equal(haircut.kind, "event-candidate");
assert.equal(haircut.calendarCandidate, true);

const openAi = canonical.items.find((item) => item.title.includes("OpenAI"));
assert.ok(openAi);
assert.equal(openAi.title, "OpenAI APIを確認");
assert.equal(openAi.assignee, "評価");
assert.notEqual(openAi.assignee, "AI");

const combined = normalize(LaneNoteCore.parse([
  "7/20 開発",
  "- [ ] API修正 !7/21"
].join("\n"), { baseDate: "2026-07-19" }));
assert.equal(combined.items[0].scheduledAt, "2026-07-20");
assert.equal(combined.items[0].dueAt, "2026-07-21");
assert.equal(combined.items[0].assignee, "開発");

const lazyLaneSource = [
  "7/20",
  ":アプリ",
  "あれやる",
  "これやる",
  "それやる",
  "",
  "7/21",
  ":データ",
  "あちら",
  "こちら",
  "",
  "7/21 [ ]そちら !7/25"
].join("\n");
const lazyLane = normalize(LaneNoteCore.parse(lazyLaneSource, {
  baseDate: "2026-07-20"
}));
assert.equal(lazyLane.items.length, 6);
assert.equal(lazyLane.items[0].title, "あれやる");
assert.equal(lazyLane.items[0].scheduledAt, "2026-07-20");
assert.equal(lazyLane.items[0].assignee, "アプリ");
assert.equal(lazyLane.items[0].kind, "action-candidate");
assert.ok(lazyLane.items.some((item) => item.title === "あちら" && item.assignee === "データ" && item.scheduledAt === "2026-07-21"));
const lazyDueTask = lazyLane.items.find((item) => item.title === "そちら");
assert.ok(lazyDueTask);
assert.equal(lazyDueTask.task, true);
assert.equal(lazyDueTask.status, "Open");
assert.equal(lazyDueTask.assignee, "データ");
assert.equal(lazyDueTask.scheduledAt, "2026-07-21");
assert.equal(lazyDueTask.dueAt, "2026-07-25");

const dueOnly = normalize(LaneNoteCore.parse("- [ ] API修正 !7/21", {
  baseDate: "2026-07-19"
}));
assert.equal(dueOnly.items[0].scheduledAt, "");
assert.equal(dueOnly.items[0].dueAt, "2026-07-21");
assert.equal(dueOnly.items[0].date, "2026-07-21");
assert.equal(dueOnly.items[0].dateRole, "due");

const frontMatterAssignee = normalize(LaneNoteCore.parse([
  "---",
  "lanenote:",
  "  baseDate: 2026-07-19",
  "  assignees: 開発, 評価, PM",
  "---",
  "評価 - [ ] APIテスト"
].join("\n")));
assert.equal(frontMatterAssignee.items[0].assignee, "評価");
assert.equal(frontMatterAssignee.items[0].assigneeSource, "leading-role");

const profile = {
  defaultLens: "timeline",
  roles: {
    "開発": { group: "開発系" },
    "評価": { aliases: ["QA"], group: "品質系" }
  },
  lenses: {
    timeline: { rows: "scheduledAt", columns: "assignee" },
    reverse: { rows: "assignee", columns: "scheduledAt" },
    productPhase: { rows: "product", columns: "phase" }
  }
};

const profileModel = normalize(LaneNoteCore.parse([
  "7/20",
  "QA - [ ] product:ProductA phase:試験 結合確認"
].join("\n"), { baseDate: "2026-07-19", profile }));
assert.equal(profileModel.items[0].assignee, "評価");
assert.equal(profileModel.items[0].group, "品質系");

const timelineTarget = { innerHTML: "" };
LaneNoteCore.renderMatrix(profileModel, timelineTarget, { profile, lens: "timeline", filters: { status: "All" } });
assert.match(timelineTarget.innerHTML, />実施日<\/th>/);
assert.match(timelineTarget.innerHTML, /品質系/);
assert.doesNotMatch(timelineTarget.innerHTML, />planned<\/span>/);

const reverseTarget = { innerHTML: "" };
LaneNoteCore.renderMatrix(profileModel, reverseTarget, { profile, lens: "reverse", filters: { status: "All" } });
assert.match(reverseTarget.innerHTML, />担当<\/th>/);
assert.match(reverseTarget.innerHTML, /data-collapse-column="2026-07-20"/);

const productTarget = { innerHTML: "" };
LaneNoteCore.renderMatrix(profileModel, productTarget, { profile, lens: "productPhase", filters: { status: "All" } });
assert.match(productTarget.innerHTML, />製品<\/th>/);
assert.match(productTarget.innerHTML, /ProductA/);
assert.match(productTarget.innerHTML, /試験/);

const sourceLensModel = normalize(LaneNoteCore.parse([
  "---",
  "lanenote:",
  "  lens: productPhase",
  "---",
  "7/20",
  "QA - [ ] product:ProductA phase:試験 結合確認"
].join("\n"), { baseDate: "2026-07-19", profile }));
const sourceLensTarget = { innerHTML: "" };
LaneNoteCore.renderMatrix(sourceLensModel, sourceLensTarget, { profile, filters: { status: "All" } });
assert.match(sourceLensTarget.innerHTML, />製品<\/th>/);

const sourceOnlyDslModel = normalize(LaneNoteCore.parse([
  "---",
  "lanenote:",
  "  profile.defaultLens: productPhase",
  "  lenses.productPhase.label: 製品 × 工程",
  "  lenses.productPhase.rows: product",
  "  lenses.productPhase.columns: phase",
  "  roles.評価.aliases: QA",
  "  roles.評価.group: 品質系",
  "---",
  "7/20",
  "QA - [ ] product:ProductA phase:試験 結合確認"
].join("\n"), { baseDate: "2026-07-19" }));
assert.equal(sourceOnlyDslModel.profile.defaultLens, "productPhase");
assert.equal(sourceOnlyDslModel.profile.lenses.productPhase.rows, "product");
assert.equal(sourceOnlyDslModel.items[0].assignee, "評価");
assert.equal(sourceOnlyDslModel.items[0].group, "品質系");
const sourceOnlyDslTarget = { innerHTML: "" };
LaneNoteCore.renderMatrix(sourceOnlyDslModel, sourceOnlyDslTarget, { filters: { status: "All" } });
assert.match(sourceOnlyDslTarget.innerHTML, />製品<\/th>/);
assert.match(sourceOnlyDslTarget.innerHTML, /ProductA/);

const conciseDslModel = normalize(LaneNoteCore.parse([
  "---",
  "lanenote:",
  "  default: productPhase",
  "  view.timeline: 時系列 × 担当 | scheduledAt x assignee",
  "  view.productPhase: 製品 × 工程 | product x phase",
  "  role.評価: QA @品質系",
  "---",
  "7/20",
  "QA - [ ] product:ProductA phase:試験 結合確認"
].join("\n"), { baseDate: "2026-07-19" }));
assert.equal(conciseDslModel.profile.defaultLens, "productPhase");
assert.equal(conciseDslModel.profile.lenses.productPhase.label, "製品 × 工程");
assert.equal(conciseDslModel.profile.lenses.productPhase.rows, "product");
assert.equal(conciseDslModel.profile.lenses.productPhase.columns, "phase");
assert.equal(conciseDslModel.items[0].assignee, "評価");
assert.equal(conciseDslModel.items[0].group, "品質系");

const filterDslModel = normalize(LaneNoteCore.parse([
  "---",
  "lanenote:",
  "  filters.status: Done",
  "  filters.query: 済み",
  "---",
  "7/20",
  "開発",
  "- [x] 済みタスク",
  "- [ ] 未完了タスク"
].join("\n"), { baseDate: "2026-07-19" }));
const filterDslTarget = { innerHTML: "" };
LaneNoteCore.renderMatrix(filterDslModel, filterDslTarget, { profile, lens: "timeline" });
assert.match(filterDslTarget.innerHTML, /済みタスク/);
assert.doesNotMatch(filterDslTarget.innerHTML, /未完了タスク/);

const plainDateTarget = { innerHTML: "" };
LaneNoteCore.renderMatrix(canonical, plainDateTarget, { profile, lens: "timeline", filters: { status: "All" } });
assert.doesNotMatch(plainDateTarget.innerHTML, /7\/20→2026-07-20/);
assert.match(plainDateTarget.innerHTML, /期限 7\/21/);

const writtenByLine = normalize(LaneNoteCore.parse([
  "明日 私 散髪",
  "明日 私 確認"
].join("\n"), {
  lineMetadata: [
    { id: "a", writtenAt: "2026-08-10T10:00:00+09:00" },
    { id: "b", writtenAt: "2026-09-01T10:00:00+09:00" }
  ],
  now: "2026-09-03"
}));
assert.equal(writtenByLine.items[0].date, "2026-08-11");
assert.equal(writtenByLine.items[0].id, "a");
assert.equal(writtenByLine.items[1].date, "2026-09-02");
assert.equal(writtenByLine.items[1].id, "b");

const rollover = normalize(LaneNoteCore.parse("1/1\n開発\n- [ ] 年始確認", {
  baseDate: "2026-12-20T09:00:00+09:00"
}));
assert.equal(rollover.items[0].scheduledAt, "2027-01-01");
assert.equal(rollover.items[0].dateInference, "month-day-next-year-rollover");

const invalid = normalize(LaneNoteCore.parse("2/30\n開発\n- [ ] 日付確認", {
  baseDate: "2026-02-01"
}));
assert.equal(invalid.items[0].date, "日付なし");

const legacy = normalize(LaneNoteCore.parse([
  "---",
  "lanenote:",
  "  baseDate: 2026-07-19",
  "  dateRole: planned",
  "  groups.開発系: 開発, インフラ",
  "---",
  "- [ ] assignee:開発 planned:7/20 due:7/21 phase:実装 API修正"
].join("\n")));
assert.equal(legacy.items[0].scheduledAt, "2026-07-20");
assert.equal(legacy.items[0].dueAt, "2026-07-21");
assert.equal(legacy.items[0].group, "開発系");
assert.equal(legacy.items[0].phase, "実装");

const projected = LaneNoteCore.exportProjectedMarkdown(canonical, {
  filters: { status: "All" },
  generatedAt: "2026-07-22T00:00:00.000Z"
});
assert.match(projected, /API修正 !2026-07-21/);
assert.match(projected, /<!-- ln: id=/);
assert.doesNotMatch(projected, /`date=/);

const portable = JSON.parse(LaneNoteCore.exportPortableJSON(canonical, [
  { id: "line-1", writtenAt: "2026-07-19T10:00:00+09:00" }
]));
assert.equal(portable.format, "lanenote-portable");
assert.equal(portable.version, "0.2.0");
assert.equal(portable.source, canonicalSource);
assert.equal(portable.lineMetadata[0].id, "line-1");

const checked = LaneNoteCore.replaceCheckboxAtLine(canonicalSource, 3, true);
assert.match(checked.split("\n")[3], /\[x\]/);
const unchecked = LaneNoteCore.replaceCheckboxAtLine(checked, 3, false);
assert.match(unchecked.split("\n")[3], /\[ \]/);

const standalonePath = path.join(__dirname, "..", "examples", "standalone.html");
const standaloneHtml = fs.readFileSync(standalonePath, "utf8");
assert.match(standaloneHtml, /LaneNote Standalone/);
assert.match(standaloneHtml, /完全ローカル保存/);
assert.match(standaloneHtml, /lanenote-standalone:latest:v1/);
assert.match(standaloneHtml, /lanenote-standalone:backups:v1/);
assert.match(standaloneHtml, /lanenote-standalone:runtime:v1/);
assert.match(standaloneHtml, /maxBackups = 10/);
assert.match(standaloneHtml, /LaneNoteCore\.create/);
assert.doesNotMatch(standaloneHtml, /<script[^>]+src=/i);
assert.doesNotMatch(standaloneHtml, /\bfetch\s*\(/);
assert.doesNotMatch(standaloneHtml, /\bXMLHttpRequest\b/);
assert.doesNotMatch(standaloneHtml, /\bsendBeacon\b/);

console.log("LaneNoteCore v0.2 tests passed");

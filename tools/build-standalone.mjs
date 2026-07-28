import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtime = readFileSync(resolve(root, "dist/lanenote-core.js"), "utf8");
const inlineRuntime = runtime.replace(/<\/script/gi, "<\\/script");

const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LaneNote Standalone</title>
    <style>
      :root {
        color-scheme: light;
      }

      body {
        margin: 0;
        background: #edf0ea;
        color: #172026;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      .app-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 18px;
        border-bottom: 1px solid #d9ded6;
        background: #ffffff;
      }

      .title-block h1 {
        margin: 0;
        font-size: 18px;
        line-height: 1.2;
      }

      .title-block p {
        margin: 4px 0 0;
        color: #526258;
        font-size: 13px;
      }

      .backup-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }

      .backup-bar button,
      .backup-bar select {
        height: 32px;
        border: 1px solid #c9d0c5;
        border-radius: 6px;
        background: #fff;
        color: #172026;
        padding: 0 8px;
        font: inherit;
      }

      .backup-bar button {
        cursor: pointer;
        font-weight: 650;
      }

      .backup-status {
        min-width: 160px;
        color: #526258;
        font-size: 12px;
      }

      #lanenote {
        flex: 1;
        min-height: 0;
      }

      #lanenote.ln-root {
        border: 0;
        border-radius: 0;
      }

      #lanenote .ln-shell {
        min-height: calc(100vh - 112px);
        grid-template-columns: minmax(320px, 42%) minmax(0, 1fr);
      }

      #lanenote .ln-editor {
        min-height: calc(100vh - 112px);
      }

      @media (max-width: 820px) {
        .app-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .backup-status {
          min-width: auto;
        }

        #lanenote .ln-shell {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="app-header">
        <div class="title-block">
          <h1>LaneNote Standalone</h1>
          <p>完全ローカル保存。外部アップロードなし。左で編集、右でリアルタイムプレビュー。</p>
        </div>
        <div class="backup-bar" aria-label="バックアップ操作">
          <button type="button" id="save-backup">バックアップ保存</button>
          <select id="backup-list" aria-label="バックアップ一覧"></select>
          <button type="button" id="restore-backup">復元</button>
          <span id="backup-status" class="backup-status" role="status"></span>
        </div>
      </header>
      <div id="lanenote"></div>
    </main>

    <script>
${inlineRuntime}
    </script>
    <script>
      (function () {
        var latestKey = "lanenote-standalone:latest:v1";
        var backupsKey = "lanenote-standalone:backups:v1";
        var runtimeStorageKey = "lanenote-standalone:runtime:v1";
        var maxBackups = 10;
        var backupCheckMs = 30000;
        var latestSaveMs = 1000;
        var diffCharThreshold = 120;
        var diffLineThreshold = 5;

        function sampleSource() {
          return [
            "---",
            "lanenote:",
            "  default: timeline",
            "  view.timeline: 時系列 × 担当 | scheduledAt x assignee",
            "  view.reverse: 担当 × 日付 | assignee x scheduledAt",
            "  role.アプリ: @作業",
            "  role.データ: @作業",
            "  filters.status: All",
            "---",
            "",
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
          ].join("\\n");
        }

        function nowLabel() {
          var date = new Date();
          var pad = function (value) { return String(value).padStart(2, "0"); };
          return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
            " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
        }

        function readJSON(key, fallback) {
          try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
          } catch (error) {
            return fallback;
          }
        }

        function sourceDiffSize(left, right) {
          var a = String(left || "");
          var b = String(right || "");
          var charDelta = Math.abs(a.length - b.length);
          var max = Math.max(a.length, b.length);
          for (var i = 0; i < max; i += 1) {
            if (a[i] !== b[i]) charDelta += 1;
          }
          var lineDelta = Math.abs(a.split(/\\r?\\n/).length - b.split(/\\r?\\n/).length);
          return { chars: charDelta, lines: lineDelta };
        }

        function shouldBackup(previousSource, nextSource) {
          if (!previousSource && nextSource) return true;
          var diff = sourceDiffSize(previousSource, nextSource);
          return diff.chars >= diffCharThreshold || diff.lines >= diffLineThreshold;
        }

        function readBackups() {
          var backups = readJSON(backupsKey, []);
          return Array.isArray(backups) ? backups : [];
        }

        function writeBackups(backups) {
          localStorage.setItem(backupsKey, JSON.stringify(backups.slice(0, maxBackups)));
        }

        function saveLatest(source) {
          localStorage.setItem(latestKey, JSON.stringify({ savedAt: new Date().toISOString(), source: source }));
        }

        function latestSource() {
          var latest = readJSON(latestKey, null);
          return latest && typeof latest.source === "string" ? latest.source : sampleSource();
        }

        function backupSource(source, reason) {
          var backups = readBackups();
          if (backups[0] && backups[0].source === source) return false;
          backups.unshift({
            id: String(Date.now()),
            label: nowLabel() + " / " + reason,
            savedAt: new Date().toISOString(),
            source: source
          });
          writeBackups(backups);
          renderBackupList();
          return true;
        }

        function status(text) {
          document.getElementById("backup-status").textContent = text;
        }

        function renderBackupList() {
          var select = document.getElementById("backup-list");
          var backups = readBackups();
          select.innerHTML = backups.length
            ? backups.map(function (backup, index) {
                return '<option value="' + index + '">' + backup.label.replace(/[&<>"']/g, function (c) {
                  return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
                }) + '</option>';
              }).join("")
            : '<option value="">バックアップなし</option>';
          select.disabled = !backups.length;
          document.getElementById("restore-backup").disabled = !backups.length;
        }

        var app = LaneNoteCore.create("#lanenote", {
          source: latestSource(),
          storageKey: runtimeStorageKey
        });

        var lastLatest = app.getSource();
        var lastBackupBasis = (readBackups()[0] && readBackups()[0].source) || "";

        saveLatest(lastLatest);
        renderBackupList();
        status("最新をローカル保存済み");

        document.getElementById("save-backup").addEventListener("click", function () {
          var source = app.getSource();
          saveLatest(source);
          lastLatest = source;
          lastBackupBasis = source;
          backupSource(source, "手動保存");
          status("バックアップ保存: " + nowLabel());
        });

        document.getElementById("restore-backup").addEventListener("click", function () {
          var backups = readBackups();
          var index = Number(document.getElementById("backup-list").value);
          var backup = backups[index];
          if (!backup) return;
          if (!confirm("選択したバックアップを復元しますか？ 現在の内容は最新保存として残ります。")) return;
          saveLatest(app.getSource());
          app.setSource(backup.source);
          saveLatest(backup.source);
          lastLatest = backup.source;
          lastBackupBasis = backup.source;
          status("復元: " + backup.label);
        });

        setInterval(function () {
          var source = app.getSource();
          if (source !== lastLatest) {
            saveLatest(source);
            lastLatest = source;
            status("最新保存: " + nowLabel());
          }
        }, latestSaveMs);

        setInterval(function () {
          var source = app.getSource();
          if (shouldBackup(lastBackupBasis, source)) {
            if (backupSource(source, "自動保存")) {
              lastBackupBasis = source;
              status("自動バックアップ: " + nowLabel());
            }
          }
        }, backupCheckMs);

        window.addEventListener("beforeunload", function () {
          saveLatest(app.getSource());
        });
      })();
    </script>
  </body>
</html>
`;

writeFileSync(resolve(root, "examples/standalone.html"), html);

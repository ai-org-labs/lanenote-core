(function (global) {
  "use strict";

  var VERSION = "0.2.0";
  var DEFAULT_ASSIGNEES = ["私", "PM", "企画", "開発", "QA", "インフラ", "AI"];
  var UNDATED_LANE = "日付なし";
  var UNASSIGNED_LANE = "役割なし";
  var DATE_ROLES = ["due", "planned", "event", "recorded"];
  var DATE_AXES = ["date", "scheduledAt", "dueAt", "eventAt", "recordedAt"];
  var PHASES = ["結合試験", "単体試験", "要件", "設計", "実装", "開発", "試験", "テスト", "QA", "リリース", "運用"];
  var QUALITIES = ["レビュー", "結合試験", "単体試験", "証跡", "品質", "ブロック", "Blocked"];
  var STATUSES = ["Open", "In Progress", "Blocked", "Done", "Hidden", "Archive"];

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function normalizeDateBasis(value) {
    var text = String(value || "").trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
      var parts = text.split("-");
      return parts[0] + "-" + pad2(parts[1]) + "-" + pad2(parts[2]) + "T00:00:00";
    }
    return text;
  }

  function dateParts(value) {
    var text = normalizeDateBasis(value || new Date().toISOString());
    var match = String(text).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    var fallback = new Date(text);
    if (Number.isNaN(fallback.getTime())) fallback = new Date();
    return { year: fallback.getFullYear(), month: fallback.getMonth() + 1, day: fallback.getDate() };
  }

  function datePartsToISO(parts) {
    return parts.year + "-" + pad2(parts.month) + "-" + pad2(parts.day);
  }

  function shiftDateParts(parts, days) {
    var shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
  }

  function todayISO(baseDate) {
    return datePartsToISO(dateParts(baseDate));
  }

  function inferDate(raw, baseDate) {
    if (!raw) return { date: "", inference: "none", basis: "" };
    var basis = normalizeDateBasis(baseDate || new Date().toISOString());
    var base = dateParts(basis);
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
      var parts = raw.split("-");
      var explicit = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      if (explicit.getUTCFullYear() !== Number(parts[0]) || explicit.getUTCMonth() + 1 !== Number(parts[1]) || explicit.getUTCDate() !== Number(parts[2])) {
        return { date: "", inference: "invalid-date", basis: basis };
      }
      return {
        date: parts[0] + "-" + pad2(parts[1]) + "-" + pad2(parts[2]),
        inference: "explicit-year",
        basis: basis
      };
    }
    var slash = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (slash) {
      var year = base.year;
      var month = Number(slash[1]);
      var day = Number(slash[2]);
      var candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day) {
        return { date: "", inference: "invalid-date", basis: basis };
      }
      var msPerDay = 24 * 60 * 60 * 1000;
      var baseTime = Date.UTC(base.year, base.month - 1, base.day);
      var daysBehind = Math.floor((baseTime - candidate.getTime()) / msPerDay);
      var inference = "month-day-current-year";
      if (daysBehind > 90) {
        year += 1;
        inference = "month-day-next-year-rollover";
      }
      return {
        date: year + "-" + pad2(slash[1]) + "-" + pad2(slash[2]),
        inference: inference,
        basis: basis
      };
    }
    if (raw === "今日") {
      return { date: datePartsToISO(base), inference: "relative-today", basis: basis };
    }
    if (raw === "明日") {
      var tomorrow = shiftDateParts(base, 1);
      return {
        date: datePartsToISO(tomorrow),
        inference: "relative-tomorrow",
        basis: basis
      };
    }
    return { date: raw, inference: "unknown-format", basis: basis };
  }

  function isPastDate(isoDate, now) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ""))) return false;
    var current = dateParts(now);
    var item = isoDate.split("-").map(Number);
    return Date.UTC(item[0], item[1] - 1, item[2]) < Date.UTC(current.year, current.month - 1, current.day);
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uniq(values) {
    var seen = {};
    return values.filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function normalizeLine(line) {
    return line.replace(/^\s*[-*]\s*/, "").trim();
  }

  function splitList(value) {
    return String(value || "").split(",").map(function (part) { return part.trim(); }).filter(Boolean);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function lineLooksLikeItem(line) {
    return /^\s*[-*]\s+/.test(line) || /\[( |x|X)\]/.test(line);
  }

  function laneHeadingName(line) {
    var trimmed = String(line || "").trim();
    var marker = trimmed.match(/^[:：]\s*(.+?)\s*$/);
    if (marker) return marker[1].replace(/[：:]$/, "").trim();
    return trimmed.replace(/[：:]$/, "").trim();
  }

  function isExplicitLaneHeading(line) {
    return /^[:：]\s*.+/.test(String(line || "").trim());
  }

  function nextContentLine(lines, start, skip) {
    for (var i = start + 1; i < lines.length; i += 1) {
      if (skip[i] || !lines[i].trim()) continue;
      return lines[i];
    }
    return "";
  }

  function collectStructuralAssignees(lines, skip) {
    var hasDate = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}|今日|明日)/;
    var values = [];
    lines.forEach(function (line, index) {
      if (skip[index]) return;
      var trimmed = line.trim();
      if (!trimmed || trimmed.length > 40 || /^#|^@written\b/.test(trimmed) || hasDate.test(trimmed) || lineLooksLikeItem(trimmed)) return;
      if (!isExplicitLaneHeading(trimmed) && !lineLooksLikeItem(lines[index + 1] || "")) return;
      values.push(laneHeadingName(trimmed));
    });
    return uniq(values);
  }

  function roleProfile(profile) {
    return profile && profile.roles && typeof profile.roles === "object" ? profile.roles : {};
  }

  function profileAssigneeGroups(profile) {
    var groups = {};
    Object.keys(roleProfile(profile)).forEach(function (canonical) {
      var definition = roleProfile(profile)[canonical] || {};
      if (definition.group) groups[canonical] = definition.group;
    });
    return groups;
  }

  function roleRegistry(assignees, profile, structuralAssignees) {
    var canonicalByAlias = {};
    var names = uniq((assignees || []).concat(structuralAssignees || []));
    names.forEach(function (name) { canonicalByAlias[name] = name; });
    Object.keys(roleProfile(profile)).forEach(function (canonical) {
      canonicalByAlias[canonical] = canonical;
      var definition = roleProfile(profile)[canonical] || {};
      (definition.aliases || []).forEach(function (alias) { canonicalByAlias[alias] = canonical; });
    });
    return Object.keys(canonicalByAlias).map(function (alias) {
      return { alias: alias, canonical: canonicalByAlias[alias] };
    }).sort(function (left, right) { return right.alias.length - left.alias.length; });
  }

  function exactRole(value, registry) {
    var normalized = laneHeadingName(value);
    for (var i = 0; i < registry.length; i += 1) {
      if (registry[i].alias === normalized) return registry[i];
    }
    return null;
  }

  function stripLeadingMarkdown(value) {
    return String(value || "")
      .replace(/^\s*[-*]\s*/, "")
      .replace(/^\s*\[(?: |x|X)\]\s*/, "")
      .trim();
  }

  function leadingRole(text, registry, leadingDateRaw) {
    var value = stripLeadingMarkdown(text);
    if (leadingDateRaw) {
      value = value.replace(new RegExp("^" + escapeRegExp(leadingDateRaw) + "(?:\\s+|$)"), "").trim();
    }
    for (var i = 0; i < registry.length; i += 1) {
      var alias = registry[i].alias;
      if (new RegExp("^" + escapeRegExp(alias) + "(?=\\s|[：:]|$)").test(value)) {
        return registry[i];
      }
    }
    return null;
  }

  function stripFrontMatter(lines) {
    var config = {};
    var assigneeGroups = {};
    var skip = {};
    if (lines[0] && lines[0].trim() === "---") {
      var end = -1;
      for (var index = 1; index < lines.length; index += 1) {
        if (lines[index].trim() === "---") {
          end = index;
          break;
        }
      }
      if (end > 0) {
        for (var i = 0; i <= end; i += 1) skip[i] = true;
        var inLaneNote = false;
        for (var j = 1; j < end; j += 1) {
          var raw = lines[j];
          var trimmed = raw.trim();
          if (trimmed === "lanenote:") {
            inLaneNote = true;
            continue;
          }
          if (!inLaneNote) continue;
          var match = trimmed.match(/^([^:]+):\s*(.*?)\s*$/);
          if (match) {
            var key = match[1].trim();
            var value = unquote(match[2]);
            var groupMatch = key.match(/^groups\.(.+)$/);
            if (groupMatch) {
              splitList(value).forEach(function (assignee) {
                assigneeGroups[assignee] = groupMatch[1];
              });
            } else {
              config[key] = value;
            }
          }
        }
      }
    }
    return { config: config, assigneeGroups: assigneeGroups, skip: skip };
  }

  function sourceProfileFromConfig(config) {
    var source = config || {};
    var profile = { roles: {}, lenses: {}, templates: {} };
    Object.keys(source).forEach(function (key) {
      var value = source[key];
      var roleMatch = key.match(/^roles\.([^.]+)\.(group|aliases)$/);
      if (roleMatch) {
        var roleName = roleMatch[1];
        profile.roles[roleName] = profile.roles[roleName] || {};
        profile.roles[roleName][roleMatch[2]] = roleMatch[2] === "aliases" ? splitList(value) : value;
        return;
      }
      var lensMatch = key.match(/^lenses\.([^.]+)\.(label|rows|columns)$/);
      if (lensMatch) {
        var lensName = lensMatch[1];
        profile.lenses[lensName] = profile.lenses[lensName] || {};
        profile.lenses[lensName][lensMatch[2]] = value;
        return;
      }
      if (key === "profile.defaultLens" || key === "defaultLens" || key === "lens") {
        profile.defaultLens = value;
      }
    });
    return profile;
  }

  function unquote(value) {
    return String(value || "").replace(/^["']|["']$/g, "");
  }

  function extractCheckbox(line) {
    var match = line.match(/^(.*?)\[( |x|X)\]\s*(.*)$/);
    if (!match) return null;
    return {
      done: match[2].toLowerCase() === "x",
      title: (match[1] + " " + match[3]).replace(/^\s*[-*]\s*/, "").trim()
    };
  }

  function detectFirst(text, dictionary) {
    for (var i = 0; i < dictionary.length; i += 1) {
      if (text.indexOf(dictionary[i]) !== -1) return dictionary[i];
    }
    return "";
  }

  function readTokenField(text, key) {
    var pattern = new RegExp("(^|\\s)" + key + ":(\"[^\"]+\"|'[^']+'|[^\\s]+)");
    var match = text.match(pattern);
    return match ? unquote(match[2]) : "";
  }

  function readHashField(text, key) {
    var pattern = new RegExp("(^|\\s)#" + key + "/([^\\s#]+)");
    var match = text.match(pattern);
    return match ? unquote(match[2]) : "";
  }

  function readDueShorthand(text) {
    var match = text.match(/(?:^|\s)(?:!|〆|期限|締切)\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}|今日|明日)(?:\s|$)/);
    return match ? match[1] : "";
  }

  function readLeadingDate(text) {
    var value = stripLeadingMarkdown(text);
    var match = value.match(/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}|今日|明日)(?=\s|$)/);
    return match ? match[1] : "";
  }

  function readExplicitFields(text) {
    var fields = {};
    ["date", "assignee", "role", "group", "product", "phase", "quality", "status"].forEach(function (key) {
      fields[key] = readTokenField(text, key) || readHashField(text, key);
    });
    DATE_ROLES.forEach(function (role) {
      fields[role] = readTokenField(text, role) || readHashField(text, role);
    });
    if (!fields.due) fields.due = readDueShorthand(text);
    return fields;
  }

  function removeExplicitFields(text) {
    var keys = ["date", "assignee", "role", "group", "product", "phase", "quality", "status"].concat(DATE_ROLES);
    var value = text;
    keys.forEach(function (key) {
      value = value
        .replace(new RegExp("(^|\\s)" + key + ":(?:\"[^\"]+\"|'[^']+'|[^\\s]+)?", "g"), " ")
        .replace(new RegExp("(^|\\s)#" + key + "/[^\\s#]+", "g"), " ");
    });
    value = value
      .replace(/(^|\s)(?:!|〆|期限|締切)\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}|今日|明日)(?=\s|$)/g, " ")
      .replace(/(^|\s)(?:!|〆|期限|締切)(?=\s|$)/g, " ");
    return value.replace(/\s+/g, " ").trim();
  }

  function normalizeStatus(value, doneFromCheckbox, isTask) {
    if (doneFromCheckbox) return "Done";
    if (!value) return isTask ? "Open" : "";
    for (var i = 0; i < STATUSES.length; i += 1) {
      if (STATUSES[i].toLowerCase() === String(value).toLowerCase()) return STATUSES[i];
    }
    return value;
  }

  function stripSignals(text, dateRaw, assigneeRaw) {
    var value = String(text || "")
      .replace(/\[(?: |x|X)\]/, " ")
      .replace(/^\s*[-*]\s*/, " ");
    value = removeExplicitFields(value);
    if (dateRaw) value = value.replace(dateRaw, " ");
    if (assigneeRaw) {
      value = value.replace(new RegExp("^\\s*" + escapeRegExp(assigneeRaw) + "(?=\\s|[：:]|$)"), " ");
    }
    return value
      .replace(/^\s*[：:]\s*/, "")
      .replace(/^\s*-\s*/, "")
      .replace(/[()（）]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readWrittenMarker(text) {
    var match = text.match(/^@written\s+(.+?)\s*$/);
    return match ? unquote(match[1].trim()) : "";
  }

  function readDailyHeading(text) {
    var match = text.match(/^#{1,6}\s+(\d{4}-\d{1,2}-\d{1,2})\s*$/);
    return match ? match[1] : "";
  }

  function parse(source, options) {
    var opts = options || {};
    var lines = String(source || "").split(/\r?\n/);
    var frontMatter = stripFrontMatter(lines);
    var runtimeProfile = mergeProfile(opts.profile, opts.templates, sourceProfileFromConfig(frontMatter.config));
    var structuralAssignees = collectStructuralAssignees(lines, frontMatter.skip);
    var configuredAssignees = splitList(frontMatter.config.assignees);
    var profileAssignees = Object.keys(roleProfile(runtimeProfile));
    var assignees = uniq((opts.assignees || DEFAULT_ASSIGNEES).concat(profileAssignees, configuredAssignees, structuralAssignees));
    var registry = roleRegistry(assignees, runtimeProfile, structuralAssignees);
    var assigneeGroups = Object.assign({}, profileAssigneeGroups(runtimeProfile), frontMatter.assigneeGroups, opts.assigneeGroups || {});
    var defaultDateRole = opts.defaultDateRole || frontMatter.config.dateRole || "planned";
    var noteBaseDate = frontMatter.config.baseDate || opts.baseDate || opts.now || opts.currentDate || new Date().toISOString();
    var activeWrittenOverride = "";
    var nowForStatus = opts.now || opts.currentDate || new Date().toISOString();
    var lineMetadata = opts.lineMetadata || [];
    var activeScheduledAt = "";
    var activeScheduledRaw = "";
    var activeScheduledInfo = { date: "", inference: "none", basis: "" };
    var activeScheduledSource = "missing";
    var activeRecordedAt = "";
    var activeRecordedRaw = "";
    var activeRecordedInfo = { date: "", inference: "none", basis: "" };
    var activeAssignee = "";
    var items = [];

    lines.forEach(function (line, index) {
      if (frontMatter.skip[index]) return;
      var trimmed = line.trim();
      if (!trimmed) return;
      var metadata = lineMetadata[index] || {};
      var lineWrittenAt = activeWrittenOverride || metadata.writtenAt || noteBaseDate;

      var writtenMarker = readWrittenMarker(trimmed);
      if (writtenMarker) {
        activeWrittenOverride = normalizeDateBasis(writtenMarker);
        return;
      }

      var dailyHeading = readDailyHeading(trimmed);
      if (dailyHeading) {
        activeWrittenOverride = dailyHeading + "T00:00:00";
        activeRecordedInfo = inferDate(dailyHeading, activeWrittenOverride);
        activeRecordedAt = activeRecordedInfo.date;
        activeRecordedRaw = dailyHeading;
        return;
      }

      var structuralName = laneHeadingName(trimmed);
      if (structuralAssignees.indexOf(structuralName) !== -1 && !lineLooksLikeItem(trimmed)) {
        var structuralRole = exactRole(structuralName, registry);
        activeAssignee = structuralRole ? structuralRole.canonical : structuralName;
        return;
      }

      var fields = readExplicitFields(trimmed);
      var checkbox = extractCheckbox(trimmed);
      var leadingDateRaw = readLeadingDate(trimmed);
      var dateMatch = trimmed.match(/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}|今日|明日)/);
      var fallbackDateRaw = dateMatch ? dateMatch[1] : "";
      var scheduleRaw = fields.planned || fields.date || leadingDateRaw || ((fields.event || fields.recorded || fields.due) ? "" : fallbackDateRaw);
      var dueRaw = fields.due || "";
      var eventRaw = fields.event || "";
      var recordedRaw = fields.recorded || "";
      var scheduleInfo = inferDate(scheduleRaw, lineWrittenAt);
      var dueInfo = inferDate(dueRaw, lineWrittenAt);
      var eventInfo = inferDate(eventRaw, lineWrittenAt);
      var recordedInfo = inferDate(recordedRaw, lineWrittenAt);

      var leadingAssignee = leadingRole(trimmed, registry, leadingDateRaw);
      var explicitAssignee = fields.assignee || fields.role;
      var explicitRole = explicitAssignee ? exactRole(explicitAssignee, registry) : null;
      var assignee = explicitRole ? explicitRole.canonical : explicitAssignee || (leadingAssignee ? leadingAssignee.canonical : "");
      var assigneeRaw = leadingAssignee ? leadingAssignee.alias : "";
      var assigneeSource = fields.assignee ? "field:assignee" : fields.role ? "field:role" : leadingAssignee ? "leading-role" : activeAssignee ? "inherited" : "missing";
      var resolvedAssignee = assignee || activeAssignee || UNASSIGNED_LANE;
      var strippedTitle = stripSignals(trimmed, leadingDateRaw || fields.date || fields.planned, assigneeRaw);
      var isListItem = /^\s*[-*]\s+/.test(line);
      var looksActionable = /やる|する|対応|確認|作る|修正|登録|準備|レビュー|試験|テスト|リリース|依頼/.test(strippedTitle);
      var inheritedContext = Boolean(activeScheduledAt || activeAssignee);
      var isItem = Boolean(checkbox) || isListItem || looksActionable || Boolean(strippedTitle && (scheduleRaw || eventRaw || recordedRaw || inheritedContext));

      if (!isItem) {
        if (scheduleRaw && scheduleInfo.date) {
          activeScheduledAt = scheduleInfo.date;
          activeScheduledRaw = scheduleRaw;
          activeScheduledInfo = scheduleInfo;
          activeScheduledSource = fields.planned ? "field:planned" : fields.date ? "field:date" : "context-date";
        }
        if (recordedRaw && recordedInfo.date) {
          activeRecordedAt = recordedInfo.date;
          activeRecordedRaw = recordedRaw;
          activeRecordedInfo = recordedInfo;
        }
        if (assignee) activeAssignee = assignee;
        return;
      }

      var scheduledAt = scheduleInfo.date || activeScheduledAt;
      var scheduledRaw = scheduleInfo.date ? scheduleRaw : activeScheduledRaw;
      var scheduledInfo = scheduleInfo.date ? scheduleInfo : activeScheduledInfo;
      var scheduledSource = scheduleInfo.date
        ? (fields.planned ? "field:planned" : fields.date ? "field:date" : "inline-date")
        : (activeScheduledAt ? "inherited" : "missing");
      var dueAt = dueInfo.date;
      var eventAt = eventInfo.date;
      var recordedAt = recordedInfo.date || activeRecordedAt;
      var projectedDate = scheduledAt || eventAt || dueAt || recordedAt;
      var projectedRaw = scheduledAt ? scheduledRaw : eventAt ? eventRaw : dueAt ? dueRaw : recordedAt ? (recordedRaw || activeRecordedRaw) : "";
      var projectedInfo = scheduledAt ? scheduledInfo : eventAt ? eventInfo : dueAt ? dueInfo : recordedAt ? (recordedInfo.date ? recordedInfo : activeRecordedInfo) : { inference: "none", basis: "" };
      var dateRole = scheduledAt ? defaultDateRole : eventAt ? "event" : dueAt ? "due" : recordedAt ? "recorded" : "";
      var dateSource = "missing";
      if (scheduledAt) dateSource = scheduledSource;
      else if (eventAt) dateSource = "field:event";
      else if (dueAt) dateSource = readDueShorthand(trimmed) ? "shorthand:due" : "field:due";
      else if (recordedAt) dateSource = recordedInfo.date ? "field:recorded" : "inherited-recorded";

      var cleanTitle = removeExplicitFields(strippedTitle);
      var productMatch = cleanTitle.match(/(Product\s*[A-Z0-9]+|製品\s*[A-Z0-9]+|[A-Za-z0-9_-]+API)/);
      var product = fields.product || (productMatch ? productMatch[1].replace(/\s+/g, " ") : "");
      var group = fields.group || groupForAssignee(resolvedAssignee, assigneeGroups);
      var phase = fields.phase || detectFirst(cleanTitle, PHASES);
      var quality = fields.quality || detectFirst(cleanTitle, QUALITIES);
      var status = normalizeStatus(fields.status, checkbox && checkbox.done, Boolean(checkbox));
      var displayTitle = cleanTitle || strippedTitle || normalizeLine(trimmed);
      var kind = checkbox ? "task" : looksActionable ? "action-candidate" : (scheduledAt || eventAt) ? "event-candidate" : "note";
      var blockId = metadata.id || "ln-" + index + "-" + Math.abs(hashCode(line));

      items.push({
        id: blockId,
        anchor: { line: index + 1, text: line, blockId: blockId },
        title: displayTitle,
        kind: kind,
        date: projectedDate || UNDATED_LANE,
        dateRole: projectedDate ? dateRole : "",
        dateRaw: projectedDate ? projectedRaw : "",
        dateBasis: projectedDate ? projectedInfo.basis : "",
        writtenAt: lineWrittenAt || "",
        dateInference: projectedDate ? projectedInfo.inference : "",
        scheduledAt: scheduledAt,
        scheduledRaw: scheduledRaw,
        scheduledSource: scheduledSource,
        dueAt: dueAt,
        dueRaw: dueRaw,
        dueSource: dueAt ? (readDueShorthand(trimmed) ? "shorthand:due" : "field:due") : "",
        eventAt: eventAt,
        eventRaw: eventRaw,
        recordedAt: recordedAt,
        recordedRaw: recordedRaw || activeRecordedRaw,
        assignee: resolvedAssignee,
        assigneeSource: assigneeSource,
        group: group,
        product: product,
        phase: phase,
        quality: quality,
        status: status,
        task: Boolean(checkbox),
        calendarCandidate: kind === "event-candidate",
        pastDate: projectedDate ? isPastDate(projectedDate, nowForStatus) : false,
        pastOpen: projectedDate ? Boolean(checkbox) && isPastDate(projectedDate, nowForStatus) && status !== "Done" : false,
        overdue: dueAt ? Boolean(checkbox) && isPastDate(dueAt, nowForStatus) && status !== "Done" : false,
        dateSource: projectedDate ? dateSource : "missing",
        confidence: fields.assignee || fields.role || leadingAssignee || checkbox || leadingDateRaw ? 0.95 : 0.7,
        provenance: "rule",
        lineIndex: index
      });
    });

    return {
      version: VERSION,
      source: String(source || ""),
      config: frontMatter.config,
      profile: runtimeProfile,
      assigneeGroups: assigneeGroups,
      items: items,
      assignees: orderLanes(uniq(items.map(function (item) { return item.assignee; })), UNASSIGNED_LANE),
      dates: orderLanes(uniq(items.map(function (item) { return item.date; })), UNDATED_LANE),
      dateRoles: orderLanes(uniq(items.map(function (item) { return item.dateRole; })), ""),
      groups: orderLanes(uniq(items.map(function (item) { return item.group || groupForAssignee(item.assignee, assigneeGroups); })), "")
    };
  }

  function groupForAssignee(assignee, assigneeGroups) {
    if (!assignee || assignee === UNASSIGNED_LANE) return "未グループ";
    if (assigneeGroups && assigneeGroups[assignee]) return assigneeGroups[assignee];
    return "未グループ";
  }

  function orderLanes(values, emptyLane) {
    return values.sort(function (left, right) {
      if (left === emptyLane && right !== emptyLane) return 1;
      if (right === emptyLane && left !== emptyLane) return -1;
      return String(left).localeCompare(String(right), "ja");
    });
  }

  function hashCode(value) {
    var hash = 0;
    for (var i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function replaceCheckboxAtLine(source, lineIndex, done) {
    var lines = String(source || "").split(/\r?\n/);
    var line = lines[lineIndex] || "";
    var nextMark = done ? "[x]" : "[ ]";
    if (/\[( |x|X)\]/.test(line)) {
      lines[lineIndex] = line.replace(/\[( |x|X)\]/, nextMark);
    }
    return lines.join("\n");
  }

  function itemPassesFilters(item, filters) {
    if (!filters) return true;
    if (filters.status && filters.status !== "All" && item.status !== filters.status) return false;
    if (filters.assignee && filters.assignee !== "All" && item.assignee !== filters.assignee) return false;
    if (filters.dateRole && filters.dateRole !== "All" && item.dateRole !== filters.dateRole) return false;
    if (filters.query) {
      var haystack = [item.title, item.product, item.phase, item.quality, item.assignee, item.date, item.dateRole].join(" ").toLowerCase();
      if (haystack.indexOf(filters.query.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function filterValue(config, key, fallback) {
    return config["filters." + key] || config["filter." + key] || fallback || "All";
  }

  function filtersFromConfig(config) {
    var source = config || {};
    return {
      status: filterValue(source, "status", "All"),
      assignee: filterValue(source, "assignee", "All"),
      dateRole: filterValue(source, "dateRole", "All"),
      query: source["filters.query"] || source["filter.query"] || ""
    };
  }

  function axisField(value) {
    if (value && typeof value === "object") return value.field || "";
    return String(value || "").trim();
  }

  function axisName(value, fallback) {
    var axis = axisField(value) || axisField(fallback) || "date";
    var supported = DATE_AXES.concat(["assignee", "product", "phase", "quality", "status"]);
    return supported.indexOf(axis) !== -1 ? axis : axisField(fallback) || "date";
  }

  function axisLabel(axis) {
    var labels = {
      date: "日付",
      scheduledAt: "実施日",
      dueAt: "期限",
      eventAt: "予定日",
      recordedAt: "記録日",
      assignee: "担当",
      product: "製品",
      phase: "工程",
      quality: "品質",
      status: "状態"
    };
    return labels[axis] || axis;
  }

  function axisEmptyLane(axis) {
    var labels = {
      assignee: UNASSIGNED_LANE,
      product: "製品なし",
      phase: "工程なし",
      quality: "品質なし",
      status: "状態なし"
    };
    return labels[axis] || UNDATED_LANE;
  }

  function itemAxisValue(item, axis) {
    var value = axis === "date" ? item.date : item[axis];
    return value || axisEmptyLane(axis);
  }

  function axisValues(model, axis) {
    return orderLanes(uniq(model.items.map(function (item) { return itemAxisValue(item, axis); })), axisEmptyLane(axis));
  }

  function resolveLensDefinition(model, options) {
    var opts = options || {};
    var profile = opts.profile || model.profile || {};
    var requested = opts.lens || model.config.lens || profile.defaultLens;
    if (requested && typeof requested === "object") return requested;
    if (typeof requested === "string" && profile.lenses && profile.lenses[requested]) return profile.lenses[requested];
    return {};
  }

  function resolveAxes(model, options) {
    var opts = options || {};
    var lens = resolveLensDefinition(model, opts);
    var rowAxis = axisName(opts.rows || lens.rows || model.config.rows, "date");
    var columnAxis = axisName(opts.columns || lens.columns || model.config.columns, "assignee");
    if (rowAxis === columnAxis) columnAxis = rowAxis === "assignee" ? "date" : "assignee";
    return { rows: rowAxis, columns: columnAxis };
  }

  function visibleAssigneesFor(model, options) {
    var opts = options || {};
    var collapsedGroups = opts.collapsedGroups || {};
    var collapsedAssignees = opts.collapsedAssignees || {};
    return orderLanes(uniq(model.items.map(function (item) { return item.assignee; })), UNASSIGNED_LANE).filter(function (assignee) {
      var group = assigneeGroup(model, assignee, opts.assigneeGroups);
      return !collapsedAssignees[assignee] && !collapsedGroups[group];
    });
  }

  function visibleColumnValuesFor(model, columnAxis, options) {
    var opts = options || {};
    var collapsedColumns = opts.collapsedColumns || {};
    if (columnAxis === "assignee") return visibleAssigneesFor(model, opts);
    return axisValues(model, columnAxis).filter(function (value) {
      return !collapsedColumns[value];
    });
  }

  function assigneeGroup(model, assignee, assigneeGroups) {
    if (assigneeGroups && assigneeGroups[assignee]) return assigneeGroups[assignee];
    for (var i = 0; i < model.items.length; i += 1) {
      if (model.items[i].assignee === assignee && model.items[i].group) return model.items[i].group;
    }
    return groupForAssignee(assignee, assigneeGroups);
  }

  function groupedAssignees(model, assignees, assigneeGroups) {
    var groups = [];
    var byName = {};
    assignees.forEach(function (assignee) {
      var groupName = assigneeGroup(model, assignee, assigneeGroups);
      if (!byName[groupName]) {
        byName[groupName] = { name: groupName, assignees: [] };
        groups.push(byName[groupName]);
      }
      byName[groupName].assignees.push(assignee);
    });
    return groups;
  }

  function collapsedControls(model, options) {
    var opts = options || {};
    var collapsedGroups = opts.collapsedGroups || {};
    var collapsedAssignees = opts.collapsedAssignees || {};
    var collapsedColumns = opts.collapsedColumns || {};
    var chunks = [];
    Object.keys(collapsedGroups).forEach(function (group) {
      if (collapsedGroups[group]) {
        chunks.push('<button class="ln-restore" type="button" data-restore-group="' + escapeHTML(group) + '">グループ表示: ' + escapeHTML(group) + '</button>');
      }
    });
    Object.keys(collapsedAssignees).forEach(function (assignee) {
      if (collapsedAssignees[assignee]) {
        chunks.push('<button class="ln-restore" type="button" data-restore-assignee="' + escapeHTML(assignee) + '">列表示: ' + escapeHTML(assignee) + '</button>');
      }
    });
    Object.keys(collapsedColumns).forEach(function (column) {
      if (collapsedColumns[column]) {
        chunks.push('<button class="ln-restore" type="button" data-restore-column="' + escapeHTML(column) + '">列表示: ' + escapeHTML(column) + '</button>');
      }
    });
    return chunks.length ? '<div class="ln-collapsed">' + chunks.join("") + '</div>' : "";
  }

  function renderMatrix(model, target, options) {
    var opts = options || {};
    var filters = Object.assign(filtersFromConfig(model.config), opts.filters || {});
    var axes = resolveAxes(model, opts);
    var columnValues = visibleColumnValuesFor(model, axes.columns, opts);
    var rowValues = axisValues(model, axes.rows);
    var groups = axes.columns === "assignee" ? groupedAssignees(model, columnValues, opts.assigneeGroups || model.assigneeGroups) : [];
    var hasGroupHeader = axes.columns === "assignee";
    var html = [collapsedControls(model, opts),
      '<table class="ln-matrix" aria-label="LaneNote ' + escapeHTML(axisLabel(axes.rows)) + ' by ' + escapeHTML(axisLabel(axes.columns)) + '">'
    ];

    if (!model.items.length) {
      html.push('<caption class="ln-empty">ノートを書くと、時系列 × 担当の表がここに現れます。</caption>');
    }

    html.push(
      '<thead><tr>',
      '<th class="ln-date ln-corner" scope="col" rowspan="' + (hasGroupHeader ? "2" : "1") + '">' + escapeHTML(axisLabel(axes.rows)) + '</th>'
    );

    if (hasGroupHeader) {
      groups.forEach(function (group) {
        html.push(
          '<th class="ln-grouphead" scope="colgroup" colspan="' + group.assignees.length + '">',
          '<span>' + escapeHTML(group.name) + '</span>',
          '<button class="ln-hide-btn" type="button" title="グループを隠す" data-collapse-group="' + escapeHTML(group.name) + '">−</button>',
          '</th>'
        );
      });
      html.push("</tr><tr>");
    }

    columnValues.forEach(function (columnValue) {
      var collapseAttr = axes.columns === "assignee"
        ? ' data-collapse-assignee="' + escapeHTML(columnValue) + '"'
        : ' data-collapse-column="' + escapeHTML(columnValue) + '"';
      html.push(
        '<th class="ln-colhead" scope="col">',
        '<span>' + escapeHTML(columnValue) + '</span>',
        '<button class="ln-hide-btn" type="button" title="列を隠す"' + collapseAttr + '>−</button>',
        '</th>'
      );
    });
    html.push("</tr></thead><tbody>");

    rowValues.forEach(function (rowValue) {
      html.push('<tr><th class="ln-date" scope="row">' + escapeHTML(rowValue) + '</th>');
      columnValues.forEach(function (columnValue) {
        var cellItems = model.items.filter(function (item) {
          return itemAxisValue(item, axes.rows) === rowValue && itemAxisValue(item, axes.columns) === columnValue && itemPassesFilters(item, filters);
        });
        html.push('<td class="ln-cell">');
        cellItems.forEach(function (item) {
          html.push(renderCard(item, axes));
        });
        html.push("</td>");
      });
      html.push("</tr>");
    });

    html.push("</tbody>");
    html.push("</table>");
    target.innerHTML = html.join("");
  }

  function markdownText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function markdownMeta(label, value) {
    return value ? label + "=" + markdownText(value) : "";
  }

  function compactDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value || "";
    return String(Number(match[2])) + "/" + String(Number(match[3]));
  }

  function shouldShowDateProvenance(item) {
    if (!item.dateRaw || item.dateRaw === item.date) return false;
    return ["relative-today", "relative-tomorrow", "month-day-next-year-rollover", "unknown-format"].indexOf(item.dateInference) !== -1;
  }

  function projectedCellItems(model, rowAxis, rowValue, columnAxis, columnValue, filters) {
    return model.items.filter(function (item) {
      return itemAxisValue(item, rowAxis) === rowValue &&
        itemAxisValue(item, columnAxis) === columnValue &&
        itemPassesFilters(item, filters);
    });
  }

  function itemToMarkdown(item) {
    var marker = item.task ? (item.status === "Done" ? "- [x] " : "- [ ] ") : "- ";
    var due = item.dueAt ? " !" + markdownText(item.dueAt) : "";
    var tags = [item.product, item.phase, item.quality].filter(Boolean);
    var summary = marker + markdownText(item.title) + due + (tags.length ? " [" + tags.join(" / ") + "]" : "");
    var evidence = [
      markdownMeta("id", item.id),
      markdownMeta("date", item.date),
      markdownMeta("scheduled", item.scheduledAt),
      markdownMeta("due", item.dueAt),
      markdownMeta("assignee", item.assignee),
      item.anchor && item.anchor.line ? "line=" + item.anchor.line : ""
    ].filter(Boolean);
    return summary + (evidence.length ? "\n  <!-- ln: " + evidence.join(" ") + " -->" : "");
  }

  function sourceLabel(source) {
    var labels = {
      "field:assignee": "明示 assignee:",
      "field:role": "明示 role:",
      "known-word": "既知語検出",
      "inherited": "前行から継承",
      "missing": "未指定",
      "field:date": "明示 date:",
      "field:due": "期限",
      "field:planned": "予定",
      "field:event": "予定/イベント",
      "field:recorded": "記録日",
      "inline-date": "行内日付",
      "context-date": "日付行",
      "leading-role": "行頭担当",
      "shorthand:due": "期限 !",
      "inherited-recorded": "記録日を継承"
    };
    return labels[source] || source || "未指定";
  }

  function decisionSummary(item, axes) {
    var rowField = axes && axes.rows === "assignee" ? item.assignee : item.date;
    var columnField = axes && axes.columns === "date" ? item.date : item.assignee;
    var parts = [
      "判定: 行=" + markdownText(rowField),
      "列=" + markdownText(columnField),
      "日付=" + markdownText(item.date) + "(" + sourceLabel(item.dateSource) + ")",
      "担当=" + markdownText(item.assignee) + "(" + sourceLabel(item.assigneeSource) + ")"
    ];
    if (item.dueAt) parts.push("期限=" + markdownText(item.dueAt));
    return parts.join(" · ");
  }

  function exportProjectedMarkdown(model, options) {
    var opts = options || {};
    var filters = opts.filters || {};
    var axes = resolveAxes(model, opts);
    var rowValues = axisValues(model, axes.rows);
    var columnValues = visibleColumnValuesFor(model, axes.columns, opts);
    var lines = [
      "# LaneNote Projected View",
      "",
      "- rows: " + axes.rows,
      "- columns: " + axes.columns,
      "- generatedAt: " + (opts.generatedAt || new Date().toISOString()),
      ""
    ];
    var emitted = 0;

    rowValues.forEach(function (rowValue) {
      var rowHadItems = false;
      var rowLines = ["## " + markdownText(rowValue), ""];
      columnValues.forEach(function (columnValue) {
        var cellItems = projectedCellItems(model, axes.rows, rowValue, axes.columns, columnValue, filters);
        if (!cellItems.length) return;
        rowHadItems = true;
        emitted += cellItems.length;
        rowLines.push("### " + markdownText(columnValue), "");
        cellItems.forEach(function (item) {
          rowLines.push(itemToMarkdown(item));
        });
        rowLines.push("");
      });
      if (rowHadItems) lines = lines.concat(rowLines);
    });

    if (!emitted) {
      lines.push("_表示中の条件に一致する項目はありません。_", "");
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function downloadText(filename, text, mimeType) {
    if (!global.document || !global.Blob || !global.URL) {
      throw new Error("downloadMarkdown requires a browser with Blob and URL support.");
    }
    var blob = new Blob([text], { type: mimeType || "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename || "lanenote-projected.md";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function localTimestamp(date) {
    var value = date || new Date();
    var offset = -value.getTimezoneOffset();
    var sign = offset >= 0 ? "+" : "-";
    var absolute = Math.abs(offset);
    return value.getFullYear() + "-" + pad2(value.getMonth() + 1) + "-" + pad2(value.getDate()) +
      "T" + pad2(value.getHours()) + ":" + pad2(value.getMinutes()) + ":" + pad2(value.getSeconds()) +
      sign + pad2(Math.floor(absolute / 60)) + ":" + pad2(absolute % 60);
  }

  var blockSequence = 0;

  function newBlockRecord(line, writtenAt) {
    blockSequence += 1;
    var id = global.crypto && typeof global.crypto.randomUUID === "function"
      ? global.crypto.randomUUID()
      : "lnb-" + Math.abs(hashCode(writtenAt + "|" + line + "|" + blockSequence));
    return { id: id, writtenAt: writtenAt, text: line };
  }

  function reconcileLineMetadata(previousState, nextSource, writtenAt) {
    var previous = previousState && previousState.source != null ? previousState : { source: "", records: [] };
    var previousLines = String(previous.source || "").split(/\r?\n/);
    var nextLines = String(nextSource || "").split(/\r?\n/);
    var records = previous.records || [];
    var nextRecords = new Array(nextLines.length);
    var prefix = 0;
    while (prefix < previousLines.length && prefix < nextLines.length && previousLines[prefix] === nextLines[prefix]) {
      nextRecords[prefix] = records[prefix] || newBlockRecord(nextLines[prefix], writtenAt);
      prefix += 1;
    }
    var suffix = 0;
    while (
      suffix < previousLines.length - prefix &&
      suffix < nextLines.length - prefix &&
      previousLines[previousLines.length - 1 - suffix] === nextLines[nextLines.length - 1 - suffix]
    ) {
      var oldIndex = previousLines.length - 1 - suffix;
      var nextIndex = nextLines.length - 1 - suffix;
      nextRecords[nextIndex] = records[oldIndex] || newBlockRecord(nextLines[nextIndex], writtenAt);
      suffix += 1;
    }
    var oldMiddleLength = previousLines.length - prefix - suffix;
    var nextMiddleLength = nextLines.length - prefix - suffix;
    for (var i = 0; i < nextMiddleLength; i += 1) {
      var sourceRecord = i < oldMiddleLength ? records[prefix + i] : null;
      nextRecords[prefix + i] = sourceRecord
        ? { id: sourceRecord.id, writtenAt: sourceRecord.writtenAt, text: nextLines[prefix + i] }
        : newBlockRecord(nextLines[prefix + i], writtenAt);
    }
    return { version: 1, source: String(nextSource || ""), records: nextRecords };
  }

  function exportPortableJSON(model, lineMetadata) {
    return JSON.stringify({
      format: "lanenote-portable",
      version: VERSION,
      source: model.source,
      lineMetadata: lineMetadata || [],
      profile: model.profile || {},
      items: model.items
    }, null, 2);
  }

  function renderCard(item, axes) {
    var tagValues = [];
    if (item.product) tagValues.push(item.product);
    if (item.phase) tagValues.push(item.phase);
    else if (item.quality) tagValues.push(item.quality);
    var tags = tagValues.map(function (tag) {
      return '<span class="ln-tag">' + escapeHTML(tag) + '</span>';
    }).join("");
    if (shouldShowDateProvenance(item)) {
      tags += '<span class="ln-tag ln-tag-date">' + escapeHTML(item.dateRaw) + "→" + escapeHTML(compactDate(item.date)) + '</span>';
    }
    if (item.dueAt) {
      tags += '<span class="ln-tag ln-tag-due">期限 ' + escapeHTML(compactDate(item.dueAt)) + '</span>';
    }
    if (item.overdue) {
      tags += '<span class="ln-tag ln-tag-alert">期限超過</span>';
    } else if (item.pastOpen) {
      tags += '<span class="ln-tag ln-tag-alert">実施日経過 Open</span>';
    } else if (item.pastDate) {
      tags += '<span class="ln-tag">過去日</span>';
    }
    if (item.kind === "event-candidate") tags += '<span class="ln-tag ln-tag-candidate">予定候補</span>';
    if (item.kind === "action-candidate") tags += '<span class="ln-tag ln-tag-candidate">タスク候補</span>';
    var checkbox = item.task
      ? '<input class="ln-card-check" type="checkbox" data-line-index="' + item.lineIndex + '"' + (item.status === "Done" ? " checked" : "") + ' aria-label="Done">'
      : '<span class="ln-dot" aria-hidden="true"></span>';

    return [
      '<button class="ln-card' + (item.pastOpen ? " is-past-open" : "") + '" type="button" data-line-index="' + item.lineIndex + '" title="' + escapeHTML(decisionSummary(item, axes)) + '">',
      '<span class="ln-card-top">',
      checkbox,
      '<span class="ln-card-title">' + escapeHTML(item.title) + '</span>',
      '</span>',
      tags ? '<span class="ln-tags">' + tags + '</span>' : "",
      '<span class="ln-evidence">line ' + item.anchor.line + ' · ' + escapeHTML(item.status || item.kind) + '</span>',
      '<span class="ln-decision">' + escapeHTML(decisionLine(item)) + '</span>',
      '</button>'
    ].join("");
  }

  function decisionLine(item) {
    var datePart = item.dateSource === "missing" ? "日付なし" : "日付:" + sourceLabel(item.dateSource);
    var assigneePart = item.assigneeSource === "missing" ? "担当なし" : "担当:" + sourceLabel(item.assigneeSource);
    if (shouldShowDateProvenance(item)) datePart += " " + item.dateRaw + "→" + compactDate(item.date);
    return datePart + " · " + assigneePart;
  }

  function injectStyles(doc) {
    if (doc.getElementById("lanenote-core-styles")) return;
    var style = doc.createElement("style");
    style.id = "lanenote-core-styles";
    style.textContent = [
      ".ln-root{font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172026;background:#f7f8f5;border:1px solid #d9ded6;border-radius:8px;overflow:hidden}",
      ".ln-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px;border-bottom:1px solid #d9ded6;background:#fff}",
      ".ln-toolbar input,.ln-toolbar select,.ln-toolbar button{height:32px;border:1px solid #c9d0c5;border-radius:6px;background:#fff;padding:0 8px;color:#172026}",
      ".ln-toolbar button{cursor:pointer;font-weight:650}",
      ".ln-shell{display:grid;grid-template-columns:minmax(260px,36%) 1fr;min-height:520px}",
      ".ln-editor{width:100%;min-height:520px;border:0;border-right:1px solid #d9ded6;resize:vertical;padding:16px;font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#fff;color:#172026;box-sizing:border-box}",
      ".ln-preview{overflow:auto;background:#f7f8f5}",
      ".ln-matrix{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;margin:12px}",
      ".ln-date,.ln-colhead{background:#eef2eb;border:1px solid #d9ded6;border-right:0;border-bottom:0;padding:9px 10px;font-weight:650;color:#243127;min-width:136px;box-sizing:border-box;vertical-align:top}",
      ".ln-grouphead{background:#e4ece2;border:1px solid #d9ded6;border-right:0;border-bottom:0;padding:7px 8px;font-weight:700;color:#243127;text-align:left;vertical-align:top}",
      ".ln-grouphead,.ln-colhead{white-space:nowrap}",
      ".ln-grouphead span,.ln-colhead span{display:inline-block;max-width:130px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}",
      ".ln-colhead{min-width:180px}",
      ".ln-hide-btn{float:right;width:22px;height:22px;border:1px solid #b8c3b5;border-radius:5px;background:#fff;color:#425044;cursor:pointer;font-weight:700;line-height:18px;padding:0}",
      ".ln-collapsed{display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px 0}",
      ".ln-restore{height:28px;border:1px solid #b8c3b5;border-radius:6px;background:#fff;color:#243127;cursor:pointer;padding:0 8px}",
      ".ln-matrix tr>*:last-child{border-right:1px solid #d9ded6}",
      ".ln-matrix tbody tr:last-child>*{border-bottom:1px solid #d9ded6}",
      ".ln-matrix thead th{position:sticky;top:0;z-index:3}",
      ".ln-date{position:sticky;left:0;z-index:2}",
      ".ln-corner{z-index:4}",
      ".ln-cell{min-width:180px;height:86px;background:#fff;border:1px solid #d9ded6;border-right:0;border-bottom:0;padding:7px;box-sizing:border-box;vertical-align:top}",
      ".ln-card{display:block;width:100%;text-align:left;border:1px solid #ccd5c8;border-radius:7px;background:#fbfcfa;color:#172026;padding:8px;margin:0 0 6px;cursor:pointer;box-shadow:0 1px 0 rgba(20,30,20,.04)}",
      ".ln-card:focus{outline:2px solid #427c6d;outline-offset:1px}",
      ".ln-card-top{display:flex;gap:7px;align-items:flex-start}",
      ".ln-card-title{font-weight:600;overflow-wrap:anywhere}",
      ".ln-card-check{margin-top:2px;accent-color:#427c6d}",
      ".ln-dot{width:7px;height:7px;border-radius:99px;background:#8b977f;margin-top:7px;flex:0 0 auto}",
      ".ln-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}",
      ".ln-tag{font-size:11px;border:1px solid #d4c9a8;background:#fff8dc;color:#4b4024;border-radius:999px;padding:1px 6px}",
      ".ln-tag-date{border-color:#b8c5d6;background:#edf5ff;color:#234563}",
      ".ln-tag-due{border-color:#c6b6d4;background:#f7f0ff;color:#4d3261}",
      ".ln-tag-candidate{border-color:#b7c8bf;background:#eff8f2;color:#284d39}",
      ".ln-tag-alert{border-color:#d8a7a0;background:#fff0ed;color:#7f251d;font-weight:700}",
      ".ln-evidence{display:block;margin-top:5px;color:#627065;font-size:11px}",
      ".ln-decision{display:block;margin-top:3px;color:#526258;font-size:11px}",
      ".ln-card.is-past-open{border-color:#d8a7a0;background:#fff9f7}",
      ".ln-empty{caption-side:bottom;text-align:left;padding:24px;color:#627065}",
      ".ln-context{border-top:1px solid #d9ded6;background:#fff;padding:10px 12px;color:#415047;min-height:20px}",
      "@media (max-width:760px){.ln-shell{grid-template-columns:1fr}.ln-editor{border-right:0;border-bottom:1px solid #d9ded6;min-height:260px}.ln-date,.ln-colhead{min-width:104px}.ln-colhead,.ln-cell{min-width:160px}}"
    ].join("");
    doc.head.appendChild(style);
  }

  function fullDslHeader(defaultLens) {
    return [
      "---",
      "lanenote:",
      "  profile.defaultLens: " + (defaultLens || "timeline"),
      "  lenses.timeline.label: 時系列 × 担当",
      "  lenses.timeline.rows: scheduledAt",
      "  lenses.timeline.columns: assignee",
      "  lenses.reverse.label: 担当 × 日付",
      "  lenses.reverse.rows: assignee",
      "  lenses.reverse.columns: scheduledAt",
      "  lenses.productPhase.label: 製品 × 工程",
      "  lenses.productPhase.rows: product",
      "  lenses.productPhase.columns: phase",
      "  roles.PM.group: 推進",
      "  roles.企画.group: 推進",
      "  roles.開発.group: 開発系",
      "  roles.インフラ.group: 開発系",
      "  roles.評価.aliases: QA",
      "  roles.評価.group: 品質系",
      "  roles.私.group: 個人",
      "  filters.status: All",
      "  filters.assignee: All",
      "  filters.dateRole: All",
      "---",
      ""
    ].join("\n");
  }

  function defaultTemplates() {
    return {
      releaseTimeline: {
        label: "リリース計画",
        lens: "timeline",
        source: [
          fullDslHeader("timeline"),
          "# Product A v2.4 リリース計画",
          "",
          "8/3",
          "PM",
          "- [x] リリース要件を確定",
          "企画",
          "- [ ] Product A 仕様レビュー !8/4",
          "",
          "8/5",
          "開発",
          "- [ ] Product A 認証API実装 !8/8",
          "- [ ] Product A データ移行手順レビュー !8/9",
          "インフラ",
          "- [ ] Product A 本番監視設定 !8/9",
          "",
          "8/10",
          "評価",
          "- [ ] Product A 結合試験 !8/12",
          "- [ ] Product A リリース判定資料を作る !8/13",
          "",
          "8/14",
          "PM",
          "- [ ] Product A リリース判定"
        ].join("\n")
      },
      assigneeWbs: {
        label: "担当別WBS",
        lens: "reverse",
        source: [
          fullDslHeader("reverse"),
          "# Product A v2.4 担当別WBS",
          "",
          "PM",
          "- [x] 8/3 リリース要件を確定",
          "- [ ] 8/14 Product A リリース判定",
          "",
          "開発",
          "- [ ] 8/5 Product A 認証API実装 !8/8",
          "- [ ] 8/6 Product A データ移行ツール実装 !8/9",
          "",
          "評価",
          "- [ ] 8/10 Product A 結合試験 !8/12",
          "- [ ] 8/13 Product A リリース判定資料レビュー",
          "",
          "インフラ",
          "- [ ] 8/8 Product A 本番監視設定 !8/9"
        ].join("\n")
      },
      productPhase: {
        label: "製品別工程管理",
        lens: "productPhase",
        source: [
          fullDslHeader("productPhase"),
          "# Product A / Product B 工程管理",
          "",
          "8/3",
          "企画",
          "- [x] Product A 要件レビュー",
          "- [ ] Product B 要件整理 !8/5",
          "",
          "8/6",
          "開発",
          "- [ ] Product A 認証API実装 !8/9",
          "- [ ] Product B 管理画面設計 !8/8",
          "",
          "8/10",
          "評価",
          "- [ ] Product A 結合試験 !8/12",
          "- [ ] Product B 単体試験レビュー !8/11",
          "",
          "8/14",
          "PM",
          "- [ ] Product A リリース判定",
          "- [ ] Product B 開発継続判断"
        ].join("\n")
      }
    };
  }

  function defaultProfile() {
    return {
      defaultLens: "timeline",
      roles: {
        "PM": { group: "推進" },
        "企画": { group: "推進" },
        "開発": { group: "開発系" },
        "インフラ": { group: "開発系" },
        "評価": { aliases: ["QA"], group: "品質系" },
        "私": { group: "個人" }
      },
      lenses: {
        timeline: { label: "時系列 × 担当", rows: "scheduledAt", columns: "assignee" },
        reverse: { label: "担当 × 日付", rows: "assignee", columns: "scheduledAt" },
        productPhase: { label: "製品 × 工程", rows: "product", columns: "phase" }
      },
      templates: defaultTemplates()
    };
  }

  function mergeProfile(customProfile, customTemplates, sourceProfile) {
    var defaults = defaultProfile();
    var custom = customProfile || {};
    var source = sourceProfile || {};
    return {
      defaultLens: source.defaultLens || custom.defaultLens || defaults.defaultLens,
      roles: Object.assign({}, defaults.roles, custom.roles || {}, source.roles || {}),
      lenses: Object.assign({}, defaults.lenses, custom.lenses || {}, source.lenses || {}),
      templates: Object.assign({}, defaults.templates, custom.templates || {}, customTemplates || {}, source.templates || {})
    };
  }

  function cloneDefaultTemplates() {
    return JSON.parse(JSON.stringify(defaultTemplates()));
  }

  function cloneDefaultProfile() {
    return JSON.parse(JSON.stringify(defaultProfile()));
  }

  function create(container, options) {
    var target = typeof container === "string" ? document.querySelector(container) : container;
    if (!target) throw new Error("LaneNoteCore.create requires a container.");
    var opts = options || {};
    var runtimeProfile = mergeProfile(opts.profile, opts.templates);
    var runtimeOptions = Object.assign({}, opts, { profile: runtimeProfile });
    var storageKey = opts.storageKey || "lanenote-core-source";
    var dateBaseKey = storageKey + ":date-base";
    var blockMetadataKey = storageKey + ":block-metadata-v1";
    if (!opts.baseDate && global.localStorage) {
      var savedDateBase = localStorage.getItem(dateBaseKey);
      if (!savedDateBase) {
        savedDateBase = new Date().toISOString();
        localStorage.setItem(dateBaseKey, savedDateBase);
      }
      opts.baseDate = savedDateBase;
    }
    runtimeOptions.baseDate = opts.baseDate;
    var source = opts.source != null ? String(opts.source) : (global.localStorage && localStorage.getItem(storageKey)) || sampleNote();
    var savedBlockState = null;
    if (global.localStorage) {
      try { savedBlockState = JSON.parse(localStorage.getItem(blockMetadataKey) || "null"); } catch (error) { savedBlockState = null; }
    }
    var blockState = reconcileLineMetadata(savedBlockState, source, localTimestamp(new Date()));
    var activeLens = opts.lens || "";
    var lensSetByUser = Boolean(opts.lens);
    var filters = { status: "All", assignee: "All", dateRole: "All", query: "" };
    var filtersInitializedFromSource = false;
    var collapsedGroups = {};
    var collapsedAssignees = {};
    var collapsedColumns = {};

    injectStyles(target.ownerDocument);
    target.classList.add("ln-root");
    target.innerHTML = [
      '<div class="ln-toolbar">',
      '<select class="ln-lens" aria-label="Lens"></select>',
      '<select class="ln-template" aria-label="テンプレート"></select>',
      '<button class="ln-template-apply" type="button">テンプレ適用</button>',
      '<input class="ln-search" type="search" placeholder="検索" aria-label="検索">',
      '<select class="ln-status" aria-label="状態"><option>All</option><option>Open</option><option>In Progress</option><option>Blocked</option><option>Done</option><option>Hidden</option><option>Archive</option></select>',
      '<select class="ln-date-role" aria-label="日付役割"><option>All</option></select>',
      '<select class="ln-assignee" aria-label="担当"><option>All</option></select>',
      '<button class="ln-download" type="button">整理文DL</button>',
      '</div>',
      '<div class="ln-shell">',
      '<textarea class="ln-editor" spellcheck="false"></textarea>',
      '<div class="ln-preview"></div>',
      '</div>',
      '<div class="ln-context">カードを選ぶと元ノートの該当行を表示します。</div>'
    ].join("");

    var editor = target.querySelector(".ln-editor");
    var preview = target.querySelector(".ln-preview");
    var context = target.querySelector(".ln-context");
    var lensSelect = target.querySelector(".ln-lens");
    var templateSelect = target.querySelector(".ln-template");
    var templateApply = target.querySelector(".ln-template-apply");
    var search = target.querySelector(".ln-search");
    var status = target.querySelector(".ln-status");
    var dateRole = target.querySelector(".ln-date-role");
    var assignee = target.querySelector(".ln-assignee");
    var download = target.querySelector(".ln-download");
    editor.value = source;
    var activeProfile = runtimeProfile;

    function lensNamesFor(profile) {
      return Object.keys((profile && profile.lenses) || {});
    }

    function syncLensOptions(profile, modelConfig) {
      var lensNames = lensNamesFor(profile);
      if (!lensNames.length) {
        lensSelect.hidden = true;
        return;
      }
      lensSelect.hidden = false;
      lensSelect.innerHTML = lensNames.map(function (name) {
        var definition = profile.lenses[name] || {};
        return '<option value="' + escapeHTML(name) + '">' + escapeHTML(definition.label || name) + '</option>';
      }).join("");
      var sourceDefault = (modelConfig && modelConfig.lens) || profile.defaultLens || lensNames[0];
      if (!lensSetByUser) {
        activeLens = sourceDefault;
      } else if (typeof activeLens !== "string" || lensNames.indexOf(activeLens) === -1) {
        activeLens = sourceDefault;
        lensSetByUser = false;
      }
      if (lensNames.indexOf(activeLens) !== -1) lensSelect.value = activeLens;
    }

    syncLensOptions(activeProfile, {});

    function renderTemplateOptions() {
      var templateNames = Object.keys(activeProfile.templates || {}).filter(function (name) {
        var definition = activeProfile.templates[name] || {};
        return !definition.lens || typeof activeLens !== "string" || definition.lens === activeLens;
      });
      templateSelect.innerHTML = '<option value="">テンプレート</option>' + templateNames.map(function (name) {
        var definition = activeProfile.templates[name] || {};
        return '<option value="' + escapeHTML(name) + '">' + escapeHTML(definition.label || name) + '</option>';
      }).join("");
      templateSelect.hidden = !templateNames.length;
      templateApply.hidden = !templateNames.length;
    }
    renderTemplateOptions();

    function parseCurrent() {
      return parse(editor.value, Object.assign({}, runtimeOptions, { lineMetadata: blockState.records }));
    }

    function refresh() {
      var model = parseCurrent();
      activeProfile = model.profile || runtimeProfile;
      syncLensOptions(activeProfile, model.config);
      renderTemplateOptions();
      if (!filtersInitializedFromSource) {
        filters = Object.assign(filters, filtersFromConfig(model.config));
        search.value = filters.query || "";
        status.value = filters.status || "All";
        filtersInitializedFromSource = true;
      }
      assignee.innerHTML = '<option>All</option>' + model.assignees.map(function (name) {
        return '<option' + (filters.assignee === name ? " selected" : "") + '>' + escapeHTML(name) + '</option>';
      }).join("");
      dateRole.innerHTML = '<option>All</option>' + model.dateRoles.map(function (name) {
        return '<option' + (filters.dateRole === name ? " selected" : "") + '>' + escapeHTML(name) + '</option>';
      }).join("");
      status.value = filters.status || "All";
      assignee.value = filters.assignee || "All";
      dateRole.value = filters.dateRole || "All";
      renderMatrix(model, preview, {
        filters: filters,
        assigneeGroups: opts.assigneeGroups,
        profile: activeProfile,
        lens: activeLens,
        collapsedGroups: collapsedGroups,
        collapsedAssignees: collapsedAssignees,
        collapsedColumns: collapsedColumns
      });
      if (global.localStorage) {
        localStorage.setItem(storageKey, editor.value);
        localStorage.setItem(blockMetadataKey, JSON.stringify(blockState));
      }
      if (typeof opts.onChange === "function") opts.onChange(model);
      return model;
    }

    function applyTemplate(templateId) {
      var definition = activeProfile.templates && activeProfile.templates[templateId];
      if (!definition) throw new Error("Unknown LaneNote template: " + templateId);
      if (definition.lens) {
        activeLens = definition.lens;
        lensSetByUser = false;
        if (lensNamesFor(activeProfile).indexOf(activeLens) !== -1) lensSelect.value = activeLens;
      }
      editor.value = String(definition.source || "");
      blockState = reconcileLineMetadata(null, editor.value, localTimestamp(new Date()));
      filtersInitializedFromSource = false;
      templateSelect.value = "";
      renderTemplateOptions();
      return refresh();
    }

    editor.addEventListener("input", function () {
      blockState = reconcileLineMetadata(blockState, editor.value, localTimestamp(new Date()));
      refresh();
    });
    lensSelect.addEventListener("change", function () {
      activeLens = lensSelect.value;
      lensSetByUser = true;
      renderTemplateOptions();
      refresh();
    });
    templateApply.addEventListener("click", function () {
      var templateId = templateSelect.value;
      if (!templateId) return;
      if (editor.value.trim() && global.confirm && !global.confirm("現在のノートを選択したテンプレートで置き換えますか？")) return;
      applyTemplate(templateId);
    });
    search.addEventListener("input", function () {
      filters.query = search.value;
      refresh();
    });
    status.addEventListener("change", function () {
      filters.status = status.value;
      refresh();
    });
    dateRole.addEventListener("change", function () {
      filters.dateRole = dateRole.value;
      refresh();
    });
    assignee.addEventListener("change", function () {
      filters.assignee = assignee.value;
      refresh();
    });
    download.addEventListener("click", function () {
      var model = parseCurrent();
      var markdown = exportProjectedMarkdown(model, {
        filters: filters,
        assigneeGroups: opts.assigneeGroups,
        profile: activeProfile,
        lens: activeLens,
        collapsedGroups: collapsedGroups,
        collapsedAssignees: collapsedAssignees,
        collapsedColumns: collapsedColumns
      });
      downloadText("lanenote-projected.md", markdown);
    });
    preview.addEventListener("click", function (event) {
      var collapseGroup = event.target.closest("[data-collapse-group]");
      if (collapseGroup) {
        collapsedGroups[collapseGroup.dataset.collapseGroup] = true;
        refresh();
        return;
      }
      var collapseAssignee = event.target.closest("[data-collapse-assignee]");
      if (collapseAssignee) {
        collapsedAssignees[collapseAssignee.dataset.collapseAssignee] = true;
        refresh();
        return;
      }
      var collapseColumn = event.target.closest("[data-collapse-column]");
      if (collapseColumn) {
        collapsedColumns[collapseColumn.dataset.collapseColumn] = true;
        refresh();
        return;
      }
      var restoreGroup = event.target.closest("[data-restore-group]");
      if (restoreGroup) {
        delete collapsedGroups[restoreGroup.dataset.restoreGroup];
        refresh();
        return;
      }
      var restoreAssignee = event.target.closest("[data-restore-assignee]");
      if (restoreAssignee) {
        delete collapsedAssignees[restoreAssignee.dataset.restoreAssignee];
        refresh();
        return;
      }
      var restoreColumn = event.target.closest("[data-restore-column]");
      if (restoreColumn) {
        delete collapsedColumns[restoreColumn.dataset.restoreColumn];
        refresh();
        return;
      }
      var check = event.target.closest(".ln-card-check");
      if (check) {
        event.stopPropagation();
        editor.value = replaceCheckboxAtLine(editor.value, Number(check.dataset.lineIndex), check.checked);
        blockState = reconcileLineMetadata(blockState, editor.value, localTimestamp(new Date()));
        refresh();
        return;
      }
      var card = event.target.closest(".ln-card");
      if (!card) return;
      var lineIndex = Number(card.dataset.lineIndex);
      var line = editor.value.split(/\r?\n/)[lineIndex] || "";
      var selectedModel = parseCurrent();
      var selectedAxes = resolveAxes(selectedModel, Object.assign({}, runtimeOptions, { profile: activeProfile, lens: activeLens }));
      var selectedItem = selectedModel.items.filter(function (item) { return item.lineIndex === lineIndex; })[0];
      context.textContent = "line " + (lineIndex + 1) + ": " + line + (selectedItem ? " / " + decisionSummary(selectedItem, selectedAxes) : "");
      editor.focus();
      setEditorLineSelection(editor, lineIndex);
    });

    var api = {
      version: VERSION,
      element: target,
      parse: parseCurrent,
      render: refresh,
      getSource: function () { return editor.value; },
      exportMarkdown: function () {
        return exportProjectedMarkdown(parseCurrent(), {
          filters: filters,
          assigneeGroups: opts.assigneeGroups,
          profile: activeProfile,
          lens: activeLens,
          collapsedGroups: collapsedGroups,
          collapsedAssignees: collapsedAssignees,
          collapsedColumns: collapsedColumns
        });
      },
      downloadMarkdown: function (filename) {
        return downloadText(filename, api.exportMarkdown());
      },
      exportJSON: function () {
        return exportPortableJSON(parseCurrent(), blockState.records);
      },
      downloadJSON: function (filename) {
        return downloadText(filename || "lanenote-portable.json", api.exportJSON(), "application/json;charset=utf-8");
      },
      getLens: function () { return activeLens; },
      setLens: function (nextLens) {
        activeLens = nextLens;
        lensSetByUser = true;
        if (typeof nextLens === "string" && lensNamesFor(activeProfile).indexOf(nextLens) !== -1) lensSelect.value = nextLens;
        renderTemplateOptions();
        return refresh();
      },
      getTemplates: function () {
        return JSON.parse(JSON.stringify(activeProfile.templates || {}));
      },
      applyTemplate: applyTemplate,
      setSource: function (nextSource) {
        editor.value = String(nextSource || "");
        blockState = reconcileLineMetadata(blockState, editor.value, localTimestamp(new Date()));
        return refresh();
      },
      destroy: function () {
        target.innerHTML = "";
        target.classList.remove("ln-root");
      }
    };
    refresh();
    return api;
  }

  function setEditorLineSelection(editor, lineIndex) {
    var lines = editor.value.split(/\r?\n/);
    var start = 0;
    for (var i = 0; i < lineIndex; i += 1) start += lines[i].length + 1;
    editor.setSelectionRange(start, start + (lines[lineIndex] || "").length);
  }

  function sampleNote() {
    return defaultTemplates().releaseTimeline.source;
  }

  global.LaneNoteCore = {
    version: VERSION,
    create: create,
    parse: parse,
    renderMatrix: renderMatrix,
    getDefaultTemplates: cloneDefaultTemplates,
    getDefaultProfile: cloneDefaultProfile,
    exportProjectedMarkdown: exportProjectedMarkdown,
    exportPortableJSON: exportPortableJSON,
    replaceCheckboxAtLine: replaceCheckboxAtLine
  };
})(typeof window !== "undefined" ? window : globalThis);

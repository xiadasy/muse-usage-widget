// ============================================================
// Muse 用量挂件（Scriptable）
// 模式跟你的 NewAPI 挂件一样：不直连 Muse，只读 GitHub raw JSON
// 数据源：本机定时跑 subscription-status -> 推送到 GitHub
//          -> data/muse_usage.json -> 这个挂件只读 raw
//
// 安装：
// 1. App Store 装 Scriptable
// 2. 新建脚本，粘贴本文件全文，命名 Muse 用量
// 3. 把下面 DATA_URL 改成你自己的 raw 地址（默认已填好提议的仓库）
// 4. 长按桌面 -> + -> Scriptable -> 选这个脚本，中号最好看
// ============================================================

const DATA_URL = "https://raw.githubusercontent.com/xiadasy/muse-usage-widget/main/data/muse_usage.json";

const TIMEOUT_SECONDS = 15;
const CACHE_FILE = "muse-usage-cache.json";

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function colorForRemaining(ratio) {
  if (ratio <= 0.1) return new Color("#ff453a");
  if (ratio <= 0.2) return new Color("#ff9f0a");
  return new Color("#30d158");
}

function drawBar(widget, ratio, color, width, height) {
  const bg = widget.addStack();
  bg.size = new Size(width, height);
  bg.cornerRadius = height / 2;
  bg.backgroundColor = new Color("#ffffff", 0.12);
  bg.layoutHorizontally();

  const fill = bg.addStack();
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const fillWidth = Math.max(height, Math.min(width, width * safeRatio));
  fill.size = new Size(fillWidth, height);
  fill.cornerRadius = height / 2;
  fill.backgroundColor = color;
}

function lineKV(parent, label, value, strong = false) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const l = row.addText(label);
  l.font = Font.systemFont(11);
  l.textColor = new Color("#9ca3af");

  row.addSpacer();

  const v = row.addText(value);
  v.font = strong ? Font.semiboldSystemFont(12) : Font.systemFont(11);
  v.textColor = new Color("#f9fafb");
}

function readCache() {
  try {
    const fm = FileManager.local();
    const path = fm.joinPath(fm.libraryDirectory(), CACHE_FILE);
    if (!fm.fileExists(path)) return null;
    return JSON.parse(fm.readString(path));
  } catch (e) {
    return null;
  }
}

function writeCache(j) {
  try {
    const fm = FileManager.local();
    const path = fm.joinPath(fm.libraryDirectory(), CACHE_FILE);
    fm.writeString(path, JSON.stringify(j));
  } catch (e) {}
}

async function fetchData() {
  const req = new Request(DATA_URL + "?t=" + Date.now());
  req.method = "GET";
  req.timeoutInterval = TIMEOUT_SECONDS;
  req.headers = { "Accept": "application/json", "Cache-Control": "no-store" };
  const j = await req.loadJSON();
  writeCache(j);
  return j;
}

function fmtUpdatedAt(s) {
  if (!s) return "";
  // "2026-11-09T14:41:00+08:00" -> "11-09 14:41"
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return m[2] + "-" + m[3] + " " + m[4] + ":" + m[5];
  return String(s).replace("T", " ").slice(0, 16);
}

function fmtReset(s, fallback) {
  if (s) {
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return m[2] + "-" + m[3] + " " + m[4] + ":" + m[5];
    return String(s);
  }
  return fallback || "—";
}

async function buildWidget(j, isCached) {
  const family = config.widgetFamily || "medium";

  const percentUsed = num(j?.percent_used, 0);
  const percentRemaining = Math.max(0, Math.min(100, 100 - percentUsed));
  const ratio = percentRemaining / 100;
  const mainColor = colorForRemaining(ratio);

  const plan = j?.plan || "Free";
  const resetText = fmtReset(j?.resets_at, j?.resets_at_text);
  const extra = j?.additional_tokens || {};
  const extraText = extra.left_label || (extra.left ? extra.left + " left" : "—");
  const extraUsed = num(extra.percent_used, 0);

  const w = new ListWidget();
  w.backgroundColor = new Color("#111827");
  w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());

  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  const title = top.addText("Muse · 用量");
  title.font = Font.semiboldSystemFont(12);
  title.textColor = new Color("#9ca3af");

  top.addSpacer();
  const badge = top.addText((isCached ? "缓存 " : "") + percentRemaining + "% 剩");
  badge.font = Font.mediumSystemFont(11);
  badge.textColor = mainColor;

  w.addSpacer(8);

  const mainText = w.addText(percentRemaining + "%");
  mainText.font = Font.boldSystemFont(family === "small" ? 24 : 30);
  mainText.textColor = mainColor;

  const sub = w.addText("本周已用 " + percentUsed + "% · " + plan);
  sub.font = Font.systemFont(11);
  sub.textColor = new Color("#9ca3af");

  w.addSpacer(8);
  drawBar(w, ratio, mainColor, family === "small" ? 140 : family === "large" ? 320 : 290, 6);
  w.addSpacer(10);

  if (family === "small") {
    const s1 = w.addText("重置 " + resetText);
    s1.font = Font.systemFont(10);
    s1.textColor = new Color("#d1d5db");

    const s2 = w.addText("额外 " + extraText);
    s2.font = Font.systemFont(10);
    s2.textColor = new Color("#9ca3af");
  } else {
    lineKV(w, "套餐", plan, true);
    w.addSpacer(4);
    lineKV(w, "本周已用", percentUsed + "%");
    w.addSpacer(4);
    lineKV(w, "本周剩余", percentRemaining + "%");
    w.addSpacer(4);
    lineKV(w, "重置时间", resetText);
    w.addSpacer(4);
    lineKV(w, "额外 tokens", extraText + "（已用 " + extraUsed + "%）");
  }

  w.addSpacer();
  const ts = w.addText("更新 " + fmtUpdatedAt(j?.updated_at));
  ts.font = Font.systemFont(9);
  ts.textColor = new Color("#6b7280");
  ts.rightAlignText();

  return w;
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#111827");
  w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);

  const t = w.addText("Muse 用量");
  t.font = Font.boldSystemFont(14);
  t.textColor = new Color("#ef4444");
  w.addSpacer(6);

  const m = w.addText(String(msg || "请求失败").slice(0, 200));
  m.font = Font.systemFont(10);
  m.textColor = new Color("#9ca3af");

  w.addSpacer();
  const tip = w.addText("请检查 DATA_URL 是否为 raw.githubusercontent.com 链接");
  tip.font = Font.systemFont(9);
  tip.textColor = new Color("#6b7280");
  return w;
}

async function main() {
  let widget;
  try {
    if (!DATA_URL.includes("raw.githubusercontent.com")) {
      throw new Error("DATA_URL 还没改成你的 GitHub raw 地址");
    }
    const j = await fetchData();
    widget = await buildWidget(j, false);
  } catch (e) {
    const cached = readCache();
    if (cached) {
      widget = await buildWidget(cached, true);
    } else {
      widget = errorWidget(e.message || String(e));
    }
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    const fam = args.widgetParameter || "medium";
    if (fam === "small") await widget.presentSmall();
    else if (fam === "large") await widget.presentLarge();
    else await widget.presentMedium();
  }
  Script.complete();
}

await main();

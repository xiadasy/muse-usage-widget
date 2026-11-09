// ============================================================
// Muse 用量挂件（Scriptable）v2 — 白卡风格
// 参考用户家里的马拉松 / DeepSeek / Quantumult X 挂件：
// 白底大圆角 + 大数字 + 黑进度条 + 图标明细行。
//
// 数据源不变：只读 GitHub raw JSON
// https://raw.githubusercontent.com/xiadasy/muse-usage-widget/main/data/muse_usage.json
// 由本机定时跑 subscription-status 生成并推送。
//
// 安装：Scriptable 新建脚本，粘贴全文，命名 Muse 用量，
// 长按桌面 -> + -> Scriptable -> 选这个脚本，中号最好看。
// ============================================================

const DATA_URL = "https://raw.githubusercontent.com/xiadasy/muse-usage-widget/main/data/muse_usage.json";

const TIMEOUT_SECONDS = 15;
const CACHE_FILE = "muse-usage-cache.json";

// ---------- 配色（白卡风格） ----------
const C = {
  bg: new Color("#ffffff"),
  title: new Color("#111111"),
  label: new Color("#6b7280"),
  value: new Color("#111111"),
  track: new Color("#e5e7eb"),
  bar: new Color("#111111"),
  footer: new Color("#9ca3af"),
};

// ---------- 小工具 ----------
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function statusPill(remaining) {
  if (remaining <= 0) return { text: "已用完", bg: "#fee2e2", fg: "#dc2626" };
  if (remaining <= 20) return { text: "快用完了", bg: "#ffedd5", fg: "#ea580c" };
  return { text: "正常", bg: "#dcfce7", fg: "#16a34a" };
}

function fmtResetDate(s) {
  // "2026-11-13T17:03:00+08:00" -> "11月13日 17:03"
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return String(s || "—");
  return Number(m[2]) + "月" + Number(m[3]) + "日 " + m[4] + ":" + m[5];
}

function fmtUpdated(s) {
  // "2026-11-09T14:58:54+08:00" -> "11/9 15:03"
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return "";
  return Number(m[2]) + "/" + Number(m[3]) + " " + m[4] + ":" + m[5];
}

function countdownText(s) {
  try {
    const t = new Date(s).getTime() - Date.now();
    if (!Number.isFinite(t) || t <= 0) return "已重置";
    const days = Math.floor(t / 86400000);
    const hours = Math.floor((t % 86400000) / 3600000);
    const mins = Math.floor((t % 3600000) / 60000);
    if (days > 0) return days + "天 " + hours + "小时";
    if (hours > 0) return hours + "小时 " + mins + "分";
    return mins + "分";
  } catch (e) {
    return "—";
  }
}

// ---------- 缓存 ----------
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

// ---------- 组件 ----------
function addPill(parent, text, bgHex, fgHex) {
  const pill = parent.addStack();
  pill.backgroundColor = new Color(bgHex);
  pill.cornerRadius = 9;
  pill.setPadding(3, 8, 3, 8);
  const t = pill.addText(text);
  t.font = Font.semiboldSystemFont(11);
  t.textColor = new Color(fgHex);
  return pill;
}

function drawBar(widget, ratio, width, height) {
  const bg = widget.addStack();
  bg.size = new Size(width, height);
  bg.cornerRadius = height / 2;
  bg.backgroundColor = C.track;
  bg.layoutHorizontally();
  const fill = bg.addStack();
  const safe = Math.max(0, Math.min(1, ratio));
  fill.size = new Size(Math.max(height, width * safe), height);
  fill.cornerRadius = height / 2;
  fill.backgroundColor = C.bar;
}

function iconRow(parent, symbolName, label, value) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = 6;
  try {
    const img = SFSymbol.named(symbolName).image;
    if (img) {
      const ic = row.addImage(img);
      ic.imageSize = new Size(13, 13);
      ic.tintColor = C.label;
    }
  } catch (e) {}
  const l = row.addText(label);
  l.font = Font.systemFont(12);
  l.textColor = C.label;
  row.addSpacer();
  const v = row.addText(value);
  v.font = Font.semiboldSystemFont(12);
  v.textColor = C.value;
}

// ---------- 主挂件 ----------
async function buildWidget(j, isCached) {
  const family = config.widgetFamily || "medium";
  const percentUsed = num(j?.percent_used, 0);
  const percentRemaining = Math.max(0, Math.min(100, 100 - percentUsed));
  const ratio = percentUsed / 100;
  const pill = statusPill(percentRemaining);
  const extra = j?.additional_tokens || {};
  const extraText = extra.left_label || "—";
  const resetText = fmtResetDate(j?.resets_at || j?.resets_at_text);
  const updatedText = fmtUpdated(j?.updated_at);

  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 16, 12, 16);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());

  // 标题行：Muse 用量 + 状态 pill
  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  const title = top.addText("Muse 用量");
  title.font = Font.boldSystemFont(17);
  title.textColor = C.title;
  top.addSpacer();
  addPill(top, pill.text, pill.bg, pill.fg);

  w.addSpacer(10);

  // 大数字：已用 / 剩余
  const nums = w.addStack();
  nums.layoutHorizontally();
  nums.bottomAlignContent();

  const left = nums.addStack();
  left.layoutVertically();
  const ll = left.addText("已用");
  ll.font = Font.systemFont(12);
  ll.textColor = C.label;
  const lv = left.addText(percentUsed + "%");
  lv.font = Font.boldSystemFont(28);
  lv.textColor = C.title;

  nums.addSpacer();

  const right = nums.addStack();
  right.layoutVertically();
  const rl = right.addText("剩余");
  rl.font = Font.systemFont(12);
  rl.textColor = C.label;
  rl.rightAlignText();
  const rv = right.addText(percentRemaining + "%");
  rv.font = Font.boldSystemFont(28);
  rv.textColor = C.title;
  rv.rightAlignText();

  w.addSpacer(8);
  drawBar(w, ratio, family === "small" ? 140 : family === "large" ? 320 : 290, 8);

  if (family === "small") {
    w.addSpacer(8);
    const s = w.addText("重置 " + resetText);
    s.font = Font.systemFont(11);
    s.textColor = C.label;
  } else {
    w.addSpacer(10);
    iconRow(w, "timer", "剩余时间", countdownText(j?.resets_at));
    w.addSpacer(6);
    iconRow(w, "calendar", "重置时间", resetText);
    w.addSpacer(6);
    iconRow(w, "gift", "额外 tokens", extraText + "（已用 " + num(extra.percent_used, 0) + "%）");
  }

  w.addSpacer();
  const foot = w.addText(
    "套餐 " + (j?.plan || "Free") + " · 更新于 " + (updatedText || "—") + (isCached ? "（缓存）" : "")
  );
  foot.font = Font.systemFont(10);
  foot.textColor = C.footer;

  return w;
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 16, 14, 16);
  w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
  const t = w.addText("Muse 用量");
  t.font = Font.boldSystemFont(16);
  t.textColor = C.title;
  w.addSpacer(6);
  const m = w.addText(String(msg || "请求失败").slice(0, 200));
  m.font = Font.systemFont(11);
  m.textColor = C.label;
  w.addSpacer();
  const tip = w.addText("请检查 DATA_URL 是否为 raw.githubusercontent.com 链接");
  tip.font = Font.systemFont(10);
  tip.textColor = C.footer;
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

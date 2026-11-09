// ============================================================
// Muse 用量挂件（Scriptable）v4 — 小尺寸放进小猫咪
// v3 的问题：v2 小尺寸双大数字 + 长行塞不下，字被裁。
// v4：小尺寸用猫照片做底图（assets/cat.json，base64 存 GitHub，
// 手机上只下载一次后缓存），底部压一张暖米卡片放数字；
// 没拿到图时回退到 v3 的纯暖米版，不会白屏。
//
// 数据源不变：只读 GitHub raw JSON
// https://raw.githubusercontent.com/xiadasy/muse-usage-widget/main/data/muse_usage.json
// 由本机定时跑 subscription-status 生成并推送。
//
// 安装：Scriptable 里把旧脚本全文盖掉，命名 Muse 用量，
// 长按桌面 -> + -> Scriptable -> 选这个脚本，选小尺寸。
// ============================================================

const DATA_URL = "https://raw.githubusercontent.com/xiadasy/muse-usage-widget/main/data/muse_usage.json";
const CAT_JSON_URL = "https://raw.githubusercontent.com/xiadasy/muse-usage-widget/main/assets/cat.json";
const CAT_CACHE_FILE = "muse-cat.jpg";

const TIMEOUT_SECONDS = 15;
const CACHE_FILE = "muse-usage-cache.json";

// ---------- 配色（暖米，配壁纸） ----------
const C = {
  bg: new Color("#fbf6ec"),
  title: new Color("#241a12"),
  label: new Color("#8a7a66"),
  value: new Color("#241a12"),
  track: new Color("#e9dfc9"),
  bar: new Color("#241a12"),
  footer: new Color("#a08b74"),
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

// ---------- 猫咪底图：只下载一次，之后读缓存 ----------
// 图片以 base64 存在 GitHub 的 assets/cat.json 里（公开仓库，
// 任何人拿到链接都能解出这张猫照片）；介意的话把 CAT_JSON_URL
// 换成本地文件，或直接删掉 loadCatImage 的调用走纯色版。
async function loadCatImage() {
  try {
    const fm = FileManager.local();
    const path = fm.joinPath(fm.libraryDirectory(), CAT_CACHE_FILE);
    if (fm.fileExists(path)) return fm.readImage(path);
    const req = new Request(CAT_JSON_URL + "?t=" + Date.now());
    req.timeoutInterval = TIMEOUT_SECONDS;
    const j = await req.loadJSON();
    if (!j || !j.image_base64) return null;
    const data = Data.fromBase64String(j.image_base64);
    const img = Image.fromData(data);
    if (!img) return null;
    fm.writeImage(path, img);
    return img;
  } catch (e) {
    return null;
  }
}

// ---------- 组件 ----------
function addPill(parent, text, bgHex, fgHex, fontSize) {
  const pill = parent.addStack();
  pill.backgroundColor = new Color(bgHex);
  pill.cornerRadius = 8;
  pill.setPadding(2, 7, 2, 7);
  const t = pill.addText(text);
  t.font = Font.semiboldSystemFont(fontSize || 11);
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

// ---------- 小尺寸 + 猫咪底图：上半截是猫，下半截暖米卡片 ----------
// 卡片高约 78pt，猫脸在照片上半部，不会被卡片盖住。
function buildSmallWithCat(j, isCached, catImage) {
  const percentUsed = num(j?.percent_used, 0);
  const percentRemaining = Math.max(0, Math.min(100, 100 - percentUsed));
  const pill = statusPill(percentRemaining);

  const w = new ListWidget();
  w.backgroundImage = catImage;
  w.setPadding(10, 10, 10, 10);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());

  w.addSpacer();

  const card = w.addStack();
  card.backgroundColor = C.bg;
  card.cornerRadius = 12;
  card.layoutVertically();
  card.setPadding(8, 12, 8, 12);

  const row = card.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  const big = row.addText(percentRemaining + "%");
  big.font = Font.boldSystemFont(26);
  big.textColor = C.title;
  row.addSpacer();
  addPill(row, pill.text, pill.bg, pill.fg, 10);

  card.addSpacer(5);
  drawBar(card, percentUsed / 100, 111, 6);
  card.addSpacer(5);
  const line = card.addText("Muse · 重置 " + fmtResetDate(j?.resets_at || j?.resets_at_text));
  line.font = Font.systemFont(10);
  line.textColor = C.label;
  return w;
}

// ---------- 小尺寸（无图回退）：155x155pt，只放一个大数字 ----------
// 内容宽 = 155 - 左右 padding 12*2 = 131pt，全部按这个算：
/// "0%" 36pt 约 45pt 宽；"重置 11月13日 17:03" 11pt 约 110pt 宽，都放得下。
function buildSmallPlain(j, isCached) {
  const percentUsed = num(j?.percent_used, 0);
  const percentRemaining = Math.max(0, Math.min(100, 100 - percentUsed));
  const pill = statusPill(percentRemaining);

  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 12, 10, 12);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());

  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  const title = top.addText("Muse 用量");
  title.font = Font.boldSystemFont(14);
  title.textColor = C.title;
  top.addSpacer();
  addPill(top, pill.text, pill.bg, pill.fg, 10);

  w.addSpacer(6);

  const lab = w.addText("本周剩余");
  lab.font = Font.systemFont(11);
  lab.textColor = C.label;
  lab.centerAlignText();

  const big = w.addText(percentRemaining + "%");
  big.font = Font.boldSystemFont(36);
  big.textColor = C.title;
  big.centerAlignText();

  w.addSpacer(6);
  drawBar(w, percentUsed / 100, 131, 7);

  w.addSpacer(7);
  const l1 = w.addText("已用 " + percentUsed + "%");
  l1.font = Font.systemFont(11);
  l1.textColor = C.label;
  const l2 = w.addText("重置 " + fmtResetDate(j?.resets_at || j?.resets_at_text));
  l2.font = Font.systemFont(11);
  l2.textColor = C.label;

  w.addSpacer();
  const foot = w.addText("更新于 " + (fmtUpdated(j?.updated_at) || "—") + (isCached ? "（缓存）" : ""));
  foot.font = Font.systemFont(9);
  foot.textColor = C.footer;
  return w;
}

// ---------- 中 / 大尺寸 ----------
function buildMedium(j, isCached, family) {
  const percentUsed = num(j?.percent_used, 0);
  const percentRemaining = Math.max(0, Math.min(100, 100 - percentUsed));
  const ratio = percentUsed / 100;
  const pill = statusPill(percentRemaining);
  const extra = j?.additional_tokens || {};
  // 额外 tokens 只显示 "30B"，长串 "30B tokens left（已用 0%）" 会把行撑爆
  const extraShort = String(extra.left_label || "—").replace(/ tokens left/i, "");

  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 16, 12, 16);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());

  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  const title = top.addText("Muse 用量");
  title.font = Font.boldSystemFont(17);
  title.textColor = C.title;
  top.addSpacer();
  addPill(top, pill.text, pill.bg, pill.fg, 11);

  w.addSpacer(10);

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
  drawBar(w, ratio, family === "large" ? 320 : 290, 8);

  w.addSpacer(10);
  iconRow(w, "timer", "剩余时间", countdownText(j?.resets_at));
  w.addSpacer(6);
  iconRow(w, "calendar", "重置时间", fmtResetDate(j?.resets_at || j?.resets_at_text));
  w.addSpacer(6);
  iconRow(w, "gift", "额外 tokens", extraShort);

  w.addSpacer();
  const foot = w.addText(
    "套餐 " + (j?.plan || "Free") + " · 更新于 " + (fmtUpdated(j?.updated_at) || "—") + (isCached ? "（缓存）" : "")
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
    const family = config.widgetFamily || "small";
    if (family === "small") {
      const cat = await loadCatImage();
      widget = cat ? buildSmallWithCat(j, false, cat) : buildSmallPlain(j, false);
    } else {
      widget = buildMedium(j, false, family);
    }
  } catch (e) {
    const cached = readCache();
    if (cached) {
      const family = config.widgetFamily || "small";
      if (family === "small") {
        const cat = await loadCatImage();
        widget = cat ? buildSmallWithCat(cached, true, cat) : buildSmallPlain(cached, true);
      } else {
        widget = buildMedium(cached, true, family);
      }
    } else {
      widget = errorWidget(e.message || String(e));
    }
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    const fam = args.widgetParameter || "small";
    if (fam === "small") await widget.presentSmall();
    else if (fam === "large") await widget.presentLarge();
    else await widget.presentMedium();
  }
  Script.complete();
}

await main();

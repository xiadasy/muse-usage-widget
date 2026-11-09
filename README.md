# Muse 用量挂件（Scriptable）

跟你的 NewAPI 挂件同一个套路：Scriptable 不直连 Muse，只读 GitHub raw JSON。

```
本机 Muse VM 定时跑 subscription-status
  -> scripts/update_muse_usage.py 生成 data/muse_usage.json
  -> 推送到本仓库
  -> Scriptable 读 raw.githubusercontent.com/.../data/muse_usage.json
  -> 桌面小组件
```

为什么要中转：Muse 没有公开的额度查询 API，Scriptable 也登不进 Muse 账号直接读额度，只能由本机这台 Muse 自己查完再推出来。JSON 里只有套餐、已用百分比、重置时间、额外 tokens 余量，没有账号、没有密钥。

## 文件

- `scriptable-widget.js` — 挂件脚本，粘贴进 Scriptable 就能用
- `scripts/update_muse_usage.py` — 本机 updater，解析 `subscription-status status`
- `data/muse_usage.json` — 当前实测数据（见下）

## 当前实测（2026-11-09 14:43）

- 套餐：Free（无订阅）
- 本周已用：**100%**
- 重置：**11-13（周五）17:03**
- 额外 tokens：已用 0%，还剩 30B tokens left

也就是说本周免费额度已经用完，要到周五 17:03 才重置，但额外 tokens 还有 30B，可以继续用。

## 手机上安装

1. App Store 装 Scriptable
2. 新建脚本，粘贴 `scriptable-widget.js` 全文，命名 `Muse 用量`
3. `DATA_URL` 改成你自己的 raw 地址：
   `https://raw.githubusercontent.com/xiadasy/muse-usage-widget/main/data/muse_usage.json`
4. 长按桌面 → + → Scriptable → 选这个脚本，中号最好看
5. 点挂件会在 Scriptable 里重新跑一次脚本（手动刷新）

## 自动更新

- 挂件自己每 15 分钟请 iOS 刷新一次，具体时间 iOS 说了算，不是实时的
- 数据端需要一个定时任务每 30 分钟跑一次 updater 并 push：
  `python3 scripts/update_muse_usage.py --out data/muse_usage.json`
- 离线时挂件显示上次缓存的数据，并标“缓存”

## JSON 格式

```json
{
  "updated_at": "2026-11-09T14:43:57+08:00",
  "source": "subscription-status",
  "plan": "Free",
  "percent_used": 100,
  "resets_at": "2026-11-13T17:03:00+08:00",
  "resets_at_text": "11-13 17:03",
  "additional_tokens": {
    "percent_used": 0,
    "left_label": "30B tokens left"
  }
}
```

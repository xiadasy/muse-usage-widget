#!/usr/bin/env python3
"""Muse 用量 -> data/muse_usage.json

用法（本机 Muse VM 上）：
    python3 scripts/update_muse_usage.py
    python3 scripts/update_muse_usage.py --out data/muse_usage.json

只解析 `subscription-status status` 的纯文本输出，不碰任何 token、
不碰登录态。输出只含：套餐、已用百分比、重置时间、额外 tokens
余量、更新时间——没有账号、没有密钥，可以放心放公开 raw。
"""
import argparse
import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

# Nov 13 at 5:03 PM CST 这种英文时间 -> ISO。年份取当年，若已过则 +1 年。
MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def parse_status(text: str) -> dict:
    plan = "Free"
    if "does not have a subscription" in text:
        plan = "Free"
    else:
        m = re.search(r"(Power|Maximum|Free)[^\n]*", text)
        if m:
            plan = m.group(1)

    used = re.search(r"Usage:\s*(\d+(?:\.\d+)?)%", text)
    percent_used = float(used.group(1)) if used else 0.0
    if percent_used.is_integer():
        percent_used = int(percent_used)

    reset_iso = None
    reset_text = None
    m = re.search(
        r"[Rr]esets?\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)",
        text)
    if m:
        mon, day, hh, mm, ampm = (MONTHS[m.group(1)], int(m.group(2)),
                                  int(m.group(3)), int(m.group(4)), m.group(5))
        if ampm == "PM" and hh != 12:
            hh += 12
        if ampm == "AM" and hh == 12:
            hh = 0
        now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
        year = now.year
        reset = datetime.datetime(year, mon, day, hh, mm,
                                  tzinfo=datetime.timezone(datetime.timedelta(hours=8)))
        if reset < now:
            reset = reset.replace(year=year + 1)
        reset_iso = reset.isoformat()
        reset_text = reset.strftime("%m-%d %H:%M")

    extra_used = 0
    extra_left = None
    m = re.search(r"Additional tokens:\s*(\d+(?:\.\d+)?)% used \(([^)]+)\)", text)
    if m:
        extra_used = float(m.group(1))
        if extra_used.is_integer():
            extra_used = int(extra_used)
        extra_left = m.group(2).strip()  # e.g. "30B tokens left"

    return {
        "plan": plan,
        "percent_used": percent_used,
        "resets_at": reset_iso,
        "resets_at_text": reset_text,
        "additional_tokens": {
            "percent_used": extra_used,
            "left_label": extra_left,
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/muse_usage.json")
    args = ap.parse_args()

    try:
        r = subprocess.run(["subscription-status", "status"],
                           capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        print("subscription-status not found", file=sys.stderr)
        return 1
    if r.returncode != 0:
        print(r.stdout, file=sys.stderr)
        print(r.stderr, file=sys.stderr)
        return 1

    data = parse_status(r.stdout)
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    out = {
        "updated_at": now.replace(microsecond=0).isoformat(),
        "source": "subscription-status",
        **data,
    }
    p = Path(args.out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

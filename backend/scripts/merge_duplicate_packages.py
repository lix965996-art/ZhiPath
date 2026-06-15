"""一次性清理: 合并同 (session_id, topic) 的重复资源包.

策略:
- 按 (session_id, topic) 分组
- 保留 updated_at 最新的一个 (作为主包)
- 其余包的资源回填主包空缺 (主包某类资源空 → 用次新包补)
- regeneration_count = 组内包数量
- 删除被合并的旧文件

用法:
    cd LearnFlow/backend
    .venv/Scripts/python.exe scripts/merge_duplicate_packages.py          # 干跑 (只打印)
    .venv/Scripts/python.exe scripts/merge_duplicate_packages.py --apply  # 真执行
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "resource_packages"

RESOURCE_KEYS = [
    "micro_lecture", "quiz", "exam", "flashcards",
    "mindmap", "code_lab", "mermaid", "case_study",
]


def is_empty_resource(key: str, value) -> bool:
    if value is None:
        return True
    if isinstance(value, dict):
        if not value:
            return True
        if key == "quiz":
            return not (value.get("data") or {})
        if key == "mindmap":
            return not (value.get("nodes") or [])
        if key == "flashcards":
            return not (value.get("cards") or [])
        if key == "code_lab":
            return not (value.get("snippets") or [])
        if key == "mermaid":
            return not value.get("mermaid_code")
    return False


def main() -> None:
    apply = "--apply" in sys.argv
    # 按 topic 全局分组 (资源包 = 主题资产, 跨 session 合并)
    groups: dict[str, list[tuple[Path, dict]]] = defaultdict(list)

    for path in sorted(DATA_DIR.glob("pkg_*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"skip corrupted: {path.name}")
            continue
        if not isinstance(data, dict):
            continue
        groups[str(data.get("topic", "")).strip()].append((path, data))

    merged = 0
    removed = 0
    for topic, items in groups.items():
        if len(items) < 2:
            continue
        # 最新在前
        items.sort(
            key=lambda t: str(t[1].get("updated_at") or t[1].get("created_at", "")),
            reverse=True,
        )
        primary_path, primary = items[0]
        rest = items[1:]
        print(f"\n[merge] topic={topic!r} → keep {primary['id']}, drop {len(rest)}")

        # 资源回填: 主包空缺的类型用次新补
        res = primary.setdefault("resources", {})
        for _, old in rest:
            old_res = old.get("resources", {}) or {}
            for k in RESOURCE_KEYS:
                if is_empty_resource(k, res.get(k)) and not is_empty_resource(k, old_res.get(k)):
                    res[k] = old_res[k]
                    print(f"   backfill {k} from {old['id']}")
        # created_at 取最早
        all_created = [str(d.get("created_at", "")) for _, d in items if d.get("created_at")]
        if all_created:
            primary["created_at"] = min(all_created)
        primary["regeneration_count"] = len(items)

        if apply:
            primary_path.write_text(
                json.dumps(primary, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            for p, _ in rest:
                p.unlink()
                removed += 1
        merged += 1

    print(f"\n{'APPLIED' if apply else 'DRY RUN'} · merged {merged} groups, removed {removed} files")
    if not apply and merged:
        print("re-run with --apply to execute")


if __name__ == "__main__":
    main()

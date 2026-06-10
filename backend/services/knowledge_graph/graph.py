"""知识图谱：知识点 + 前后置依赖（DAG）+ 拓扑排序学习路径。

是真正回答「先学什么再学什么」的引擎，配合 BKT 掌握度可以做：
- 推荐"该学下一个 KC 时，前置必须 mastery ≥ 阈值"
- 检测"先修不足"：暴露薄弱前置
- 拓扑排序：把图压成最小学习序列

不依赖 networkx 第三方包 —— 自己实现 O(V+E) 拓扑排序，免装依赖。
"""
from __future__ import annotations

import json
import logging
import re
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "kg"


class KnowledgeGraph:
    """有向图：节点 = KC，边 = "A 是 B 的先修"。每个 session 一个图。"""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    async def get(self, session_id: str) -> dict[str, Any]:
        return self._read(session_id)

    async def upsert_nodes(
        self,
        session_id: str,
        nodes: list[dict[str, Any]],
    ) -> dict[str, Any]:
        graph = self._read(session_id)
        by_id = {n["id"]: n for n in graph["nodes"]}
        for n in nodes:
            nid = _slug(n.get("id") or n.get("label") or "")
            if not nid:
                continue
            existing = by_id.get(nid, {})
            by_id[nid] = {
                "id": nid,
                "label": n.get("label", existing.get("label", nid)),
                "category": n.get("category", existing.get("category", "general")),
                "summary": n.get("summary", existing.get("summary", "")),
                "difficulty": float(n.get("difficulty", existing.get("difficulty", 0.5))),
                "tags": list(set([*existing.get("tags", []), *n.get("tags", [])])),
            }
        graph["nodes"] = list(by_id.values())
        graph["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write(session_id, graph)
        return graph

    async def add_edges(
        self,
        session_id: str,
        edges: list[dict[str, Any]],
    ) -> dict[str, Any]:
        graph = self._read(session_id)
        existing_keys = {(e["source"], e["target"]) for e in graph["edges"]}
        node_ids = {n["id"] for n in graph["nodes"]}

        new_edges = []
        for e in edges:
            src = _slug(e.get("source") or "")
            tgt = _slug(e.get("target") or "")
            if not src or not tgt or src == tgt:
                continue
            # 自动新增缺失节点
            for nid in (src, tgt):
                if nid not in node_ids:
                    graph["nodes"].append({
                        "id": nid,
                        "label": nid.replace("_", " "),
                        "category": "auto",
                        "summary": "",
                        "difficulty": 0.5,
                        "tags": [],
                    })
                    node_ids.add(nid)
            key = (src, tgt)
            if key in existing_keys:
                continue
            existing_keys.add(key)
            new_edges.append({
                "source": src,
                "target": tgt,
                "weight": float(e.get("weight", 1.0)),
                "relation": e.get("relation", "prerequisite"),
            })

        # 防环检测：尝试加入新边后跑拓扑排序，发现环就回滚
        combined = graph["edges"] + new_edges
        if not _is_dag(graph["nodes"], combined):
            logger.warning("KG: cycle detected, dropping new edges")
            return graph
        graph["edges"] = combined
        graph["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write(session_id, graph)
        return graph

    async def suggest_next(
        self,
        session_id: str,
        mastery: dict[str, float],
        threshold: float = 0.6,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """根据当前 mastery 推荐下一步学什么：所有前置 ≥ threshold 且自身 < threshold 的 KC。"""
        graph = self._read(session_id)
        nodes_by_id = {n["id"]: n for n in graph["nodes"]}
        preds: dict[str, list[str]] = defaultdict(list)
        for e in graph["edges"]:
            preds[e["target"]].append(e["source"])

        ready: list[dict[str, Any]] = []
        for nid, node in nodes_by_id.items():
            cur = mastery.get(nid, 0.0)
            if cur >= threshold:
                continue
            pre_ids = preds.get(nid, [])
            if not all(mastery.get(p, 0.0) >= threshold for p in pre_ids):
                continue
            ready.append({
                "node": node,
                "current_mastery": cur,
                "prerequisites": pre_ids,
                "blocked": False,
            })
        ready.sort(key=lambda r: (r["current_mastery"], r["node"].get("difficulty", 0.5)))
        return ready[:limit]

    async def diagnose_gaps(
        self,
        session_id: str,
        target_node_id: str,
        mastery: dict[str, float],
        threshold: float = 0.6,
    ) -> dict[str, Any]:
        """诊断"想学某 KC 但前置不足"：返回需要补的最短链。"""
        graph = self._read(session_id)
        preds: dict[str, list[str]] = defaultdict(list)
        for e in graph["edges"]:
            preds[e["target"]].append(e["source"])

        missing: list[str] = []
        seen: set[str] = set()
        queue = deque([target_node_id])
        while queue:
            cur = queue.popleft()
            if cur in seen:
                continue
            seen.add(cur)
            for pre in preds.get(cur, []):
                if mastery.get(pre, 0.0) < threshold and pre not in missing:
                    missing.append(pre)
                queue.append(pre)
        return {
            "target": target_node_id,
            "missing_prerequisites": missing,
            "ready": not missing,
        }

    async def topo_sort(self, session_id: str) -> list[str]:
        graph = self._read(session_id)
        return _topo_sort(graph["nodes"], graph["edges"])

    @staticmethod
    def _safe_id(session_id: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "", session_id) or "default"

    def _path(self, session_id: str) -> Path:
        return DATA_DIR / f"{self._safe_id(session_id)}.json"

    def _read(self, session_id: str) -> dict[str, Any]:
        p = self._path(session_id)
        if not p.exists():
            return {"nodes": [], "edges": [], "updated_at": None}
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"nodes": [], "edges": [], "updated_at": None}
        if not isinstance(data, dict):
            return {"nodes": [], "edges": [], "updated_at": None}
        data.setdefault("nodes", [])
        data.setdefault("edges", [])
        return data

    def _write(self, session_id: str, data: dict[str, Any]) -> None:
        self._path(session_id).write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def _slug(label: str) -> str:
    raw = (label or "").strip().lower()
    return re.sub(r"[^a-z0-9一-鿿]+", "_", raw)[:64].strip("_") or ""


def _topo_sort(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[str]:
    indeg = {n["id"]: 0 for n in nodes}
    succ: dict[str, list[str]] = defaultdict(list)
    for e in edges:
        if e["target"] in indeg and e["source"] in indeg:
            indeg[e["target"]] += 1
            succ[e["source"]].append(e["target"])
    queue = deque([nid for nid, d in indeg.items() if d == 0])
    order: list[str] = []
    while queue:
        cur = queue.popleft()
        order.append(cur)
        for nxt in succ[cur]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)
    return order


def _is_dag(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> bool:
    return len(_topo_sort(nodes, edges)) == len(nodes)

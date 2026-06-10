"""A/B Prompt 实验框架：
- 同一个智能体（如 ChatCapability）可注册多个 prompt 变体
- session_id 哈希到桶，保证同一学生看到稳定的变体（sticky bucketing）
- 每次调用记录 variant + 耗时；事后可对比

设计目标：体现"工程化迭代提示词"的能力，而不是写死一个 prompt。
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "experiments"


@dataclass
class PromptVariant:
    variant_id: str
    label: str
    prompt: str
    weight: float = 1.0
    notes: str = ""


@dataclass
class Experiment:
    name: str
    description: str
    variants: list[PromptVariant] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "variants": [
                {
                    "variant_id": v.variant_id,
                    "label": v.label,
                    "weight": v.weight,
                    "notes": v.notes,
                    "prompt_preview": v.prompt[:80],
                }
                for v in self.variants
            ],
        }


class ExperimentRegistry:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._exps: dict[str, Experiment] = {}
        self._init_defaults()

    def _init_defaults(self) -> None:
        # 自带一个 chat 系统 prompt 的 A/B 示例
        self.register(Experiment(
            name="chat_system_prompt",
            description="比较两种导师人设：结构化 vs 苏格拉底式追问",
            variants=[
                PromptVariant(
                    variant_id="structured",
                    label="结构化（默认）",
                    prompt=(
                        "你是 ZhiPath 的智能导学模块。请按"
                        "结论摘要 → 拆解思路 → 可执行方案 → 风险与校验 的结构作答。"
                    ),
                    weight=0.5,
                    notes="2026-A 默认版本",
                ),
                PromptVariant(
                    variant_id="socratic",
                    label="苏格拉底式",
                    prompt=(
                        "你是 ZhiPath 的智能导学模块。优先用 2-3 个递进问题"
                        "引导学生自己想清楚，再给最小可执行答案。"
                    ),
                    weight=0.5,
                    notes="2026-B 实验版本",
                ),
            ],
        ))

    def register(self, exp: Experiment) -> None:
        self._exps[exp.name] = exp

    def list_experiments(self) -> list[dict[str, Any]]:
        return [exp.to_dict() for exp in self._exps.values()]

    def pick_variant(
        self,
        exp_name: str,
        session_id: str,
        override_variant: str | None = None,
    ) -> PromptVariant | None:
        exp = self._exps.get(exp_name)
        if not exp or not exp.variants:
            return None
        if override_variant:
            for v in exp.variants:
                if v.variant_id == override_variant:
                    return v
        # sticky bucketing：md5(session_id + exp_name) → 选 variant
        h = hashlib.md5(f"{session_id}|{exp_name}".encode("utf-8")).hexdigest()
        bucket = int(h[:8], 16) / 0xFFFFFFFF  # 0..1
        cumulative = 0.0
        total_weight = sum(v.weight for v in exp.variants) or 1.0
        for v in exp.variants:
            cumulative += v.weight / total_weight
            if bucket <= cumulative:
                return v
        return exp.variants[-1]

    def log_observation(
        self,
        exp_name: str,
        variant_id: str,
        session_id: str,
        duration_ms: float,
        success: bool,
        metric_score: float | None = None,
    ) -> None:
        record = {
            "exp": exp_name,
            "variant": variant_id,
            "session_id": session_id,
            "duration_ms": duration_ms,
            "success": success,
            "metric_score": metric_score,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        path = DATA_DIR / f"{_safe(exp_name)}.jsonl"
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def get_results(self, exp_name: str) -> dict[str, Any]:
        path = DATA_DIR / f"{_safe(exp_name)}.jsonl"
        if not path.exists():
            return {"exp": exp_name, "records": [], "summary": {}}
        records: list[dict[str, Any]] = []
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

        agg: dict[str, dict[str, Any]] = {}
        for r in records:
            v = r.get("variant", "?")
            bucket = agg.setdefault(v, {
                "variant": v,
                "n": 0,
                "success": 0,
                "duration_sum": 0.0,
                "score_sum": 0.0,
                "score_count": 0,
            })
            bucket["n"] += 1
            if r.get("success"):
                bucket["success"] += 1
            bucket["duration_sum"] += float(r.get("duration_ms", 0) or 0)
            if r.get("metric_score") is not None:
                bucket["score_sum"] += float(r["metric_score"])
                bucket["score_count"] += 1

        summary = []
        for v, b in agg.items():
            summary.append({
                "variant": v,
                "n": b["n"],
                "success_rate": round(b["success"] / max(1, b["n"]), 3),
                "avg_duration_ms": round(b["duration_sum"] / max(1, b["n"]), 1),
                "avg_metric_score": (
                    round(b["score_sum"] / b["score_count"], 3)
                    if b["score_count"]
                    else None
                ),
            })

        return {
            "exp": exp_name,
            "records": records[-30:],
            "summary": sorted(summary, key=lambda s: -(s["avg_metric_score"] or s["success_rate"])),
        }


def _safe(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", name)


_registry: ExperimentRegistry | None = None


def get_experiment_registry() -> ExperimentRegistry:
    global _registry
    if _registry is None:
        _registry = ExperimentRegistry()
    return _registry

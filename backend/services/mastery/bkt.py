"""BKT (Bayesian Knowledge Tracing) 经典实现 — Corbett & Anderson (1995)。

模型四参数（每个 Knowledge Component 一组）：
- p_init  : 学生在第一次接触前已掌握的先验概率 P(L_0)
- p_learn : 学生在一次练习后从未掌握跃迁到已掌握的概率 P(T)
- p_slip  : 已掌握但答错的概率 P(S)
- p_guess : 未掌握但猜对的概率 P(G)

更新公式（observation = correct/wrong → posterior P(L_t|obs) → 跃迁 → P(L_t+1)）。

在 ZhiPath 中的作用：
- 每次 Quiz 提交 / Auto-Tutor 自评都喂一组观测，更新每个 KC 掌握度。
- 前端"掌握度热力图"以 KC × 时间 渲染，让评委直接看到学习曲线。
- 资源生成优先针对 mastery < threshold 的 KC 出题（个性化推送）。
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "mastery"


@dataclass
class BKTParams:
    p_init: float = 0.3
    p_learn: float = 0.15
    p_slip: float = 0.1
    p_guess: float = 0.2

    def clamp(self) -> "BKTParams":
        return BKTParams(
            p_init=_c(self.p_init),
            p_learn=_c(self.p_learn),
            p_slip=_c(self.p_slip, hi=0.3),
            p_guess=_c(self.p_guess, hi=0.5),
        )


@dataclass
class KnowledgeComponent:
    kc_id: str
    label: str
    mastery: float = 0.3
    attempts: int = 0
    correct: int = 0
    params: BKTParams = field(default_factory=BKTParams)
    history: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kc_id": self.kc_id,
            "label": self.label,
            "mastery": round(self.mastery, 4),
            "attempts": self.attempts,
            "correct": self.correct,
            "accuracy": round(self.correct / max(1, self.attempts), 3),
            "params": {
                "p_init": self.params.p_init,
                "p_learn": self.params.p_learn,
                "p_slip": self.params.p_slip,
                "p_guess": self.params.p_guess,
            },
            "history": list(self.history[-50:]),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "KnowledgeComponent":
        p = data.get("params", {}) or {}
        return cls(
            kc_id=str(data.get("kc_id", "")),
            label=str(data.get("label", "")),
            mastery=float(data.get("mastery", 0.3)),
            attempts=int(data.get("attempts", 0)),
            correct=int(data.get("correct", 0)),
            params=BKTParams(
                p_init=float(p.get("p_init", 0.3)),
                p_learn=float(p.get("p_learn", 0.15)),
                p_slip=float(p.get("p_slip", 0.1)),
                p_guess=float(p.get("p_guess", 0.2)),
            ),
            history=list(data.get("history", [])),
        )


class BKTTracker:
    @staticmethod
    def update(kc: KnowledgeComponent, correct: bool) -> KnowledgeComponent:
        p = kc.params.clamp()
        prior = kc.mastery if kc.attempts > 0 else p.p_init

        if correct:
            num = prior * (1 - p.p_slip)
            den = num + (1 - prior) * p.p_guess
        else:
            num = prior * p.p_slip
            den = num + (1 - prior) * (1 - p.p_guess)
        posterior = num / den if den > 0 else prior

        new_mastery = posterior + (1 - posterior) * p.p_learn
        kc.mastery = max(0.0, min(1.0, new_mastery))
        kc.attempts += 1
        if correct:
            kc.correct += 1
        kc.history.append({
            "ts": datetime.now(timezone.utc).isoformat(),
            "correct": bool(correct),
            "mastery_after": round(kc.mastery, 4),
        })
        return kc


class MasteryStore:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    async def get_mastery(self, session_id: str) -> dict[str, Any]:
        raw = self._read(session_id)
        kcs = [KnowledgeComponent.from_dict(d).to_dict() for d in raw.get("kcs", [])]
        kcs.sort(key=lambda k: k["mastery"])
        return {
            "session_id": session_id,
            "kcs": kcs,
            "summary": _summarize(kcs),
            "updated_at": raw.get("updated_at"),
        }

    async def upsert_kcs(self, session_id: str, labels: list[str]) -> dict[str, Any]:
        raw = self._read(session_id)
        existing = {d.get("kc_id"): d for d in raw.get("kcs", []) if d.get("kc_id")}
        for label in labels:
            kc_id = _slugify(label)
            if kc_id in existing:
                continue
            existing[kc_id] = KnowledgeComponent(kc_id=kc_id, label=label).to_dict()
        raw["kcs"] = list(existing.values())
        raw["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write(session_id, raw)
        return await self.get_mastery(session_id)

    async def update_observations(
        self,
        session_id: str,
        observations: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """observations: [{label: 'XX', correct: bool}, ...]"""
        raw = self._read(session_id)
        kcs = {d.get("kc_id"): KnowledgeComponent.from_dict(d) for d in raw.get("kcs", []) if d.get("kc_id")}

        for obs in observations:
            label = str(obs.get("label", "")).strip()
            if not label:
                continue
            kc_id = _slugify(label)
            kc = kcs.get(kc_id)
            if kc is None:
                kc = KnowledgeComponent(kc_id=kc_id, label=label)
                kcs[kc_id] = kc
            BKTTracker.update(kc, bool(obs.get("correct", False)))

        raw["kcs"] = [kc.to_dict() for kc in kcs.values()]
        raw["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write(session_id, raw)
        return await self.get_mastery(session_id)

    async def get_focus_kcs(
        self,
        session_id: str,
        threshold: float = 0.6,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        data = await self.get_mastery(session_id)
        weak = [kc for kc in data["kcs"] if kc["mastery"] < threshold]
        return weak[:limit]

    @staticmethod
    def _safe_id(session_id: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "", session_id) or "default"

    def _path(self, session_id: str) -> Path:
        return DATA_DIR / f"{self._safe_id(session_id)}.json"

    def _read(self, session_id: str) -> dict[str, Any]:
        p = self._path(session_id)
        if not p.exists():
            return {"kcs": [], "updated_at": None}
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"kcs": [], "updated_at": None}
        return data if isinstance(data, dict) else {"kcs": [], "updated_at": None}

    def _write(self, session_id: str, data: dict[str, Any]) -> None:
        self._path(session_id).write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def _summarize(kcs: list[dict[str, Any]]) -> dict[str, Any]:
    if not kcs:
        return {"count": 0, "avg_mastery": 0, "weak": 0, "mature": 0}
    avg = sum(k["mastery"] for k in kcs) / len(kcs)
    return {
        "count": len(kcs),
        "avg_mastery": round(avg, 3),
        "weak": sum(1 for k in kcs if k["mastery"] < 0.5),
        "mature": sum(1 for k in kcs if k["mastery"] >= 0.85),
    }


def _slugify(label: str) -> str:
    raw = label.strip().lower()
    return re.sub(r"[^a-z0-9一-鿿]+", "_", raw)[:64].strip("_") or "kc"


def _c(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))

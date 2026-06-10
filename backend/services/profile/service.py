from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "profiles"


class LearningProfileService:
    """规则抽取画像并落盘 JSON；topics 等为会话内累积列表，语义上不等于「本轮唯一学科」。"""

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    async def get_profile(self, session_id: str) -> dict[str, Any]:
        profile = self._read_profile(session_id)
        if profile is not None:
            return profile
        profile = self._empty_profile(session_id)
        self._write_profile(session_id, profile)
        return profile

    async def save_profile(self, session_id: str, profile: dict[str, Any]) -> None:
        profile["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_profile(session_id, profile)

    async def update_weak_points_from_quiz(
        self,
        session_id: str,
        wrong_topics: list[str],
        accuracy: float,
    ) -> dict[str, Any]:
        """Update profile weak_points based on quiz feedback."""
        profile = await self.get_profile(session_id)
        profile["weak_points"] = self._append_unique(
            profile.get("weak_points", []),
            wrong_topics,
            limit=10,
        )
        profile["quiz_accuracy"] = accuracy
        profile["last_quiz_time"] = datetime.now(timezone.utc).isoformat()
        await self.save_profile(session_id, profile)
        return profile

    async def update_from_user_message(
        self,
        session_id: str,
        message: str,
        capability: str = "chat",
    ) -> dict[str, Any]:
        profile = await self.get_profile(session_id)
        text = message.strip()
        if not text:
            return profile

        turn = int(profile.get("turn_count", 0)) + 1
        profile["turn_count"] = turn
        profile["last_capability"] = capability

        # 画像维度抽取 + 证据链记录：每个新增维度记下来自哪一轮的哪句原话。
        evidence_log: list[dict[str, Any]] = list(profile.get("evidence_log", []))
        evidence_index: dict[str, list[dict[str, Any]]] = dict(
            profile.get("evidence_index", {})
        )

        def add_evidence(dimension: str, value: str) -> None:
            entry = {
                "dimension": dimension,
                "value": value,
                "turn": turn,
                "snippet": text[:160],
                "capability": capability,
            }
            evidence_log.append(entry)
            bucket = evidence_index.setdefault(value, [])
            bucket.append({"dimension": dimension, "turn": turn, "snippet": text[:160]})

        new_intents = self._infer_intents(text, capability)
        existing_intents = list(profile.get("recent_intents", []))
        profile["recent_intents"] = self._append_unique(existing_intents, new_intents, limit=8)
        for intent in new_intents:
            if intent not in existing_intents:
                add_evidence("recent_intents", intent)

        new_topics = self._extract_topics(text, dynamic_vocab=self._load_dynamic_topics())
        existing_topics = list(profile.get("topics", []))
        profile["topics"] = self._append_unique(existing_topics, new_topics, limit=12)
        for t in new_topics:
            if t not in existing_topics:
                add_evidence("topics", t)

        new_weak = self._extract_weak_points(text)
        existing_weak = list(profile.get("weak_points", []))
        profile["weak_points"] = self._append_unique(existing_weak, new_weak, limit=10)
        for w in new_weak:
            if w not in existing_weak:
                add_evidence("weak_points", w)

        new_pref = self._extract_preferences(text)
        existing_pref = list(profile.get("preferences", []))
        profile["preferences"] = self._append_unique(existing_pref, new_pref, limit=10)
        for p in new_pref:
            if p not in existing_pref:
                add_evidence("preferences", p)

        new_constraints = self._extract_constraints(text)
        existing_constraints = list(profile.get("constraints", []))
        profile["constraints"] = self._append_unique(
            existing_constraints, new_constraints, limit=8,
        )
        for c in new_constraints:
            if c not in existing_constraints:
                add_evidence("constraints", c)

        goal = self._extract_goal(text)
        if goal and goal != profile.get("learning_goal"):
            profile["learning_goal"] = goal
            add_evidence("learning_goal", goal)

        level = self._infer_level(text)
        if level and level != profile.get("level"):
            profile["level"] = level
            add_evidence("level", level)

        # === 408 考研场景抽取 ===
        exam_updates = self._extract_exam_context(text)
        if exam_updates:
            current = dict(profile.get("exam_context") or {})
            for k, v in exam_updates.items():
                if not v:
                    continue
                # weak_subjects 累积去重；其他字段覆盖
                if k == "weak_subjects":
                    merged = list(current.get(k, []))
                    for s in v:
                        if s not in merged:
                            merged.append(s)
                            add_evidence("exam_weak_subject", s)
                    current[k] = merged[:4]
                else:
                    if current.get(k) != v:
                        current[k] = v
                        add_evidence(f"exam_{k}", str(v))
            # 兜底：检测到 408 相关线索时自动写入默认考试日 (用户没说就用 2026-12-20)
            if current and not current.get("exam_date"):
                current["exam_date"] = "2026-12-20"
                current.setdefault("exam_code", "408")
            profile["exam_context"] = current

        # 控制大小：只保留最近 60 条证据
        profile["evidence_log"] = evidence_log[-60:]
        profile["evidence_index"] = evidence_index
        # 维度覆盖率（用于雷达/进度展示，"对话式画像不少于 6 维度"指标）
        profile["dimension_coverage"] = self._compute_dimension_coverage(profile)

        await self.save_profile(session_id, profile)
        return profile

    @staticmethod
    def _compute_dimension_coverage(profile: dict[str, Any]) -> dict[str, Any]:
        """返回 6+ 维度的覆盖率快照，用于前端"画像维度进度环"。"""
        def filled(value: Any) -> bool:
            if isinstance(value, list):
                return bool(value)
            return bool(str(value).strip()) if value is not None else False

        dimensions = {
            "learning_goal": filled(profile.get("learning_goal")),
            "level": filled(profile.get("level")),
            "topics": filled(profile.get("topics")),
            "weak_points": filled(profile.get("weak_points")),
            "preferences": filled(profile.get("preferences")),
            "constraints": filled(profile.get("constraints")),
            "recent_intents": filled(profile.get("recent_intents")),
            # 第 8 维度：考试场景上下文（408 dogfood 驱动）
            "exam_context": bool(profile.get("exam_context")),
        }
        score = sum(1 for v in dimensions.values() if v)
        total = len(dimensions)
        return {
            "score": score,
            "total": total,
            "ratio": round(score / total, 3) if total else 0.0,
            "dimensions": dimensions,
        }

    async def build_context(self, session_id: str, max_chars: int = 2200) -> str:
        profile = await self.get_profile(session_id)

        def join_list(key: str) -> str:
            val = profile.get(key)
            if not val or not isinstance(val, list):
                return "暂无"
            return ", ".join(str(v) for v in val if v) or "暂无"

        lines = [
            "## 学习者画像",
            f"- 学习目标：{profile.get('learning_goal') or '尚未明确'}",
            f"- 当前水平：{profile.get('level') or '未知'}",
            f"- 关注主题：{join_list('topics')}",
            f"- 薄弱点：{join_list('weak_points')}",
            f"- 学习偏好：{join_list('preferences')}",
            f"- 时间/任务约束：{join_list('constraints')}",
            f"- 最近意图：{join_list('recent_intents')}",
        ]

        # 408 考研上下文 — 命中后让 LLM 切换到"考研伴学"语气：
        # 用真题口径、给倒计时焦虑兜底、数学薄弱时用类比降难度
        exam = profile.get("exam_context") or {}
        if exam:
            lines.append("\n## 408 考研场景")
            if exam.get("exam_code"):
                lines.append(f"- 考试代码：{exam.get('exam_code')}（计算机学科专业基础综合）")
            if exam.get("target_school"):
                lines.append(f"- 目标层次：{exam.get('target_school')}")
            if exam.get("exam_stage"):
                lines.append(f"- 复习阶段：{exam.get('exam_stage')}")
            if exam.get("weak_subjects"):
                lines.append(f"- 弱项学科：{', '.join(exam.get('weak_subjects') or [])}")
            if exam.get("daily_hours"):
                lines.append(f"- 每日可学：{exam.get('daily_hours')} 小时")
            if exam.get("exam_date"):
                lines.append(f"- 考试日期：{exam.get('exam_date')}")
            lines.append(
                "- 输出要求：题目用 408 真题口径；数学/英语薄弱时优先类比与具象化；"
                "讲解结束附 1 条「下一步建议」对齐当前复习阶段。"
            )
        return "\n".join(lines)[:max_chars]

    @staticmethod
    def _empty_profile(session_id: str) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        return {
            "session_id": session_id,
            "learning_goal": "",
            "level": "",
            "topics": [],
            "weak_points": [],
            "preferences": [],
            "constraints": [],
            "recent_intents": [],
            "turn_count": 0,
            "last_capability": "",
            # 画像证据链（"对话式画像随学随新"的可视化数据源）
            "evidence_log": [],
            "evidence_index": {},
            "dimension_coverage": {
                "score": 0,
                "total": 7,
                "ratio": 0.0,
                "dimensions": {},
            },
            # 考研 408 场景上下文（dogfood：作者本人就在考研）
            # 触发时机：用户提到 "考研 / 408 / 数据结构 / 计算机组成 / 操作系统 / 计算机网络 / 院校层次"
            "exam_context": {},
            "created_at": now,
            "updated_at": now,
        }

    @staticmethod
    def _append_unique(existing: list[str], new_items: list[str], limit: int) -> list[str]:
        result = [str(item).strip() for item in existing if str(item).strip()]
        for item in new_items:
            cleaned = item.strip()
            if cleaned and cleaned not in result:
                result.append(cleaned)
        return result[-limit:]

    @staticmethod
    def _infer_intents(text: str, capability: str) -> list[str]:
        intents: list[str] = []
        if capability == "goal" or any(word in text for word in ["目标", "计划", "规划", "入门"]):
            intents.append("目标诊断")
        if capability == "learning" or any(word in text for word in ["路径", "复习", "练习", "安排"]):
            intents.append("学习路径规划")
        if capability == "resource_gen" or any(word in text for word in ["讲义", "题", "案例", "卡片", "知识图谱"]):
            intents.append("资源生成")
        if any(word in text for word in ["不会", "不懂", "分不清", "总是错", "薄弱", "弱"]):
            intents.append("薄弱点澄清")
        return intents or ["普通问答"]

    # 种子主题（仅冷启动用，不再硬编码全集）
    _SEED_TOPICS = [
        "机器学习",
        "深度学习",
        "监督学习",
        "无监督学习",
        "动态规划",
        "Python",
        "算法",
        "线性代数",
        "概率统计",
        "高等数学",
        "数学",
        "英语",
    ]

    @classmethod
    def _extract_topics(cls, text: str, dynamic_vocab: list[str] | None = None) -> list[str]:
        """词典关键词命中 + 正则启发式。

        与原版区别：dynamic_vocab 由 _load_dynamic_topics() 提供，每次调用都会从 KG / 历史资源包
        重新扫描，实现"知识点自动发现"——解决 IMPROVEMENT_PLAN.md 提到的"用户上传新领域文档时
        无法识别"的问题，且比 Topic Graph 方案更轻量（不需要额外 LLM 调用）。
        """
        vocab = list(cls._SEED_TOPICS)
        if dynamic_vocab:
            vocab.extend(dynamic_vocab)
        seen: set[str] = set()
        ordered_vocab: list[str] = []
        for v in vocab:
            v = (v or "").strip()
            if not v or v in seen:
                continue
            seen.add(v)
            ordered_vocab.append(v)
        topics = [t for t in ordered_vocab if t.lower() in text.lower()]
        for pattern in [r"学习([^，。！？\s]{2,18})", r"关于([^，。！？\s]{2,18})", r"掌握([^，。！？\s]{2,18})"]:
            topics.extend(match.strip() for match in re.findall(pattern, text))
        return topics[:6]

    def _load_dynamic_topics(self) -> list[str]:
        """从 KG 数据 + 资源包历史 动态扫描已知主题，作为词典扩展。"""
        topics: list[str] = []
        # KG 节点
        try:
            kg_dir = Path(__file__).resolve().parents[2] / "data" / "kg"
            if kg_dir.exists():
                for p in kg_dir.glob("*.json"):
                    try:
                        data = json.loads(p.read_text(encoding="utf-8"))
                        for n in data.get("nodes", []) or []:
                            label = str(n.get("label", "")).strip()
                            if label and 2 <= len(label) <= 24:
                                topics.append(label)
                    except json.JSONDecodeError:
                        continue
        except Exception:
            pass
        # 资源包 topic
        try:
            pkg_dir = Path(__file__).resolve().parents[2] / "data" / "resource_packages"
            if pkg_dir.exists():
                for p in pkg_dir.glob("pkg_*.json"):
                    try:
                        data = json.loads(p.read_text(encoding="utf-8"))
                        t = str(data.get("topic", "")).strip()
                        if t and 2 <= len(t) <= 24:
                            topics.append(t)
                    except json.JSONDecodeError:
                        continue
        except Exception:
            pass
        # 去重保序
        seen: set[str] = set()
        out: list[str] = []
        for t in topics:
            if t not in seen:
                seen.add(t)
                out.append(t)
        return out[:80]  # 上限避免词典过大

    @staticmethod
    def _extract_weak_points(text: str) -> list[str]:
        weak_points: list[str] = []
        for pattern in [
            r"分不清([^，。！？]{2,24})",
            r"不懂([^，。！？]{2,24})",
            r"不会([^，。！？]{2,24})",
            r"总是错([^，。！？]{2,24})",
            r"([^，。！？]{2,16})比较弱",
        ]:
            for item in re.findall(pattern, text):
                cleaned = item.strip().lstrip("但但是我觉得")
                if cleaned:
                    weak_points.append(cleaned)
        if "数学" in text and any(word in text for word in ["弱", "差", "薄弱"]):
            weak_points.append("数学基础薄弱")
        return weak_points[:5]

    @staticmethod
    def _extract_preferences(text: str) -> list[str]:
        preferences: list[str] = []
        if "案例" in text or "例子" in text:
            preferences.append("案例讲解")
        if "图" in text or "知识图谱" in text:
            preferences.append("图结构/知识图谱")
        if "题" in text or "练习" in text:
            preferences.append("练习驱动")
        if "简单" in text or "通俗" in text:
            preferences.append("通俗解释")
        if "项目" in text:
            preferences.append("项目驱动")
        return preferences

    @staticmethod
    def _extract_constraints(text: str) -> list[str]:
        constraints: list[str] = []
        for match in re.findall(r"(\d+\s*个?[天周月小时分钟])", text):
            constraints.append(match.replace(" ", ""))
        if "考试" in text:
            constraints.append("考试导向")
        if "项目" in text:
            constraints.append("项目导向")
        return constraints

    @staticmethod
    def _extract_goal(text: str) -> str:
        for pattern in [
            r"我想([^。！？\n]{4,60})",
            r"想学习([^。！？\n]{2,60})",
            r"想学([^。！？\n]{2,60})",
            r"目标是([^。！？\n]{4,60})",
            r"希望([^。！？\n]{4,60})",
        ]:
            match = re.search(pattern, text)
            if match:
                return match.group(0).strip()
        return ""

    # 408 四科关键词（命中即认为是弱项之一）
    _EXAM_SUBJECT_PATTERNS = {
        "数据结构": ["数据结构", "ds ", "二叉树", "图论", "排序", "查找", "栈队列"],
        "计算机组成原理": ["计算机组成", "组原", "组成原理", "cpu", "总线", "存储系统", "指令系统"],
        "操作系统": ["操作系统", "进程", "线程", "死锁", "虚拟内存", "页表"],
        "计算机网络": ["计算机网络", "tcp", "ip", "osi", "三次握手", "拥塞控制"],
    }

    _EXAM_STAGE_PATTERNS = {
        "零基础": ["零基础", "还没开始", "完全没看"],
        "基础": ["基础阶段", "基础课", "刚开始看", "看视频", "看基础"],
        "强化": ["强化阶段", "强化课", "在刷题", "做题中"],
        "冲刺": ["冲刺", "二刷", "三刷", "模拟卷", "做真题"],
    }

    _EXAM_TARGET_PATTERNS = {
        "985/强211": ["985", "强211", "顶尖院校", "清华", "北大", "浙大", "上交", "中科大"],
        "普通211/双非强校": ["211", "双非强校", "普通211"],
        "双非保底": ["双非", "保底", "求上岸"],
    }

    @classmethod
    def _extract_exam_context(cls, text: str) -> dict[str, Any]:
        """识别 408 考研场景信号。返回需要 merge 的字段字典。

        触发条件：文本里含 '考研' / '408' / '统考' 中任一关键词，否则不处理。
        """
        low = text.lower()
        if not any(k in text for k in ["考研", "408", "统考", "考408"]) and "408" not in low:
            return {}

        updates: dict[str, Any] = {"exam_code": "408"}

        # 弱项学科
        weak: list[str] = []
        for subject, patterns in cls._EXAM_SUBJECT_PATTERNS.items():
            for p in patterns:
                if p.lower() in low and any(w in text for w in ["弱", "差", "不会", "不懂", "薄弱", "卡", "搞不定"]):
                    weak.append(subject)
                    break
        if weak:
            updates["weak_subjects"] = weak

        # 阶段
        for stage, patterns in cls._EXAM_STAGE_PATTERNS.items():
            if any(p in text for p in patterns):
                updates["exam_stage"] = stage
                break

        # 目标层次
        for target, patterns in cls._EXAM_TARGET_PATTERNS.items():
            if any(p.lower() in low for p in patterns):
                updates["target_school"] = target
                break

        # 每日时长 ("每天X小时" / "一天学X小时" / "日均3h"等)
        m = re.search(r"(每天|一天|日均).{0,4}?(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|h)", text)
        if m:
            try:
                hrs = float(m.group(2))
                if 0 < hrs <= 16:
                    updates["daily_hours"] = hrs
            except ValueError:
                pass

        # 显式考试日期 ("2026年12月" 或 "26考研")
        m = re.search(r"(20\d{2})\s*年?\s*12\s*月", text)
        if m:
            updates["exam_date"] = f"{m.group(1)}-12-20"
        else:
            m = re.search(r"(\d{2})\s*考研", text)
            if m:
                yy = int(m.group(1))
                if 20 <= yy <= 99:
                    updates["exam_date"] = f"20{yy:02d}-12-20"

        return updates

    @staticmethod
    def _infer_level(text: str) -> str:
        if any(word in text for word in ["零基础", "新手", "刚开始", "入门"]):
            return "初学者"
        if any(word in text for word in ["有基础", "学过", "了解一点", "Python 基础", "Python基础"]):
            return "有一定基础"
        if any(word in text for word in ["进阶", "提高", "深入", "竞赛"]):
            return "进阶学习者"
        return ""

    def _path(self, session_id: str) -> Path:
        return DATA_DIR / f"{session_id}.json"

    def _read_profile(self, session_id: str) -> dict[str, Any] | None:
        path = self._path(session_id)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Skipping corrupted profile file: %s", path)
            return None

    def _write_profile(self, session_id: str, profile: dict[str, Any]) -> None:
        self._path(session_id).write_text(
            json.dumps(profile, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

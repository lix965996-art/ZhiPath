"""ExplainerCapability：动画讲解（Mermaid 分帧 + 旁白 + 讯飞 TTS 合成音频）。

赛题加分项「智能辅导」要求多模态答疑（文字 / 图解 / 短视频）。本能力把这三种串起来：
- 文字：流式输出讲解大纲
- 图解：渐进式 Mermaid，分 4-6 帧
- 音频：把全部旁白拼起来调讯飞 TTS 出 mp3，前端定时同步播

前端 ExplainerPlayer 组件按 segment 顺序：
  渲染 mermaid_partial → 高亮当前段 → 播该段对应音频片段（按 duration_ms 累计偏移）。
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from base.iflytek_factory import IFlytekTTS, iflytek_tts_available
from capabilities.base import CapabilityManifest
from capabilities.llm_capability import PromptedLLMCapability
from core.context import UnifiedContext
from core.stream_bus import StreamBus
from modules.resource_gen.agents.explainer import generate_explainer_with_llm

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """你是 ZhiPath 的"动画讲解"导师。
针对学生提的知识点，给出一段口语化、自然的总结，让学生看到动画讲解后能"还原讲师在说什么"。
要求：
- 中文 Markdown
- 200-400 字
- 先说"这一讲解决什么问题"，再说"主要分几步看"，最后给"一句话记忆点"
- 不要重复输出 Mermaid 源码（已在右侧播放器渲染）
"""


class ExplainerCapability(PromptedLLMCapability):
    manifest = CapabilityManifest(
        name="explainer",
        description="动画讲解：渐进 Mermaid + 旁白 + 讯飞 TTS 音频",
        stages=["explainer"],
        tools_used=["ExplainerAgent", "iFlytekTTS"],
    )
    system_prompt = SYSTEM_PROMPT
    stage_name = "explainer"
    route_task = "long_form"

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        llm = self._resolve_llm(stream)
        agent_results: dict[str, Any] = {}

        async with stream.stage("explainer"):
            self._emit_agent_message(
                stream,
                "Orchestrator",
                "ExplainerAgent",
                {"topic": context.user_message[:80]},
                label="动画讲解需求",
            )
            script = await self._invoke_agent(
                "ExplainerAgent",
                lambda **kw: generate_explainer_with_llm(llm, **kw),
                stream,
                topic=context.user_message,
                learner_profile=context.learner_profile or {},
                knowledge_context=context.knowledge_context or "",
            )

            if script and iflytek_tts_available():
                self._emit_agent_message(
                    stream,
                    "ExplainerAgent",
                    "iFlytekTTS",
                    {"segments": len(script.get("segments", []))},
                    label="拼旁白调 TTS",
                )
                stream.thinking("调用讯飞 TTS 合成讲解音频...")
                audio_url = await asyncio.to_thread(_synthesize_full_audio, script)
                if audio_url:
                    script["audio_url"] = audio_url
                    stream.thinking("讯飞 TTS 合成完成。")

            if script:
                agent_results["动画讲解脚本"] = {
                    "title": script.get("title"),
                    "segment_count": len(script.get("segments", [])),
                    "has_audio": bool(script.get("audio_url")),
                }
                # 把完整脚本通过 result 事件下发给前端 ExplainerPlayer 渲染
                stream.result(
                    json.dumps(script, ensure_ascii=False),
                    source="explainer",
                )

        await self._run_llm_with_agent_context(context, stream, agent_results)


def _synthesize_full_audio(script: dict[str, Any]) -> str | None:
    """把所有段旁白拼成长文本调一次 TTS，返回 mp3 URL。

    前端按 duration_ms 累计偏移找到每段对应音频位置（不切片，整段播）。
    """
    try:
        segments = script.get("segments") or []
        full_text = "\n\n".join(
            s.get("narration", "") for s in segments if s.get("narration")
        )
        if not full_text.strip():
            return None
        topic = (script.get("topic") or script.get("title") or "explainer")[:24]
        return IFlytekTTS().synthesize(full_text, filename_hint=f"explain_{topic}")
    except Exception as exc:
        logger.warning("Explainer TTS failed: %s", exc)
        return None

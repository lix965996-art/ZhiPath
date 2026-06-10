# ZhiPath · 基于大模型的个性化资源生成与学习多智能体系统

> 2026 中国软件杯 **A3 赛题** 参赛作品
>
> **多智能体协同 · 多模态资源生成 · 对话式画像 · 闭环学习评估**

---

## 一、亮点一览（评委 60 秒速览）

> 这些功能在同期参赛作品里**普遍缺席**，是 ZhiPath 的差异化护城河。

| 卖点                                           | 说明                                                                                                                        | 关键路径                                                                                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **🚀 Auto-Tutor 一键闭环**               | 单条指令跑完「目标诊断 → 资源生成 → 试卷封装 → 模拟自评 → 画像更新 → 路径重规划 → 闭环报告」7 阶段多智能体协作        | [backend/capabilities/auto_tutor.py](backend/capabilities/auto_tutor.py)、[frontend/components/visual/AutoTutorLoopVisual.tsx](frontend/components/visual/AutoTutorLoopVisual.tsx)                                             |
| **🧠 BKT 贝叶斯知识追踪**                | 经典 Corbett & Anderson (1995) 算法实现，每个 KC 维护 P(掌握) 概率，每次答题动态后验更新                                    | [backend/services/mastery/bkt.py](backend/services/mastery/bkt.py)、[frontend/components/dashboard/MasteryHeatmap.tsx](frontend/components/dashboard/MasteryHeatmap.tsx)                                                       |
| **♻ FSRS-4 间隔重复**                   | 论文级遗忘曲线调度（Ye et al. 2023），错题/闪卡自动入复习队列、按 D/S/R 三参数推算下次复习日期                              | [backend/services/srs/fsrs.py](backend/services/srs/fsrs.py)、[frontend/components/dashboard/ReviewCalendarView.tsx](frontend/components/dashboard/ReviewCalendarView.tsx)                                                     |
| **📊 学习仪表盘**                        | BKT 掌握度热力图 + FSRS 复习日历 + OTel Trace 甘特图 + 多模型路由表 一页讲完学情                                            | [frontend/app/dashboard/page.tsx](frontend/app/dashboard/page.tsx)                                                                                                                                                          |
| **🧩 Mermaid 实时图表**                  | flowchart / sequenceDiagram / stateDiagram-v2 / classDiagram / erDiagram / gantt 全类型，前端 mermaid.js 渲染，护栏拒绝注入 | [backend/modules/resource_gen/agents/mermaid_generator.py](backend/modules/resource_gen/agents/mermaid_generator.py)、[frontend/components/mermaid/MermaidDiagramCard.tsx](frontend/components/mermaid/MermaidDiagramCard.tsx) |
| **🎙 讯飞 TTS + 语音对话**               | 讯飞超拟人 TTS WebSocket 合成讲义音频；Web Speech API 浏览器内语音上行，对话式画像 100% 兑现                                | [backend/base/iflytek_factory.py](backend/base/iflytek_factory.py)、[frontend/components/voice/VoiceInputButton.tsx](frontend/components/voice/VoiceInputButton.tsx)                                                           |
| **🧪 代码实操沙箱**                      | CodeLabGenerator 输出可在浏览器内 Pyodide WASM 沙箱直接运行的 Python 片段（含正则安全护栏）                                 | [backend/modules/resource_gen/agents/code_lab_generator.py](backend/modules/resource_gen/agents/code_lab_generator.py)、[frontend/components/code_lab/CodeLabCard.tsx](frontend/components/code_lab/CodeLabCard.tsx)           |
| **🧭 多模型智能路由**                    | 6 类任务（chat/structured/long_form/reasoning/code/mermaid）按类型自动选模型，带 fallback 链                                | [backend/base/model_router.py](backend/base/model_router.py)                                                                                                                                                                |
| **🪪 画像证据链**                        | 7 维度画像每条都挂"第 N 轮你说过的原话"，前端 WebSocket 增量长出，对应"对话式画像随学随新"                                  | [backend/services/profile/service.py](backend/services/profile/service.py)、[frontend/components/profile/ProfileEvidencePanel.tsx](frontend/components/profile/ProfileEvidencePanel.tsx)                                       |
| **🔗 多智能体真实通信可视化**            | StreamBus 新增 `agent_message` 事件，把 Agent → Agent 的结构化数据流实时画到工作流面板                                   | [backend/core/stream_bus.py](backend/core/stream_bus.py)、[frontend/components/agent/AgentMessageFeed.tsx](frontend/components/agent/AgentMessageFeed.tsx)                                                                     |
| **🛡 防幻觉与引用追溯**                  | RAG 检索片段加 `[来源 #N]` 编号、相似度分；低置信度时前端高亮"请谨慎采用"；输入侧内容安全过滤                             | [backend/services/guardrail/](backend/services/guardrail/)                                                                                                                                                                  |
| **🔬 OTel 全链路追踪**                   | 内部 Span Tracer (兼容 OTel 语义)，每个 Agent / LLM / Tool 调用都有 span，前端甘特图可视化                                  | [backend/services/tracing/tracer.py](backend/services/tracing/tracer.py)、[frontend/components/dashboard/TraceTimelineView.tsx](frontend/components/dashboard/TraceTimelineView.tsx)                                           |
| **🗺 知识图谱 + 前后置依赖**             | LLM 抽 KG (KGGenerator)，networkx 风格 DAG 存储 + 循环防护，前端拓扑分层布局，根据 BKT 推"下一步学什么"                     | [backend/services/knowledge_graph/graph.py](backend/services/knowledge_graph/graph.py)、[frontend/components/kg/KnowledgeGraphView.tsx](frontend/components/kg/KnowledgeGraphView.tsx)                                         |
| **📄 PDF 学习周报**                      | 一键生成中文 PDF (reportlab)，含画像 + BKT + FSRS + Trace 多维度报告，可发家长/老师                                         | [backend/services/report/weekly_report.py](backend/services/report/weekly_report.py)                                                                                                                                        |
| **🧪 A/B Prompt 实验框架**               | 同 Agent 多 prompt 变体，sticky bucketing，自动聚合成功率/耗时/评分，工程化迭代                                             | [backend/services/experiments/registry.py](backend/services/experiments/registry.py)                                                                                                                                        |
| **👨‍🏫 教师班级聚合视图**              | 多 session 聚合：班级平均掌握度 + 薄弱 KC TOP + 学生榜单，体现教师场景                                                      | [backend/api/routers/classroom.py](backend/api/routers/classroom.py)、[frontend/app/classroom/page.tsx](frontend/app/classroom/page.tsx)                                                                                       |
| **🍅 番茄钟 + 时长统计**                 | 25/5/15 三模式番茄钟，自动落日学习时长，前端 SVG 进度环                                                                     | [frontend/components/pomodoro/PomodoroTimer.tsx](frontend/components/pomodoro/PomodoroTimer.tsx)                                                                                                                            |
| **📋 xAPI 兼容 LRS**                     | 行为按 ADL xAPI 1.0.3 Statement (Actor-Verb-Object) 写入 JSONL，兼容 Tin Can API 生态                                       | [backend/services/xapi/lrs.py](backend/services/xapi/lrs.py)                                                                                                                                                                |
| **🤖 DKT 深度知识追踪**                  | Piech et al. 2015 论文级 mini-GRU 实现（纯 numpy + ES 训练），预测下题正确概率，是 BKT 的升级版                             | [backend/services/mastery/dkt.py](backend/services/mastery/dkt.py)                                                                                                                                                          |
| **🕸 GraphRAG (KG 增强检索)**            | 命中 chunk → KG 1-hop 邻居扩展 → 衰减权重重排，让 RAG 感知"知识依赖"                                                      | [backend/services/rag/graph_rag.py](backend/services/rag/graph_rag.py)                                                                                                                                                      |
| **⚔ 多智能体辩论 (Multi-Agent Debate)** | 正方/反方/裁判三角色 2 轮辩论后给出最终学习建议（Du et al. ICML 2024）                                                      | [backend/capabilities/debate.py](backend/capabilities/debate.py)                                                                                                                                                            |
| **👍 RLHF 学生反馈环**                   | 每条助手消息可 👍/👎，评分回写 A/B 实验框架自动校准 prompt 选择                                                             | [backend/api/routers/feedback.py](backend/api/routers/feedback.py)、[frontend/components/chat/MessageFeedback.tsx](frontend/components/chat/MessageFeedback.tsx)                                                               |
| **🎯 IRT 自适应难度**                    | Item Response Theory 2PL 模型，按学生 ability θ 实时挑题（最大信息量），资源生成 prompt 自动注入难度建议                   | [backend/services/mastery/irt.py](backend/services/mastery/irt.py)                                                                                                                                                          |
| **🔌 MCP Server**                        | ZhiPath 暴露 4 个工具的 JSON-RPC MCP server，外部 Agent（Claude Desktop / Codex）可标准接入                               | [backend/api/routers/mcp.py](backend/api/routers/mcp.py)                                                                                                                                                                    |
| **🌓 暗色主题**                          | 跟随系统 / 浅 / 深 三档主题切换，CSS 变量驱动，反闪烁脚本                                                                   | [frontend/components/theme/ThemeToggle.tsx](frontend/components/theme/ThemeToggle.tsx)                                                                                                                                      |
| **📚 8+ 类多模态资源**                   | 微讲义 / 测验 / 闪卡 / 思维导图 / 可打印试卷 / 代码实操 / 讲义音频 / Mermaid 图表 / 知识图谱，多 Agent 并行产出             | [backend/capabilities/resource_gen.py](backend/capabilities/resource_gen.py)                                                                                                                                                |

---

## 二、系统架构

```
Frontend (Next.js 15 + React 19)
    │  WebSocket (/api/v1/ws)
    ▼
Backend (FastAPI)
    │
    ├── Orchestrator + CapabilityRegistry
    │       ├─ chat                 — 通用智能导师
    │       ├─ goal                 — 目标诊断 (3 Agent 串联)
    │       ├─ learning             — 学习路径规划
    │       ├─ resource_gen         — 资源生成 (4 Agent 并行 + TTS)
    │       └─ auto_tutor ⭐ NEW    — 7 阶段全闭环多智能体协作
    │
    ├── StreamBus (异步事件总线)
    │       事件类型：content / thinking / tool_call / tool_result
    │                agent_message ⭐ / profile_update ⭐ / loop_step ⭐
    │                sources / done / error
    │
    ├── Services
    │       ├─ RAGPipeline (pgvector + 词法兜底)
    │       ├─ Guardrail (引用追溯 + 安全过滤) ⭐ NEW
    │       ├─ LearningProfileService (双模式 + 证据链) ⭐ EVO
    │       ├─ iFlytekTTS (WebSocket 在线合成) ⭐ NEW
    │       ├─ MemoryService / SessionStore / ExamStore
    │       └─ QuizFeedbackService / ResourcePackageStore
    │
    └── PostgreSQL + pgvector
```

### 闭环工作机制

```
用户目标
  → 目标诊断 (GoalPlanner → SkillMapper → GapAnalyzer)
  → 多模态资源并行生成 (Quiz / Flashcard / MindMap / CodeLab / TTS)
  → 试卷封装 (ExamStore)
  → 模拟自评 (LLM 评分)
  → 薄弱点回写画像 (LearningProfileService)
  → 路径重规划 (PathScheduler)
  → 闭环报告 (LLM 总结)
  → 回到目标 (持续迭代)
```

---

## 三、5 种核心功能对照赛题要求

| 赛题要求                                        | ZhiPath 实现                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **对话式画像 (必做, ≥6 维度, 随学随新)** | 7 维度:`learning_goal`/`level`/`topics`/`weak_points`/`preferences`/`constraints`/`recent_intents`；每条都挂证据原话；WebSocket 增量更新 |
| **多智能体协同的资源生成 (必做, ≥5 种)** | 7 种: 讲义、测验、闪卡、思维导图、可打印试卷、代码实操、讲义音频；4 Agent 并行                                                                         |
| **个性化学习路径规划 (必做)**             | PathScheduler 三模式 (create/reflexion/reschedule)；Auto-Tutor 闭环自动重规划                                                                          |
| **智能辅导 (加分)**                       | Chat Tutor + RAG 引用追溯 + 多模态资源即时回推                                                                                                         |
| **学习效果评估 (加分)**                   | Auto-Tutor 内置自评 Agent；薄弱点自动回写画像驱动重规划                                                                                                |
| **防幻觉 + 内容安全 (非功能)**            | 引用编号 + 低置信度提示 + 输入侧关键词过滤 + 代码沙箱护栏                                                                                              |
| **生成进度追踪 + 流式呈现 (非功能)**      | StreamBus 全链路；UI 各级 stage_start/stage_end/loop_step 可视化                                                                                       |

---

## 四、技术栈

- **前端**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Pyodide
- **后端**: Python 3.12+, FastAPI, LangChain, asyncio
- **LLM**: DeepSeek (默认) · 通义千问 · 智谱 GLM · Moonshot Kimi · **科大讯飞星火**
- **TTS**: **科大讯飞超拟人 TTS (WebSocket)**
- **数据库**: PostgreSQL 16 + pgvector
- **嵌入模型**: sentence-transformers/all-mpnet-base-v2

---

## 五、快速启动

### 1. 启动数据库

```bash
docker-compose up -d
```

### 2. 启动后端

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env  # 编辑 .env 填入 API KEY
python main.py
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:3000/chat

### 4. （可选）启用讯飞能力

在 `.env` 增加：

```
XF_SPARK_API_PASSWORD=你的星火 OpenAI 兼容 SDK key
XF_TTS_APPID=你的 TTS APPID
XF_TTS_API_KEY=你的 TTS APIKey
XF_TTS_API_SECRET=你的 TTS APISecret
```

未配置时讯飞功能会自动降级，主流程不受影响。

---

## 六、关键文件索引

| 想了解              | 文件                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一键闭环全流程      | [backend/capabilities/auto_tutor.py](backend/capabilities/auto_tutor.py)                                                                                                                                          |
| 讯飞 LLM + TTS      | [backend/base/iflytek_factory.py](backend/base/iflytek_factory.py)                                                                                                                                                |
| 防幻觉与引用        | [backend/services/guardrail/](backend/services/guardrail/)                                                                                                                                                        |
| 画像证据链          | [backend/services/profile/service.py](backend/services/profile/service.py)（`update_from_user_message`）                                                                                                        |
| 代码实操沙箱        | [backend/modules/resource_gen/agents/code_lab_generator.py](backend/modules/resource_gen/agents/code_lab_generator.py)、[frontend/components/code_lab/CodeLabCard.tsx](frontend/components/code_lab/CodeLabCard.tsx) |
| 多智能体通信可视化  | [frontend/components/agent/AgentMessageFeed.tsx](frontend/components/agent/AgentMessageFeed.tsx)                                                                                                                  |
| 闭环进度可视化      | [frontend/components/visual/AutoTutorLoopVisual.tsx](frontend/components/visual/AutoTutorLoopVisual.tsx)                                                                                                          |
| 单轮 WebSocket 链路 | [backend/api/routers/ws.py](backend/api/routers/ws.py)                                                                                                                                                            |
| 评委速览            | [docs/JUDGE_BRIEF.md](docs/JUDGE_BRIEF.md)、[ARCHITECTURE.md](ARCHITECTURE.md)                                                                                                                                       |

---

## 七、开源协议声明

本作品使用以下开源项目和服务，均遵循其原始协议：

| 名称                          | 协议                       | 用途               | 来源                                                           |
| ----------------------------- | -------------------------- | ------------------ | -------------------------------------------------------------- |
| Next.js                       | MIT                        | 前端框架           | https://nextjs.org/                                            |
| React                         | MIT                        | UI 库              | https://react.dev/                                             |
| Tailwind CSS                  | MIT                        | 样式系统           | https://tailwindcss.com/                                       |
| FastAPI                       | MIT                        | 后端 Web 框架      | https://fastapi.tiangolo.com/                                  |
| LangChain                     | MIT                        | LLM 编排           | https://github.com/langchain-ai/langchain                      |
| pgvector                      | PostgreSQL License         | 向量检索           | https://github.com/pgvector/pgvector                           |
| sentence-transformers         | Apache 2.0                 | 嵌入模型           | https://github.com/UKPLab/sentence-transformers                |
| `all-mpnet-base-v2` 模型    | Apache 2.0                 | 句向量             | https://huggingface.co/sentence-transformers/all-mpnet-base-v2 |
| Pyodide                       | Mozilla Public License 2.0 | 浏览器 Python 沙箱 | https://pyodide.org/                                           |
| python-docx                   | MIT                        | Word 文档生成      | https://github.com/python-openxml/python-docx                  |
| websocket-client              | Apache 2.0                 | 讯飞 TTS WebSocket | https://github.com/websocket-client/websocket-client           |
| **科大讯飞 星火 LLM**   | 商业 SDK，遵循官方使用条款 | 多 LLM 协同        | https://www.xfyun.cn/doc/spark/Web.html                        |
| **科大讯飞 超拟人 TTS** | 商业 SDK，遵循官方使用条款 | 讲义音频化         | https://www.xfyun.cn/doc/tts/online_tts/API.html               |
| DeepSeek API                  | 商业 API                   | 主 LLM             | https://platform.deepseek.com/                                 |

参考与启发的开源项目（位于本仓库根目录的相邻目录中）![1780840094081](image/README/1780840094081.png)：

- **DeepTutor** (LlamaIndex RAG + 多渠道 AI 导师) — 用于参考 RAG 检索设计
- **EduAgent** (Azure 全栈 + LangGraph) — 用于参考多智能体编排
- **GenMentor** (WWW 2025 论文) — 用于参考画像驱动的多智能体框架

---

## 八、评委/批阅速览

更深入的批阅指引参见 **[docs/JUDGE_BRIEF.md](docs/JUDGE_BRIEF.md)**（与 `ws.py` 步骤注释、`auto_tutor.py` 阶段编号同步）。

详细架构文档参见 **[ARCHITECTURE.md](ARCHITECTURE.md)**。

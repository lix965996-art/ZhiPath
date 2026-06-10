# ZhiPath · 基于大模型的个性化资源生成与学习多智能体系统

> 2026 中国软件杯 **A3 赛题** 参赛作品
>
> **多智能体协同 · 多模态资源生成 · 对话式画像 · 闭环学习评估**

---

## 一、系统概述

ZhiPath 是一个面向个性化学习的多智能体协作系统。用户通过自然语言对话，系统自动完成学习者画像构建、技能差距诊断、学习路径规划、多模态学习资源生成、测验评估与反馈闭环。

### 核心工作流程

```
用户目标
  → 目标诊断 (GoalPlanner → SkillMapper → GapAnalyzer)
  → 多模态资源并行生成 (Quiz / Flashcard / MindMap / CodeLab / TTS)
  → 试卷封装 + 模拟自评
  → 薄弱点回写画像
  → 路径重规划
  → 闭环报告 → 持续迭代
```

---

## 二、系统架构

```
Frontend (Next.js 15 + React 19)
    │  WebSocket (/api/v1/ws)
    ▼
Backend (FastAPI)
    │
    ├── Orchestrator + CapabilityRegistry
    │       ├─ chat          — 通用智能导师
    │       ├─ goal          — 目标诊断 (3 Agent 串联)
    │       ├─ learning      — 学习路径规划
    │       ├─ resource_gen  — 资源生成 (4 Agent 并行 + TTS)
    │       ├─ auto_tutor    — 7 阶段全闭环多智能体协作
    │       ├─ debate        — 多智能体辩论
    │       ├─ explainer     — 动画讲解
    │       └─ agentic_chat  — 自主决策 Agent
    │
    ├── StreamBus (异步事件总线)
    │       content / thinking / tool_call / agent_message / done / error
    │
    ├── Services
    │       ├─ RAGPipeline (pgvector + 词法兜底)
    │       ├─ Guardrail (引用追溯 + 安全过滤)
    │       ├─ LearningProfileService (对话式画像 + 证据链)
    │       ├─ iFlytekTTS (WebSocket 在线合成)
    │       ├─ BKT / DKT / IRT 知识追踪与自适应
    │       ├─ FSRS 间隔重复调度
    │       └─ MemoryService / SessionStore / ExamStore
    │
    └── PostgreSQL + pgvector
```

---

## 三、亮点一览

| 功能 | 说明 |
|------|------|
| **Auto-Tutor 一键闭环** | 单条指令跑完「目标诊断 → 资源生成 → 试卷封装 → 自评 → 画像更新 → 路径重规划 → 闭环报告」7 阶段 |
| **BKT 贝叶斯知识追踪** | Corbett & Anderson (1995) 算法，每个 KC 维护 P(掌握) 概率，答题动态后验更新 |
| **FSRS-4 间隔重复** | Ye et al. 2023 遗忘曲线调度，错题/闪卡自动入复习队列 |
| **对话式画像** | 7 维度画像，每条挂证据原话，WebSocket 增量更新 |
| **8+ 类多模态资源** | 讲义 / 测验 / 闪卡 / 思维导图 / 可打印试卷 / 代码实操 / 讲义音频 / Mermaid 图表 |
| **知识图谱 + 推荐学习** | LLM 抽取 KG，DAG 存储前后置依赖，BKT 驱动"下一步学什么" |
| **多智能体辩论** | 正方/反方/裁判三角色 2 轮辩论 (Du et al. ICML 2024) |
| **防幻觉与引用追溯** | RAG 检索片段编号 + 相似度分 + 低置信度提示 + 输入安全过滤 |
| **多模型智能路由** | 6 类任务自动选模型，带 fallback 链 (DeepSeek / 通义 / GLM / Kimi / 星火) |
| **OTel 全链路追踪** | 每个 Agent / LLM / Tool 调用有 span，前端甘特图可视化 |
| **IRT 自适应难度** | 2PL 模型按学生 ability θ 实时挑题 |
| **教师班级聚合视图** | 多 session 聚合：班级平均掌握度 + 薄弱 KC + 学生榜单 |
| **PDF 学习周报** | 一键生成中文 PDF，含画像 + BKT + FSRS + Trace 报告 |

---

## 四、功能对照赛题要求

| 赛题要求 | ZhiPath 实现 |
|----------|-------------|
| **对话式画像** (必做, ≥6 维度) | 7 维度: learning_goal / level / topics / weak_points / preferences / constraints / recent_intents，每条挂证据原话 |
| **多智能体资源生成** (必做, ≥5 种) | 7+ 种: 讲义、测验、闪卡、思维导图、可打印试卷、代码实操、讲义音频、Mermaid 图表 |
| **学习路径规划** (必做) | PathScheduler 三模式 (create / reflexion / reschedule)；Auto-Tutor 闭环自动重规划 |
| **智能辅导** (加分) | Chat Tutor + RAG 引用追溯 + 多模态资源即时回推 |
| **学习效果评估** (加分) | Auto-Tutor 内置自评 Agent；薄弱点自动回写画像驱动重规划 |

---

## 五、技术栈

| 层 | 技术 |
|----|------|
| **前端** | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| **后端** | Python 3.12+, FastAPI, LangChain, asyncio |
| **LLM** | DeepSeek · 通义千问 · 智谱 GLM · Moonshot Kimi · 科大讯飞星火 |
| **TTS** | 科大讯飞超拟人 TTS (WebSocket) |
| **数据库** | PostgreSQL 17 + pgvector |
| **嵌入模型** | sentence-transformers / all-mpnet-base-v2 |
| **通信** | WebSocket 流式传输 |

---

## 六、项目结构

```
ZhiPath/
├── backend/                     # 后端 (Python FastAPI)
│   ├── api/                     #   API 路由层 (REST + WebSocket)
│   ├── base/                    #   基础设施 (Agent 基类、LLM 工厂、RAG)
│   ├── capabilities/            #   能力处理器 (意图路由后的执行逻辑)
│   ├── config/                  #   配置加载 (YAML + 环境变量)
│   ├── core/                    #   核心模型 (上下文、事件、事件总线)
│   ├── modules/                 #   功能模块 (智能体 + 提示词 + Schema)
│   │   ├── chat_tutor/          #     通用 AI 辅导
│   │   ├── learner_profile/     #     学习者画像
│   │   ├── learning_path/       #     学习路径规划
│   │   ├── resource_gen/        #     资源生成 (7+ Agent)
│   │   └── skill_gap/           #     技能差距分析 (3 Agent)
│   ├── runtime/                 #   运行时 (编排器、能力注册表)
│   ├── services/                #   数据服务层
│   │   ├── mastery/             #     BKT / DKT / IRT 知识追踪
│   │   ├── srs/                 #     FSRS 间隔重复
│   │   ├── rag/                 #     RAG 检索 + GraphRAG
│   │   ├── knowledge_graph/     #     知识图谱
│   │   ├── profile/             #     学习者画像服务
│   │   ├── guardrail/           #     防幻觉 + 安全过滤
│   │   ├── report/              #     周报生成
│   │   └── xapi/                #     xAPI 兼容 LRS
│   └── tests/                   #   测试
├── frontend/                    # 前端 (Next.js)
│   ├── app/                     #   页面路由
│   ├── components/              #   组件库
│   │   ├── chat/                #     聊天界面
│   │   ├── agent/               #     多智能体工作流可视化
│   │   ├── visual/              #     3D 轨道 + 仪表盘 + 学习闭环
│   │   ├── profile/             #     学习者画像展示
│   │   ├── path/                #     学习路径时间线
│   │   ├── quiz/                #     测验组件
│   │   ├── resources/           #     资源包展示
│   │   └── ...                  #     其他组件
│   ├── context/                 #   React Context
│   └── lib/                     #   工具库 (API client / WebSocket)
└── docs/                        # 文档
```

---

## 七、快速启动

### 1. 环境准备

- Python 3.12+
- Node.js 18+
- PostgreSQL 17 + pgvector 扩展

### 2. 启动数据库

```bash
# 本地 PostgreSQL (确保 pgvector 扩展已安装)
pg_ctl start -D /path/to/pgdata
```

创建数据库并启用 pgvector：

```sql
CREATE DATABASE learnflow;
\c learnflow
CREATE EXTENSION vector;
```

### 3. 启动后端

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate       # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
cp ../.env.example ../.env   # 编辑 .env 填入 API KEY
python main.py
```

后端启动在 http://localhost:8000

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端启动在 http://localhost:3000

打开 http://localhost:3000/chat 开始使用。

### 5. （可选）启用讯飞能力

在 `.env` 增加：

```env
XF_SPARK_API_PASSWORD=你的星火 OpenAI 兼容 SDK key
XF_TTS_APPID=你的 TTS APPID
XF_TTS_API_KEY=你的 TTS APIKey
XF_TTS_API_SECRET=你的 TTS APISecret
```

未配置时讯飞功能自动降级，主流程不受影响。

---

## 八、开源协议声明

本作品使用以下开源项目和服务，均遵循其原始协议：

| 名称 | 协议 | 用途 |
|------|------|------|
| Next.js | MIT | 前端框架 |
| React | MIT | UI 库 |
| Tailwind CSS | MIT | 样式系统 |
| FastAPI | MIT | 后端 Web 框架 |
| LangChain | MIT | LLM 编排 |
| pgvector | PostgreSQL License | 向量检索 |
| sentence-transformers | Apache 2.0 | 嵌入模型 |
| Pyodide | Mozilla Public License 2.0 | 浏览器 Python 沙箱 |
| python-docx | MIT | Word 文档生成 |
| 科大讯飞 星火 LLM | 商业 SDK，遵循官方使用条款 | 多 LLM 协同 |
| 科大讯飞 超拟人 TTS | 商业 SDK，遵循官方使用条款 | 讲义音频化 |
| DeepSeek API | 商业 API | 主 LLM |

---

## 九、参考项目

- **DeepTutor** — LlamaIndex RAG + 多渠道 AI 导师，参考 RAG 检索设计
- **EduAgent** — Azure 全栈 + LangGraph，参考多智能体编排
- **GenMentor** (WWW 2025) — 参考画像驱动的多智能体框架

---

> **ZhiPath** — 让每位学习者拥有属于自己的智能导师。

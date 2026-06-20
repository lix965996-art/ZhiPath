# ZhiPath 智径

> **408 个性化学习多智能体系统 · 产品使用说明书**
>
> 基于系统实际功能整理 · V2.0 · 2026-06-15

---

## 文档修订记录

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| V1.0 | 2026-06-14 | 初始版本 |
| V2.0 | 2026-06-15 | 全面更新：新增 Skill Gap / MCP / xAPI / Code Lab / Guardrail 等模块说明；端口与配置同步代码现状 |

---

## 一、产品概述

ZhiPath（智径）是一款面向高等教育场景（以计算机专业 408 备考为切入点）的个性化学习多智能体系统。学生用自然语言提出学习目标后，系统自动完成画像构建、知识库检索、学习路径规划、资源生成、测验反馈与复习调度，形成"诊断 — 资源 — 练习 — 反馈 — 重规划"的闭环。

本说明书面向学生用户、教师用户、评审人员与项目维护人员，介绍产品功能、使用方法与部署配置。

### 1.1 核心特征

| 特征 | 说明 |
|------|------|
| 对话式画像 | 从自然语言对话中自动抽取 7 维学习者画像，不需要填表 |
| 多智能体资源生成 | 7 个 Agent 并行生成 8 类多模态资源（测验/闪卡/思维导图/代码实操/Mermaid 图/知识图谱/案例研究/动画讲解） |
| 算法驱动学情 | BKT + DKT + IRT + FSRS-4.5 四套算法追踪掌握度、推荐难度、调度复习 |
| 全程流式可视 | 多智能体调用链实时高亮，16 种事件类型让学习过程透明可追溯 |
| 安全防护 | 内容安全护栏 + 代码沙箱双重防线，AI 回复标注引用来源 |

---

## 二、系统架构与多智能体

系统采用"编排器（Orchestrator）+ 能力注册表（Capability Registry）"的多智能体架构。用户消息经 WebSocket 进入编排器，编排器根据 `active_capability` 字段从注册表查找对应能力，能力内部编排一个或多个 Agent 完成任务，全过程通过 StreamBus 以 16 种事件类型流式下发。

### 2.1 主要智能体与职责

| 智能体模块 | 职责 |
|-----------|------|
| AdaptiveProfiler | 从对话中抽取 7 维画像并维护证据链 |
| PathScheduler | 根据掌握度快照规划阶段式学习路径 |
| QuizGenerator / FlashcardGenerator / MindMapGenerator / CodeLabGenerator / MermaidGenerator / KGGenerator / CaseStudyGenerator | 7 个资源生成 Agent，并行调度 |
| ExplainerAgent | 动画讲解脚本生成（Mermaid 分帧 + 旁白） |
| LearningGoalRefiner / SkillRequirementMapper / SkillGapIdentifier | Skill Gap 三阶段：目标精炼 → 技能映射 → 差距识别 |
| TutorChatbot | 智能辅导对话 |
| DebateAgent | 苏格拉底式辩论追问 |

### 2.2 模型调度机制

模型调度由 ModelRouter 完成，支持以下 LLM Provider：

| Provider | 代表模型 | 定位 |
|----------|---------|------|
| DeepSeek | deepseek-chat (V3) / deepseek-reasoner (R1) | 主力 |
| 通义千问 | qwen-plus / qwen-max / qwen-turbo | 备选 |
| 硅基流动 | 多模型 | 备选 |
| 讯飞星火 | 4.0Ultra / lite | 赛题要求优先接入 |

系统按任务类型（reasoning / long_form / structured / code 等）自动选择合适模型，主模型失败时自动降级到备选。用户可在前端设置页配置多套凭据。

---

## 三、技术栈与运行环境

| 类别 | 技术 |
|------|------|
| 前端 | Next.js 15、React 19、TypeScript、Tailwind CSS、Three.js |
| 后端 | Python 3.12+、FastAPI、LangChain、SQLAlchemy、Alembic |
| 数据库 | PostgreSQL 16 + pgvector（768 维向量） |
| 嵌入模型 | sentence-transformers/all-mpnet-base-v2 |
| Reranker | cross-encoder/ms-marco-MiniLM-L-6-v2 |
| 代码沙箱 | tcc / gcc / clang / cl 自动探测 |

### 3.1 默认端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 | 3000 | Next.js dev server |
| 后端 | 8000 | FastAPI / Uvicorn |
| 数据库 | 5432 | PostgreSQL（Docker Compose 默认） |

---

## 四、功能模块说明

### 4.1 工作台（/chat）

核心对话入口。用户输入学习目标或问题后，系统自动路由到 9 个能力之一（chat / goal / learning / resource_gen / auto_tutor / agentic / debate / explainer / engineering_trace）。右侧面板实时展示多智能体调用链路。

### 4.2 课程知识库（/knowledge）

内置 408 四科知识切片，支持向量语义检索和关键词检索。提供知识拓扑结构（前置依赖关系）和薄弱知识点定位。

### 4.3 学情画像（/profile）

7 维画像展示：学习目标、当前水平、关注主题、薄弱知识点、学习偏好、时间约束、最近意图。每维度附证据链（来源对话片段）。

### 4.4 学习路径（/path）

阶段式学习路线，每阶段包含推荐资源和练习任务。掌握度变化后自动重规划路径。

### 4.5 资源工坊（/resources）

8 类资源集中浏览：测验题、闪卡、思维导图、代码实操（Code Lab 沙箱）、Mermaid 图表、知识图谱片段、案例研究、动画讲解音频。支持资源包导出和试卷 DOCX 导出。

### 4.6 系统总览（/overview）

面向教师和评审，展示能力清单、核心流程、工程结构和统计数据。

### 4.7 学习仪表盘（/dashboard）

知识图谱可视化、掌握度热力图（BKT 概率映射颜色深浅）、FSRS-4.5 复习日历（到期卡片提示）。

---

## 五、典型使用流程

1. 打开 http://localhost:3000，注册或登录。
2. 进入 /chat 工作台，在设置中配置至少一个 LLM API Key。
3. （可选）点击一键填充演示数据，注入 408 知识库和示例画像。
4. 输入学习目标，例如"我想系统复习数据结构，基础一般，薄弱点是树和图"。
5. 观察右侧多智能体调用链，系统自动诊断目标并构建画像。
6. 让系统生成资源包，查看测验、闪卡、思维导图等。
7. 完成测验后，仪表盘和画像自动更新，学习路径重规划。

---

## 六、数据真实性与防幻觉说明

1. **引用标注**：AI 生成的回答标注知识来源（RAG 检索命中的文档分片），用户可点击查看原文。
2. **内容安全护栏**：7 条 block 模式（涉政暴恐、prompt 注入等）+ 4 条 warn 模式（抄袭、代写、作弊、枪手），命中后拦截或提示。
3. **代码安全检查**：Code Lab 运行前做静态扫描，拦截危险函数和未授权头文件。
4. **置信度标注**：画像维度、掌握度、推荐结果均附带置信度分数。

---

## 七、启动与部署

### 方式一：Docker Compose（推荐演示用）

```bash
docker compose up --build
```

三服务自动启动：postgres（pgvector/pgvector:pg16）→ backend（FastAPI:8000）→ frontend（Next.js:3000）。

### 方式二：本地启动（推荐开发用）

1. 启动 PostgreSQL（需 pgvector 扩展）。
2. 配置 `.env` 文件（至少 `DATABASE_URL`）。
3. 启动后端：`cd backend && pip install -r requirements.txt && python main.py`
4. 启动前端：`cd frontend && npm install && npm run dev`

环境变量说明见下表：

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `DEEPSEEK_API_KEY` | 否 | DeepSeek Key（也可前端配置） |
| `DASHSCOPE_API_KEY` | 否 | 通义千问 Key |
| `SILICONFLOW_API_KEY` | 否 | 硅基流动 Key |
| `XF_SPARK_API_PASSWORD` | 否 | 讯飞星火凭据 |
| `XF_TTS_APPID` / `XF_TTS_API_KEY` / `XF_TTS_API_SECRET` | 否 | 讯飞 TTS 凭据 |

---

## 八、开源与第三方组件说明

| 组件 | 协议 | 用途 |
|------|------|------|
| FastAPI | MIT | 后端 Web 框架 |
| LangChain | MIT | LLM 应用框架 |
| SQLAlchemy + Alembic | MIT | ORM 与数据库迁移 |
| pgvector | PostgreSQL | 向量检索扩展 |
| sentence-transformers | Apache-2.0 | 文本嵌入模型 |
| Next.js / React | MIT | 前端框架 |
| Tailwind CSS | MIT | 样式系统 |
| Three.js | MIT | 3D 可视化 |
| python-docx | MIT | Word 文档生成 |
| bcrypt | Apache-2.0 | 密码安全哈希 |

商业 SDK：科大讯飞星火大模型（赛题要求优先接入）、科大讯飞超拟人 TTS、DeepSeek、通义千问。

学习算法参考：BKT（Corbett & Anderson, 1995）、DKT（Piech et al., NIPS 2015）、IRT（Lord & Novick, 1968）、FSRS-4.5（open-spaced-repetition）。

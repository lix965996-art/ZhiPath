# ZhiPath 完整使用手册

> 这是写给**项目作者本人**的保姆级使用手册。
> 从"这玩意儿到底是干啥的"讲到"答辩怎么演示"，不带技术黑话。

---

## 目录

- [一、这是什么？(60 秒理解)](#一这是什么60-秒理解)
- [二、5 分钟首次启动](#二5-分钟首次启动)
- [三、保姆级首次体验 (5 分钟跑通)](#三保姆级首次体验-5-分钟跑通)
- [四、7 个核心能力详解](#四7-个核心能力详解)
- [五、所有页面在哪 + 干啥用](#五所有页面在哪--干啥用)
- [六、答辩标准演示脚本 (3 分钟版)](#六答辩标准演示脚本-3-分钟版)
- [七、评委 Q&A 备答](#七评委-qa-备答)
- [八、常见故障速查](#八常见故障速查)
- [九、关键算法原理 (评委追问时用)](#九关键算法原理-评委追问时用)
- [十、文件去哪里找](#十文件去哪里找)
- [附录 A: 环境变量完整清单](#附录-a-环境变量完整清单)
- [附录 B: API 路由完整列表](#附录-b-api-路由完整列表)
- [附录 C: 论文参考文献](#附录-c-论文参考文献)

---

## 一、这是什么？(60 秒理解)

### 一句话讲清

**ZhiPath 是一个"多智能体协作 + 多模态资源生成 + 算法驱动学情追踪"的高等教育个性化学习系统**，对应 2026 中国软件杯 A3 赛题。

### 三句话讲清

1. **学生开口说话**就能被系统从 7 个维度自动建画像，不用填表
2. **多个 AI 智能体协作**生成 8 类多模态资源（讲义 / 测验 / 闪卡 / 思维导图 / 试卷 / 代码沙箱 / 讲义音频 / Mermaid 图表）
3. 用 **BKT + DKT + FSRS-4 + IRT** 等论文算法持续追踪学生学情，**Auto-Tutor 自动闭环**: 诊断 → 资源 → 自评 → 画像更新 → 路径重规划

### 为什么和其他参赛作品不一样？

| 维度 | 普通参赛作品 | ZhiPath |
|---|---|---|
| 学情追踪 | 错题列表 + 分数 | BKT 贝叶斯 + DKT 深度模型 + FSRS-4 间隔重复 |
| 多模态资源 | 文字 + 图片 | 8 类（含**音频/代码沙箱/Mermaid/知识图谱**）|
| 多智能体 | 几个 Agent 串联 | **7 个 Capability + AgenticChat 自主路由** |
| 可观测性 | print 日志 | OpenTelemetry 语义 Trace + 甘特图 |
| 防幻觉 | 无 | RAG 引用追溯 + 低置信度告警 + 输入侧安全过滤 |
| 教师场景 | 没考虑 | 班级聚合视图 + CSV/JSON 导出 |
| 教育标准 | 没考虑 | xAPI 1.0.3 LRS（兼容 Tin Can API）|

---

## 二、5 分钟首次启动

### 方式 1：Docker Compose 一键启动（推荐演示用）

需要先装 Docker Desktop。

```bash
cd E:\A3\ZhiPath
docker-compose up -d
```

等 30 秒，三个容器全部就位（`postgres` + `backend` + `frontend`）。

**浏览器打开**：http://localhost:3000/chat

### 方式 2：本地启动（推荐开发用）

#### 1. 启动数据库（如果没装 Docker，可以跳过，系统会回退到 JSON 文件存储）

```bash
docker run -d --name learnflow-db -p 5432:5432 \
  -e POSTGRES_USER=learnflow -e POSTGRES_PASSWORD=learnflow -e POSTGRES_DB=learnflow \
  pgvector/pgvector:pg16
```

#### 2. 启动后端

```bash
cd E:\A3\ZhiPath\backend

# 第一次需要装依赖
pip install -r requirements.txt

# 启动
python main.py
```

看到这一行就是成功了：
```
ZhiPath API initialized with capabilities: ['chat', 'goal', 'learning', 'resource_gen', 'auto_tutor', 'debate', 'agentic']
```

#### 3. 启动前端（新开一个终端）

```bash
cd E:\A3\ZhiPath\frontend

# 第一次需要装依赖
npm install

# 启动
npm run dev
```

看到 `Local: http://localhost:3000` 就成功了。

### 验证启动成功

打开 http://localhost:8000/health，看到：
```json
{"status":"ok","capabilities":["chat","goal","learning","resource_gen","auto_tutor","debate","agentic"]}
```
就是后端正常。

打开 http://localhost:3000/chat，看到漂亮的聊天界面，就是前端正常。

---

## 三、保姆级首次体验 (5 分钟跑通)

> 这一节超详细。第一次打开 ZhiPath，不知道点啥的话，**完全照做就能体验完整功能**。

### Step 1：打开主页

地址 http://localhost:3000/chat

会看到：
- **左侧**：会话列表 + 4 个导航链接（资源工坊 / 学习者画像 / 学习路径 / 知识库 / 学习仪表盘 / 班级视图）
- **中间**：欢迎页 + 5 角形"学习闭环"动画
- **右侧**：多智能体协作链路图

### Step 2：填充演示数据（最重要！！）

> 不做这一步的话，后面所有可视化页都是空的，会很丑。

左侧"一键演示"面板里 → 点 **"🟢 一键填充演示数据"** 按钮。

会 toast 提示：
```
✅ 已填充演示数据：KG 8 节点 / BKT 12 知识点 / FSRS 6 张卡
```

这一步在后台自动创建了一个**"小明同学"** 的演示账号，并把它的学习历史塞满（详见第九节"BKT 算法"）。

### Step 3：选"✨ 智能路由"能力，发第一个消息

输入框上方有一排能力 pill，**第一个就是 ✨ 智能路由（默认选中）**。

输入框里输入：

```
我目标是 2 周入门机器学习，请根据我目前的掌握度告诉我接下来该学什么、并安排一份练习
```

按回车。

**接下来会发生什么（按时间顺序）**：

1. **思考动画**：左下角出现思考 chip
2. **右侧"多智能体通信轨迹"面板长出气泡**：
   - `AgenticChat → query_mastery` (📨 学情查询)
   - `AgenticChat → query_knowledge_graph` (📨 KG 查询)
   - `AgenticChat → route_to_resource_gen` (📨 路由到资源生成)
3. **资源开始生成**：右侧 AgentWorkflowGraph 节点逐个亮起（QuizGenerator / FlashcardGenerator / MindMapGenerator / CodeLabGenerator / MermaidGenerator）
4. **流式输出**：中间消息区流式打字
5. **资源包卡片落到消息下方**：包含可下载的 Word 试卷 + PDF 打印版 + 音频播放器
6. **下方 chip**：`👍 这条回答有用` + `👎 没帮助`（RLHF）
7. **画像证据链面板更新**：右侧"🪪 画像证据链"实时长出新维度

### Step 4：看可视化页

点左侧 **🟦 学习仪表盘** 按钮（或直接 http://localhost:3000/dashboard）：

- 上方会话选择栏 → 选 **"小明（演示账号）"**
- **知识图谱**：8 个节点拓扑分层显示，颜色按掌握度着色（红→黄→绿）
- **掌握度热力图**：12 个知识点 × 时间，每个格子代表一次答题
- **复习日历**：未来 18 天每天复习量（番茄绿色浓淡）
- **Trace 甘特图**：刚才那次对话的多智能体调用链路时序

### Step 5：试试其他演示按钮

回到 /chat，左侧"一键演示"还有：

| 按钮 | 触发场景 | 看点 |
|---|---|---|
| 🚀 Auto-Tutor 闭环 | 7 阶段自动学习 | 看右侧"Auto-Tutor 闭环"七边形动画依次亮起 |
| 📚 多模态资源包 | 一次性生成 8 类资源 | 看 Word 下载 + 试卷 PDF + 讲义音频 + Pyodide 代码沙箱 |
| ⚔ 多智能体辩论 | 正反方+裁判 2 轮辩论 | 看 5 阶段事件流（正方一辩→反方一驳→正方二辩→反方二驳→裁判终审） |

---

## 四、7 个核心能力详解

> 这 7 个 capability 是 ZhiPath 的"工作单元"，每个对应一种问答模式。

### 1. ✨ 智能路由 (agentic) — **默认推荐**

**怎么用**：直接说话，AI 自己决定调用什么。

**适合**：
- 不知道该选啥的时候
- 学情/掌握度类问题（"我现在掌握得怎么样"）
- 需要混合多种能力的复杂问题

**底层**：LLM 自主 function calling，工具有：
- `route_to_goal/learning/resource_gen/auto_tutor/debate` — 路由到其他 5 个能力
- `query_mastery` — 查 BKT 掌握度
- `query_due_cards` — 查 FSRS 待复习
- `query_knowledge_graph` — 查 KG

**例子**：
> 我目标是 2 周入门机器学习 → AI 自动调 `query_mastery` + `query_knowledge_graph` + `route_to_resource_gen` 三连击

### 2. 🧠 智能导师 (chat)

**怎么用**：知识讲解、概念辨析、追问引导。

**适合**：单纯问问题，"什么是梯度下降"、"解释一下监督学习"。

**底层**：单 LLM + RAG 检索，最快最便宜。

### 3. 🎯 目标诊断 (goal)

**怎么用**：描述学习目标，AI 帮你拆解。

**适合**：目标模糊时，"我想学 AI"、"我想准备考研"。

**底层**：3 个 Agent 串联（GoalPlanner → SkillMapper → GapAnalyzer），用 reasoning 档大模型。

### 4. 📅 个性化学习 (learning)

**怎么用**：让 AI 给你做学习计划。

**适合**：已经有画像了，需要排具体时间表。

**底层**：调 `ProfileBuilder` + `PathScheduler` 两个 Agent。

### 5. 🪄 资源生成 (resource_gen) — **最酷**

**怎么用**：要测验、要讲义、要试卷。

**适合**：明确要求"给我出 5 道选择题"、"生成一份试卷"。

**底层**：**5 个 Generator 并行**：
- QuizGenerator → 4 种题型
- FlashcardGenerator → 闪卡
- MindMapGenerator → 思维导图
- CodeLabGenerator → Pyodide Python 代码片段
- MermaidGenerator → 流程图/时序图/状态图

外加：
- KGGenerator → 知识图谱节点 + 依赖边自动入库
- IFlytekTTS → 讯飞 TTS 生成讲义音频
- ExamStore → 自动封装可打印试卷
- ResourcePackageStore → 持久化整个资源包

### 6. 🚀 Auto-Tutor 闭环 (auto_tutor) — **最完整**

**怎么用**：一次性跑完整套学习循环。

**适合**：演示场景。"我想 2 周入门机器学习，帮我跑一次完整学习闭环"。

**底层 7 阶段**：
1. 目标诊断（3 Agent 串联）
2. 并行资源生成（4 Agent）
3. 试卷封装（ExamStore）
4. 模拟自评（LLM 评分）
5. 画像更新（BKT 回写）
6. 路径重规划（PathScheduler）
7. 闭环报告（LLM 总结）

每个阶段都会 emit `loop_step` 事件，右侧"Auto-Tutor 闭环"七边形依次亮起。

### 7. ⚔ 多智能体辩论 (debate)

**怎么用**：对"X vs Y 哪种好"类问题给出有依据的结论。

**适合**："刷题 vs 看书谁更有用"、"自顶向下 vs 自底向上学算法"。

**底层 5 阶段**：
1. 正方一辩
2. 反方一驳
3. 正方二辩
4. 反方二驳
5. 裁判终审（流式输出 Markdown）

---

## 五、所有页面在哪 + 干啥用

| 页面路径 | 干啥用 | 重点看什么 |
|---|---|---|
| `/chat` | **主战场**。聊天 + 7 个能力 + 实时可视化 | 右侧三个面板（工作流图 / 通信轨迹 / 画像证据链）|
| `/dashboard` | 学情仪表盘 | KG 拓扑图 + BKT 热力图 + FSRS 日历 + Trace 甘特图 |
| `/classroom` | 教师班级聚合视图 | 班级薄弱 TOP + 学生榜单 + CSV/JSON 导出 |
| `/profile` | 学习者画像 | 雷达图 + 画像评分 + 弱项标签 |
| `/path` | 学习路径时间线 | 6 阶段路径卡片 |
| `/knowledge` | 知识库管理 | 文档列表 + 搜索 + 上传 |
| `/resources` | 资源工坊 | 全部历史资源包浏览 + 详情（音频/代码/Mermaid 都能看）|
| `/overview` | 系统总览 | AgentWorkflowGraph 大图，方便讲架构 |

### 隐藏入口（不在导航里但 API 可访问）

- `http://localhost:8000/docs` — FastAPI 自动生成的 **OpenAPI 文档**，可在线试所有 API
- `http://localhost:8000/api/v1/router` — 多模型路由配置 + 最近 50 次路由决策
- `http://localhost:8000/api/v1/trace` — 所有 trace 列表
- `http://localhost:8000/api/v1/mcp/` — MCP server 元信息
- `http://localhost:8000/api/v1/report/{session_id}/weekly.pdf` — 一键生成 PDF 周报

---

## 六、答辩标准演示脚本 (3 分钟版)

> 这是一个**已经准备好台词**的演示，按顺序走稳赢。

### 提前准备（5 分钟）

1. 启动好后端 + 前端（参见第二节）
2. 打开 http://localhost:3000/chat
3. **点"一键填充演示数据"按钮**（必须！）
4. 切换主题为深色（右上角主题切换 → 🌙）—— 演示视觉效果更好

### 0. 开场 (10 秒)

> "我们的作品 ZhiPath 是一个面向高等教育的**多智能体个性化学习系统**。
> 它能从对话中自动建画像、用 8 类多模态资源协同教学、用论文级算法持续追踪学情。
> 接下来 3 分钟，我会展示它最核心的三个场景。"

### 1. 智能路由 — 让 AI 自主决策 (50 秒)

**操作**：
- 确认选中"✨ 智能路由"
- 输入：`我想 2 周入门机器学习，请根据我目前的掌握度告诉我接下来该学什么`
- 按回车

**台词**：
> "评委注意右侧：**多智能体通信轨迹面板**会实时显示 AgenticChat 决定调用什么工具。
> 这是 LLM **自主**的 function calling — 它先调 `query_mastery` 查我的 BKT 掌握度，
> 又调 `query_knowledge_graph` 看我的知识依赖图，最后调 `route_to_resource_gen` 出题。
> **三个工具调用都是 AI 自己决定的**，不是硬编码。"

### 2. Auto-Tutor 闭环 — 一键完整学习循环 (60 秒)

**操作**：
- 等上一个对话结束
- 切到 **🚀 Auto-Tutor 闭环** pill
- 点左侧 demo 按钮"🚀 Auto-Tutor 闭环"，自动发送演示 prompt

**台词**（边等边讲）：
> "现在系统在跑 7 阶段闭环：目标诊断 → 4 Agent 并行生成 → 试卷封装 → LLM 自评 → 画像回写 → 路径重规划 → 闭环报告。
> 看右侧**七边形闭环可视化**，阶段依次亮起。
> 这一轮跑完之后，学生的 BKT 掌握度、FSRS 复习卡都会自动更新，**不需要任何手动操作**。"

### 3. 学情可视化 — 看真实算法在跑 (50 秒)

**操作**：
- 等闭环跑完
- 点左侧 🟦 **学习仪表盘** 按钮
- 选 **"小明（演示账号）"** 作为活跃会话

**台词**：
> "这是学情仪表盘。
> 左上的**知识图谱**用拓扑分层布局，颜色代表掌握度，红色是薄弱节点。
> 右上的**BKT 热力图**显示每个知识点的答题历史，每个格子是一次答题。
> 左下的**FSRS 复习日历** — 这是 FSRS-4 论文算法，按遗忘曲线安排复习日期。
> 右下的**Trace 甘特图**是 OpenTelemetry 语义的全链路追踪，刚才的整个对话都能从 span 级回放。"

### 4. 收尾 — 多模态资源 (30 秒)

**操作**：
- 切到 🟪 **资源工坊** 页面
- 点开"机器学习个性化学习资源包"
- 展开"代码实操"看 Pyodide 沙箱
- 点"讲义音频"播放（如果配了讯飞 TTS）

**台词**：
> "最后看资源工坊。每次资源生成都会沉淀成一个**资源包**。
> 这里有讯飞 TTS 合成的讲义音频、可在浏览器里直接运行 Python 的 Pyodide 沙箱、
> 还有 Mermaid 自动生成的状态图、可下载 Word 试卷。
> **一共 8 类多模态资源**，全部由多个 Agent 并行生成。"

> "我们的演示到这里。技术细节欢迎评委追问。"

---

## 七、评委 Q&A 备答

### Q1: "你们的多智能体协同体现在哪里？"

**A**：体现在 4 个层次：
1. **Capability 级**：7 个 capability（chat / goal / learning / resource_gen / auto_tutor / debate / agentic），每个是一个独立的"智能体团队"
2. **Agent 级**：单个 capability 内部串联多个 Agent，如 goal 是 `GoalPlanner → SkillMapper → GapAnalyzer` 三 Agent 串联，resource_gen 是 5 个 Generator + KG + TTS 并行
3. **AgenticChat**：顶层 LLM **自主**决定调用哪些 capability，实现路由层智能
4. **Multi-Agent Debate**：正方 / 反方 / 裁判三角色，多轮辩论

参考论文：Du et al., *Improving Factuality and Reasoning in Language Models through Multiagent Debate* (ICML 2024)。

### Q2: "你们的画像怎么做到不少于 6 个维度还能随学随新？"

**A**：见 [`backend/services/profile/service.py`](backend/services/profile/service.py)。
- 7 个维度：`learning_goal` / `level` / `topics` / `weak_points` / `preferences` / `constraints` / `recent_intents`
- 每个维度都有**证据链**：`evidence_log` 记录每条画像值来自第几轮的哪句原话
- WebSocket 每轮都 emit `profile_update` 事件，前端实时长出新维度（橙色高亮 8 秒）
- 主题词典从 KG 节点 + 资源包历史**动态扩展**（不再硬编码）

### Q3: "BKT 和 DKT 不是一回事吗？"

**A**：不是。
- **BKT**（Bayesian Knowledge Tracing，Corbett & Anderson 1995）：每个知识点 4 参数（init/learn/slip/guess）的贝叶斯模型，可解释但假设独立
- **DKT**（Deep Knowledge Tracing，Piech et al. NeurIPS 2015）：用 RNN 建模知识点**时序依赖**，预测下一题各 KC 答对概率

ZhiPath **两个都实现了**：BKT 实时更新可解释的"掌握度"，DKT 离线训练后给出"下一题答对概率"，互相印证。BKT 用于热力图，DKT 用于推荐难度。

### Q4: "FSRS 比 SM-2 强在哪？"

**A**：FSRS-4 用 **D/S/R 三隐变量**（难度 / 稳定性 / 可提取性）建模记忆，比 SM-2 仅用"易度因子"更准确。FSRS-4 论文（Ye et al. 2023）显示 30% 学习时间节省。ZhiPath 用论文表 3 的 17 个全局优化参数，**免训练即可用**。

### Q5: "你们的'防幻觉'怎么做的？"

**A**：见 [`backend/services/guardrail/`](backend/services/guardrail/)。
1. **引用追溯**：RAG 检索片段加 `[来源 #N]` 编号，前端可点击跳转，资源包里也持久化 sources
2. **低置信度告警**：top1 相似度 < 0.35 时前端高亮"⚠ 请谨慎采用"
3. **输入侧过滤**：本地词典 + 正则识别 prompt injection / 涉政 / 学术不端
4. **代码沙箱护栏**：CodeLabGenerator 输出的 Python 经正则过滤掉 `os.system / subprocess / eval / pip install / 网络` 等危险调用
5. **Mermaid 注入护栏**：禁止 `<script>`、`click ... call` 等

### Q6: "和市面上 DeepTutor / 智谱清言学习版有什么区别？"

**A**（提前背好）：
- **算法深度**：DeepTutor / 智谱主要是 RAG + 出题，我们有 BKT / DKT / FSRS / IRT / KG 拓扑五套学术算法
- **多模态深度**：我们有讯飞 TTS 音频 + Pyodide 浏览器代码沙箱 + Mermaid 自动图表 + 知识图谱拓扑可视化
- **可观测性**：OpenTelemetry 语义的 Trace，每次对话都能甘特图回放
- **MCP Server**：ZhiPath 暴露 MCP 协议，可被 Claude Desktop 等外部 Agent 接入
- **xAPI 兼容**：教育标准化对接 (Tin Can API)

### Q7: "讯飞工具用在哪？"

**A**：
1. **讯飞星火 LLM**（OpenAI 兼容协议）：作为 ModelRouter 的 `chat` 档便宜模型 + `mermaid` 档备选
2. **讯飞超拟人 TTS**（WebSocket 协议）：资源生成时为讲义合成 MP3 音频，沉淀到资源包
3. 配置：`.env` 里设 `XF_SPARK_API_PASSWORD` + `XF_TTS_APPID/API_KEY/API_SECRET`

### Q8: "Auto-Tutor 跑一次大概多久？"

**A**：30-90 秒，取决于 LLM 提供商。每个阶段都 emit `loop_step` 事件，前端 SVG 闭环图按阶段亮起，**全程不会白屏**（流式呈现）。

### Q9: "代码量大概多少？"

**A**：
- 后端：约 90 个 Python 文件，22 个 API 路由，7 个 Capability，14 个核心 Service
- 前端：8 个独立页面，60+ React 组件
- 测试：41 个测试用例（17 个算法单测 + 24 个 E2E 集成测试），8 秒跑完

### Q10: "怎么验证你们没 bug？"

**A**：跑一行命令：
```bash
cd backend && python -m pytest tests/ -v
```
预期：`41 passed in 30s`。

---

## 八、常见故障速查

### 后端启动报 "Database session store unavailable"

**原因**：没启动 Postgres 容器。

**影响**：**没影响**。系统会自动回退到 JSON 文件存储（`backend/data/`）。

**解决**（如果想用 Postgres）：
```bash
docker run -d --name learnflow-db -p 5432:5432 \
  -e POSTGRES_USER=learnflow -e POSTGRES_PASSWORD=learnflow \
  -e POSTGRES_DB=learnflow pgvector/pgvector:pg16
```

### 后端启动报 "DEEPSEEK_API_KEY not set"

**原因**：没配 DeepSeek API key。

**解决**：在项目根目录 `E:\A3\ZhiPath\.env` 写：
```
DEEPSEEK_API_KEY=你的 deepseek 密钥
```
从 https://platform.deepseek.com/ 申请，新账户有免费额度。

### 前端打开是白屏

**症状**：http://localhost:3000/chat 一片空白。

**可能原因**：
1. 后端没启动 → 检查 http://localhost:8000/health
2. 端口被占用 → 改 frontend/next.config.ts 或 backend port
3. node_modules 没装 → `cd frontend && npm install`

### 讯飞 TTS 没声音

**症状**：资源包里没有"讲义音频"播放器。

**原因**：没配讯飞 TTS 凭据。

**解决**：在 `.env` 里加：
```
XF_TTS_APPID=...
XF_TTS_API_KEY=...
XF_TTS_API_SECRET=...
```
从 https://www.xfyun.cn/ 申请，"在线语音合成（流式版）"服务。

**降级行为**：未配置时资源生成不会失败，只是没有音频，其他资源照常输出。

### Auto-Tutor 跑了很久没反应

**正常**：30-90 秒。看右侧"通信轨迹"面板有没有新事件。

**异常**（超过 2 分钟没动静）：
1. 检查后端控制台是否报错
2. 检查 LLM API key 是否欠费
3. 取消重试：点输入框右侧红色 ⏹ 停止按钮

### 一键填充演示数据后 Dashboard 还是空的

**原因**：Dashboard 默认选第一个会话，可能不是"小明"。

**解决**：进 /dashboard 后，在"会话选择"区点 **"小明（演示账号）"**。

### Pyodide 沙箱加载慢

**症状**：点"运行"后等 10-30 秒才出结果。

**正常**：首次加载需下载 Pyodide WASM 包（CDN，约 6MB）。第二次秒级。

### 前端报 "Failed to load mermaid.js"

**原因**：CDN 被墙或无网络。

**解决**：换可用的镜像源，编辑 `frontend/components/mermaid/MermaidDiagramCard.tsx` 第 21 行的 CDN URL。

---

## 九、关键算法原理 (评委追问时用)

### BKT（贝叶斯知识追踪）

**文件**：[`backend/services/mastery/bkt.py`](backend/services/mastery/bkt.py)

**4 参数**：
- `p_init` = 0.3（先验掌握概率）
- `p_learn` = 0.15（每次练习后掌握概率提升）
- `p_slip` = 0.1（已掌握但答错）
- `p_guess` = 0.2（未掌握但猜对）

**更新公式**（答对时）：
```
posterior = prior * (1 - p_slip) / (prior * (1 - p_slip) + (1 - prior) * p_guess)
new_mastery = posterior + (1 - posterior) * p_learn
```

**论文**：Corbett & Anderson (1995), *Knowledge Tracing: Modeling the Acquisition of Procedural Knowledge*.

### DKT（深度知识追踪）

**文件**：[`backend/services/mastery/dkt.py`](backend/services/mastery/dkt.py)

**模型**：单层 GRU，输入 = (kc_one_hot, correct_one_hot)，输出 = 各 KC 答对概率。

**训练**：用 ES（Evolution Strategies）做轻量训练，40 次迭代。**纯 numpy**，无 PyTorch 依赖。

**论文**：Piech et al. (2015), *Deep Knowledge Tracing*, NeurIPS.

### FSRS-4（间隔重复）

**文件**：[`backend/services/srs/fsrs.py`](backend/services/srs/fsrs.py)

**3 隐变量**：
- D = Difficulty（难度）
- S = Stability（稳定性，记忆能保持多久）
- R = Retrievability（可提取性，现在能想起来的概率）

**目标可提取性** = 0.9（"我希望 90% 概率能想起来"），按此推算下次复习日期。

**论文**：Ye et al. (2023), *Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory*.

### IRT 2PL（自适应难度）

**文件**：[`backend/services/mastery/irt.py`](backend/services/mastery/irt.py)

**模型**：
```
P(answer correct | ability θ, item) = 1 / (1 + exp(-a * (θ - b)))
```
- θ = 学生能力
- a = 题目区分度
- b = 题目难度

**选题策略**：最大信息量 `I(θ) = a² * P(θ) * (1 - P(θ))`，在 θ ≈ b 时达到最大。

**论文**：Lord & Novick (1968), *Statistical Theories of Mental Test Scores*.

### GraphRAG（图增强检索）

**文件**：[`backend/services/rag/graph_rag.py`](backend/services/rag/graph_rag.py)

**流程**：
1. 基础语义召回 top-k chunks
2. 命中 chunk 的标签 → 映射到 KG 节点
3. KG 1-hop 邻居（前置 + 后继）也召回
4. 衰减权重重排序（邻居分数 × 0.5）

**论文**：Microsoft (2024), *GraphRAG: Unlocking LLM discovery on narrative private data*.

### SmartRetriever（多查询变体）

**文件**：[`backend/services/rag/smart_retriever.py`](backend/services/rag/smart_retriever.py)

**流程**：
1. 用便宜 LLM 生成 2 个同义变体 query
2. 每个 query 各走一遍 GraphRAG（含 KG 邻居扩展）
3. 合并去重，**多次命中的 chunk 分数加成 25%**

**和 GraphRAG 关系**：**叠加而非替换**。GraphRAG 解决"知识依赖漏召回"，SmartRetriever 解决"同义词漏召回"，两者正交。

### Multi-Agent Debate

**文件**：[`backend/capabilities/debate.py`](backend/capabilities/debate.py)

**流程**：正方一辩 → 反方一驳 → 正方二辩 → 反方二驳 → 裁判终审（流式）

**论文**：Du et al. (2024), *Improving Factuality and Reasoning in Language Models through Multiagent Debate*, ICML.

---

## 十、文件去哪里找

### "我要改 X 应该改哪里？"

| 想改 | 改这里 |
|---|---|
| 主聊天界面 | `frontend/components/chat/ChatPanel.tsx` |
| 能力下拉菜单的 pill | `frontend/components/chat/ChatPanel.tsx`（第 39 行 `capabilities` 数组）|
| 系统级提示词（chat） | `backend/capabilities/chat.py` 顶部 `SYSTEM_PROMPT` |
| 资源生成的 prompt | `backend/modules/resource_gen/prompts/*.py` |
| BKT 4 参数 | `backend/services/mastery/bkt.py` 第 27 行 `BKTParams` |
| FSRS 17 参数 | `backend/services/srs/fsrs.py` 第 31 行 `DEFAULT_PARAMS` |
| LLM 模型路由策略 | `backend/base/model_router.py` 第 36 行 `_DEFAULT_ROUTES` |
| 知识图谱种子数据 | `backend/services/demo/seed.py` 第 27 行 `DEMO_KG_NODES` |
| 演示按钮 | `frontend/components/demo/ContestDemoPanel.tsx` 第 21 行 `DEMO_RECIPES` |
| 暗色主题颜色 | `frontend/app/globals.css` 第 21 行 `:root.dark` |
| API 路由列表 | `backend/api/main.py` 第 65 行 `app.include_router(...)` |
| 评委速览页 | `docs/JUDGE_BRIEF.md` |
| 项目架构图 | `ARCHITECTURE.md` |

### 关键目录速查

```
backend/
├── api/routers/          # 所有 REST/WS 路由
├── capabilities/         # 7 个 Capability（chat/goal/learning/resource_gen/auto_tutor/debate/agentic）
├── modules/              # 单个 Agent（QuizGenerator 等）+ Prompt + Schema
├── services/             # 业务逻辑
│   ├── mastery/         # BKT / DKT / IRT
│   ├── srs/             # FSRS-4
│   ├── knowledge_graph/ # KG-DAG
│   ├── rag/             # RAG / GraphRAG / SmartRetriever
│   ├── guardrail/       # 防幻觉 / 引用追溯
│   ├── tracing/         # OTel 语义 Tracer
│   ├── experiments/     # A/B 实验框架
│   ├── xapi/            # xAPI LRS
│   ├── report/          # PDF 周报
│   ├── demo/            # 演示数据 seed
│   └── ...
├── base/                # LLMFactory / ModelRouter / iFlytek / Retry 等基础设施
├── core/                # UnifiedContext / StreamBus / Events
├── config/              # YAML 配置
├── data/                # JSON 持久化（Postgres 不可用时回退到这里）
└── tests/               # pytest 测试
    ├── test_algorithms.py   # 17 个算法单测
    ├── test_e2e_api.py      # 24 个 E2E 集成测试
    └── test_smoke.py        # 原有冒烟测试

frontend/
├── app/                 # Next.js 页面
│   ├── chat/           # 主聊天页
│   ├── dashboard/      # 学情仪表盘
│   ├── classroom/      # 班级视图
│   ├── profile/        # 学习者画像
│   ├── path/           # 学习路径
│   ├── knowledge/      # 知识库
│   ├── resources/      # 资源工坊
│   └── overview/       # 系统总览
├── components/
│   ├── chat/           # 聊天主组件
│   ├── agent/          # 多智能体可视化
│   ├── dashboard/      # 仪表盘组件（热力图/日历/甘特图）
│   ├── kg/             # 知识图谱可视化
│   ├── mermaid/        # Mermaid 图渲染
│   ├── code_lab/       # Pyodide 沙箱
│   ├── voice/          # Web Speech API 语音输入
│   ├── pomodoro/       # 番茄钟
│   ├── theme/          # 主题切换
│   ├── ui/             # ErrorBoundary / Toast 等
│   └── ...
├── context/             # React Context（全局聊天状态）
└── lib/                 # api.ts / ws.ts
```

---

## 附录 A: 环境变量完整清单

在项目根目录 `E:\A3\ZhiPath\.env` 配置（或导入到系统环境）：

```bash
# ----- 必配（至少一个 LLM）-----
DEEPSEEK_API_KEY=                 # https://platform.deepseek.com (推荐主用)
DASHSCOPE_API_KEY=                # 通义千问，https://dashscope.aliyun.com
SILICONFLOW_API_KEY=              # 智谱 GLM / Kimi K2，https://siliconflow.cn

# ----- 赛题硬性要求（讯飞）-----
XF_SPARK_API_PASSWORD=            # 讯飞星火 OpenAI 兼容 SDK key
XF_TTS_APPID=                     # 讯飞 TTS APPID
XF_TTS_API_KEY=                   # 讯飞 TTS APIKey
XF_TTS_API_SECRET=                # 讯飞 TTS APISecret

# ----- 可选 -----
DATABASE_URL=postgresql+asyncpg://learnflow:learnflow@localhost:5432/learnflow
# 不设的话会自动回退到 backend/data/ JSON 文件存储
```

**注意**：所有讯飞 / 数据库相关都是**可选**的，未配置时系统优雅降级。

---

## 附录 B: API 路由完整列表

后端启动后访问 http://localhost:8000/docs 可看 Swagger UI 在线试用。

### 基础

| 路由 | 方法 | 说明 |
|---|---|---|
| `/health` | GET | 健康检查 + 能力列表 |
| `/api/v1/capabilities` | GET | 所有能力清单 |
| `/api/v1/router` | GET | 多模型路由表 + 最近 50 次决策 |

### 演示

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/v1/demo/seed` | POST | 一键填充演示数据 |
| `/api/v1/demo/info` | GET | 演示账号信息 |

### 会话 / 消息 / 画像 / 记忆

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/v1/sessions` | GET/POST/DELETE | 会话 CRUD |
| `/api/v1/sessions/{sid}` | GET | 会话详情 |
| `/api/v1/profile/{sid}` | GET | 学习者画像 |
| `/api/v1/profile/{sid}/evidence` | GET | 画像证据链 |
| `/api/v1/memory/{sid}` | GET/POST | 长期记忆 |

### 知识库 + 知识图谱

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/v1/knowledge/documents` | GET/POST | 知识库文档管理 |
| `/api/v1/knowledge/search` | GET | RAG 检索 |
| `/api/v1/kg/{sid}` | GET | 知识图谱 |
| `/api/v1/kg/{sid}/topo_order` | GET | 拓扑排序 |
| `/api/v1/kg/{sid}/suggest` | GET | 推荐下一步学什么 |

### 学情追踪

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/v1/mastery/{sid}` | GET | BKT 掌握度快照 |
| `/api/v1/mastery/{sid}/focus` | GET | 薄弱知识点 TOP |
| `/api/v1/dkt/{sid}/fit` | POST | 训练 DKT 并预测 |
| `/api/v1/irt/{sid}/ability` | GET | IRT ability 估计 |
| `/api/v1/review/{sid}/calendar` | GET | FSRS 复习日历 |
| `/api/v1/review/{sid}/due` | GET | 到期卡片 |
| `/api/v1/review/{sid}/cards/{cid}/rate` | POST | 评级一张卡 |

### 资源 / 测验 / 试卷

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/v1/resources` | GET | 资源包列表 |
| `/api/v1/resources/session/{sid}/latest` | GET | 最新资源包 |
| `/api/v1/quiz/{sid}/latest` | GET | 最新测验 |
| `/api/v1/quiz/submit` | POST | 提交答案 |
| `/api/v1/exams/session/{sid}/latest` | GET | 最新试卷 |
| `/api/v1/exams/{eid}/docx` | GET | 试卷 Word 下载 |
| `/api/v1/exams/{eid}/print` | GET | 试卷打印预览 |

### 教师场景

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/v1/classroom/overview` | GET | 班级聚合数据 |
| `/api/v1/classroom/leaderboard` | GET | 学习榜单 |
| `/api/v1/classroom/export.csv` | GET | CSV 导出 |
| `/api/v1/classroom/export.json` | GET | JSON 导出 |
| `/api/v1/report/{sid}/weekly.pdf` | GET | PDF 周报下载 |

### 工程基础设施

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/v1/trace` | GET | trace 列表 |
| `/api/v1/trace/{tid}` | GET | trace 详情（spans）|
| `/api/v1/experiments` | GET | A/B 实验清单 |
| `/api/v1/experiments/observe` | POST | 写一次实验观测 |
| `/api/v1/feedback/message` | POST | RLHF 学生反馈 |
| `/api/v1/study/pomodoro` | POST | 番茄钟记录 |
| `/api/v1/study/{sid}/stats` | GET | 学习时长统计 |
| `/api/v1/xapi/statements` | POST | 写 xAPI Statement |
| `/api/v1/xapi/{sid}/statements` | GET | 查 xAPI 历史 |
| `/api/v1/xapi/{sid}/export.jsonl` | GET | xAPI 标准导出 |
| `/api/v1/mcp/` | POST | MCP JSON-RPC |
| `/api/audio/{filename}` | GET | 讯飞 TTS 音频文件 |

### WebSocket

| 路由 | 协议 | 说明 |
|---|---|---|
| `/api/v1/ws` | WebSocket | 聊天主入口（流式）|

---

## 附录 C: 论文参考文献

ZhiPath 实现的所有算法均有论文依据：

1. **BKT**：Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. *User Modeling and User-Adapted Interaction*, 4(4), 253-278.

2. **DKT**：Piech, C., Bassen, J., Huang, J., Ganguli, S., Sahami, M., Guibas, L. J., & Sohl-Dickstein, J. (2015). Deep knowledge tracing. *NeurIPS*.

3. **FSRS-4**：Ye, J., Su, J., & Cao, Y. (2023). Optimizing spaced repetition schedule by capturing the dynamics of memory. *KDD*.

4. **IRT 2PL**：Lord, F. M., & Novick, M. R. (1968). *Statistical theories of mental test scores*. Addison-Wesley.

5. **Multi-Agent Debate**：Du, Y., Li, S., Torralba, A., Tenenbaum, J. B., & Mordatch, I. (2024). Improving factuality and reasoning in language models through multiagent debate. *ICML*.

6. **GraphRAG**：Edge, D., Trinh, H., Cheng, N., Bradley, J., Chao, A., Mody, A., ... & Larson, J. (2024). From local to global: A graph RAG approach to query-focused summarization. *Microsoft Research Technical Report*.

7. **ReAct**（AgenticChat 工具调用模式）：Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2023). ReAct: Synergizing reasoning and acting in language models. *ICLR*.

8. **xAPI 标准**：ADL (2013). *Experience API (xAPI) Specification v1.0.3*. https://github.com/adlnet/xAPI-Spec

9. **OpenTelemetry**：CNCF. *OpenTelemetry Semantic Conventions*. https://opentelemetry.io/docs/specs/semconv/

---

## 最后：答辩前 24 小时检查清单

- [ ] `python -m pytest backend/tests/` 全绿
- [ ] 后端启动看到 `7 capabilities registered`
- [ ] 前端能打开 /chat
- [ ] 点"一键填充演示数据"成功
- [ ] 走一遍第六节的演示脚本，时长控制在 3 分钟
- [ ] /dashboard 各图表都有数据
- [ ] /classroom 能下载 CSV
- [ ] 试一次 PDF 周报下载（http://localhost:8000/api/v1/report/demo_session_xiaoming/weekly.pdf）
- [ ] 检查 .env 里 LLM API key 余额充足
- [ ] 备好第二台机器作为 backup（万一现场网炸）
- [ ] 录一份本地视频作为备份（万一现场啥都炸）

**祝答辩顺利。**

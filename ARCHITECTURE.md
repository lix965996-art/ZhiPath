# ZhiPath 项目架构说明

> **项目名称**: ZhiPath - 个性化资源生成与学习多智能体系统
> **赛题**: 2026中国软件杯 A3赛题
> **技术栈**: Python FastAPI + Next.js + PostgreSQL(pgvector)

---

## 一、项目总体架构

ZhiPath 是一个**多智能体协作的闭环学习系统**。整个系统由三层构成：

- **前端**（Next.js 15 + React 19 + Tailwind CSS）：负责用户交互、实时消息流、多智能体工作流可视化
- **后端**（Python FastAPI）：核心业务逻辑，包含编排器、智能体、能力处理器、RAG检索、数据服务
- **数据层**（PostgreSQL + pgvector）：持久化存储会话、学习者画像、知识库、试卷、测验、资源包

### 核心工作流程

用户发送消息 → WebSocket 接收 → 编排器(Orchestrator)识别意图(Intent) → 分配对应能力处理器(Capability) → 能力处理器调用一个或多个智能体(Agent) → 智能体通过LLM生成结果 → 结果通过 StreamBus 实时流式推送 → 前端WebSocket接收并渲染

### 闭环学习机制

1. 用户设定学习目标 → 系统诊断技能差距
2. 生成学习者画像 → 规划学习路径
3. 基于RAG知识库生成学习资源（知识点+测验+闪卡+思维导图+试卷）
4. 用户做测验 → 系统给出反馈和补救计划 → 更新画像中的薄弱点
5. 基于新画像重新规划路径 → 循环迭代

---

## 二、项目目录结构

```
ZhiPath/
├── backend/                    # 后端 (Python FastAPI)
│   ├── api/                   # API路由层
│   │   ├── main.py            #   路由注册 + CORS中间件
│   │   └── routers/           #   各功能路由
│   ├── base/                  # 基础设施层（Agent基类、LLM工厂、RAG搜索）
│   ├── capabilities/           # 能力处理器（意图路由后的具体执行逻辑）
│   ├── config/                # 配置加载（YAML + 环境变量）
│   ├── core/                  # 核心数据模型（上下文、事件、事件总线）
│   ├── modules/               # 功能模块（智能体 + 提示词 + 数据模型）
│   ├── runtime/               # 运行时（编排器、能力注册表）
│   ├── services/               # 数据服务层（数据库CRUD）
│   ├── tests/                  # 测试
│   └── utils/                  # 工具函数
├── frontend/                   # 前端 (Next.js)
│   ├── app/                    # 页面路由
│   ├── components/             # 组件
│   │   ├── agent/              #   多智能体工作流可视化
│   │   ├── brand/              #   品牌标识
│   │   ├── chat/               #   聊天界面
│   │   ├── demo/               #   演示面板
│   │   ├── exam/               #   试卷展示
│   │   ├── knowledge/          #   知识库管理
│   │   ├── overview/           #   系统总览
│   │   ├── path/               #   学习路径
│   │   ├── profile/            #   学习者画像
│   │   ├── quiz/               #   测验组件
│   │   ├── resources/          #   资源包
│   │   └── visual/             #   学习闭环可视化
│   ├── context/               # React状态管理
│   └── lib/                    # 客户端库（API + WebSocket）
├── docker-compose.yml          # Docker编排（backend + frontend + postgres）
├── .env                        # 环境变量配置
└── docs/                       # 文档
```

---

## 三、后端详解

### 3.1 入口与配置

| 文件 | 功能 |
|------|------|
| `backend/main.py` | FastAPI应用入口。创建app实例，配置CORS，在lifespan中初始化数据库连接和配置，挂载所有API路由。系统启动的第一个文件。 |
| `backend/bootstrap_env.py` | 环境引导。加载`.env`文件中的环境变量，设置`PYTHONPATH`，确保项目根目录在Python搜索路径中。main.py启动时最先调用。 |
| `backend/config/default.yaml` | 默认配置文件。定义LLM模型名称(deepseek-chat)、数据库连接信息、RAG检索参数等所有系统默认值。 |
| `backend/config/schemas.py` | Pydantic配置模型。定义`LLMSettings`、`DatabaseSettings`、`RAGSettings`、`AppSettings`等配置数据结构，提供类型安全的配置访问。 |
| `backend/config/loader.py` | 配置加载器。先加载`default.yaml`，再用环境变量覆盖（如`OPENAI_API_KEY`、`OPENAI_BASE_URL`）。`get_settings()`是全局获取配置的唯一入口。 |
| `backend/pyproject.toml` | Python项目元数据和依赖声明。项目名`learnflow-backend`。 |
| `backend/requirements.txt` | Python依赖清单。核心依赖：fastapi、uvicorn、langchain、asyncpg、pgvector、pydantic、python-docx等。 |

### 3.2 核心层（core/）

| 文件 | 功能 |
|------|------|
| `backend/core/context.py` | 会话上下文数据模型。`SessionContext`是一个dataclass，包含session_id、学习者画像(profile)、学习路径(learning_path)、记忆(memory)、事件总线(stream_bus)。贯穿整个编排流程，所有能力和智能体共享这个上下文。 |
| `backend/core/events.py` | 事件类型定义。`EventType`枚举定义了所有流式事件类型：`content`(文本内容)、`thinking`(思考过程)、`error`(错误)、`done`(完成)、`capability_start`(能力开始)、`stage_start/stage_end`(阶段开始/结束)、`tool_call/tool_result`(工具调用/结果)。前端根据事件类型渲染不同UI。 |
| `backend/core/stream_bus.py` | 异步事件总线。`StreamBus`类维护一个订阅者列表(每个订阅者一个asyncio.Queue)。`emit()`将事件广播给所有订阅者，`subscribe()`注册订阅者。是LLM流式输出连接到WebSocket的桥梁。 |

### 3.3 基础设施层（base/）

| 文件 | 功能 |
|------|------|
| `backend/base/base_agent.py` | **所有智能体的父类**。`BaseAgent`封装了LangChain Chat模型的调用：`invoke()`(同步调用)、`ainvoke()`(异步调用)、`astream()`(流式调用)。内置`jsonalize_output`功能，自动将LLM的文本输出解析为JSON。所有modules/下的智能体都继承这个类。 |
| `backend/base/llm_factory.py` | LLM工厂。`create_chat_model()`创建对话模型，`create_embeddings()`创建向量模型。都基于LangChain的OpenAI兼容接口，从config中读取API Key和Base URL。支持任何OpenAI格式的API（如DeepSeek、硅基流动等）。 |
| `backend/base/search_rag.py` | RAG搜索管理器。`SearchRagManager`的`search()`方法封装了查询改写(query rewriting) + 混合检索(hybrid search)。被聊天能力和资源生成能力调用，为智能体提供知识库上下文。 |

### 3.4 运行时编排层（runtime/）

| 文件 | 功能 |
|------|------|
| `backend/runtime/orchestrator.py` | **系统的核心——编排器**。`Orchestrator`类的`process_turn()`方法是所有用户消息的入口。流程：①接收消息和SessionContext → ②调用`detect_intent()`识别意图 → ③从注册表查找对应能力处理器 → ④调用能力处理器的`execute()` → ⑤流式返回结果。是整个后端最关键的文件。 |
| `backend/runtime/registry.py` | 能力注册表。`CapabilityRegistry`维护一个`Intent → Capability类`的映射字典。编排器通过注册表查找意图对应的处理器。启动时注册所有能力（CHAT、GOAL_DIAGNOSIS、LEARNING_PATH、RESOURCE_GENERATION、ENGINEERING_TRACE）。 |

### 3.5 能力处理器层（capabilities/）

能力处理器是编排器和智能体之间的桥梁，负责将一个用户意图拆解为多步智能体调用。

| 文件 | 功能 |
|------|------|
| `capabilities/__init__.py` | **意图检测 + Intent枚举**。定义了5种意图：`CHAT`(日常聊天)、`GOAL_DIAGNOSIS`(目标诊断)、`LEARNING_PATH`(学习路径)、`RESOURCE_GENERATION`(资源生成)、`ENGINEERING_TRACE`(工程追溯)。`detect_intent()`函数根据用户消息关键词分类意图。 |
| `capabilities/base.py` | 能力处理器抽象基类。`BaseCapability`是ABC，定义了`execute()`方法接口。所有能力处理器继承此类。 |
| `capabilities/chat.py` | 聊天能力处理器。处理`CHAT`意图，调用`AITutorChatbot`智能体进行对话，配合RAG搜索提供知识库增强的回答。 |
| `capabilities/goal.py` | **目标诊断能力处理器（最复杂的能力之一）**。处理`GOAL_DIAGNOSIS`意图，按顺序执行5个智能体：①学习目标细化器(`LearningGoalRefiner`) → ②技能差距识别器(`SkillGapIdentifier`) → ③技能需求映射器(`SkillRequirementMapper`) → ④自适应画像分析器(`AdaptiveLearnerProfiler`) → ⑤学习路径规划器(`LearningPathScheduler`)。每个智能体的输出作为下一个的输入。 |
| `capabilities/learning.py` | 学习路径能力处理器。处理`LEARNING_PATH`意图，支持两种操作：重新规划路径(reschedule)和学习反思(reflexion)。 |
| `capabilities/resource_gen.py` | **资源生成能力处理器（最复杂的能力之二）**。处理`RESOURCE_GENERATION`意图，按顺序执行：①提取知识点 → ②生成大纲 → ③生成学习内容 → ④生成测验题 → ⑤生成闪卡 → ⑥生成思维导图 → ⑦保存资源包 → ⑧生成试卷。每一步都会通过StreamBus实时推送进度。 |
| `capabilities/llm_capability.py` | LLM流式响应工具。`_stream_llm_response()`函数从LLM流式输出中提取`<think)>...</think)>`标签包裹的思考过程（显示为"思考中"），然后将正文内容通过StreamBus推送。被多个能力处理器共用。 |
| `capabilities/engineering_trace.py` | 工程追溯能力处理器。处理`ENGINEERING_TRACE`意图，记录智能体决策过程，用于展示系统的可解释性。 |

### 3.6 功能模块层（modules/）

每个模块包含：智能体(agents/) + 提示词(prompts/) + 数据模型(schemas/)。

#### 3.6.1 chat_tutor（聊天辅导模块）

| 文件 | 功能 |
|------|------|
| `modules/chat_tutor/agents/tutor_chatbot.py` | AI导师聊天机器人。`AITutorChatbot`继承`BaseAgent`，是唯一一个设置`jsonalize_output=False`的智能体（返回自由文本而非JSON）。接收RAG检索结果和学习者画像作为上下文，生成对话式回答。 |
| `modules/chat_tutor/prompts/tutor_chatbot.py` | AI导师的系统提示词。定义导师的角色设定、回答风格、如何引用知识库、如何基于画像个性化回答等指令。 |

#### 3.6.2 skill_gap（技能差距分析模块）

| 文件 | 功能 |
|------|------|
| `modules/skill_gap/agents/learning_goal_refiner.py` | 学习目标细化智能体。`LearningGoalRefiner`接收用户原始目标，将其细化为具体、可衡量的学习目标。 |
| `modules/skill_gap/agents/skill_gap_identifier.py` | 技能差距识别智能体。`SkillGapIdentifier`分析细化后的目标，识别用户当前技能与目标之间的差距。 |
| `modules/skill_gap/agents/skill_requirement_mapper.py` | 技能需求映射智能体。`SkillRequirementMapper`将技能差距映射为具体的学习需求（需要学什么、学到什么程度）。 |
| `modules/skill_gap/prompts/learning_goal_refiner.py` | 目标细化智能体的系统提示词。 |
| `modules/skill_gap/prompts/skill_gap_identifier.py` | 技能差距识别智能体的系统提示词。 |
| `modules/skill_gap/prompts/skill_requirement_mapper.py` | 技能需求映射智能体的系统提示词。 |
| `modules/skill_gap/schemas.py` | 技能差距相关数据模型。`SkillGap`(技能差距项)和`SkillRequirement`(技能需求项)的Pydantic模型。 |

#### 3.6.3 learner_profile（学习者画像模块）

| 文件 | 功能 |
|------|------|
| `modules/learner_profile/agents/adaptive_profiler.py` | 自适应学习者画像分析器。`AdaptiveLearnerProfiler`通过对话内容和测验表现，用LLM分析用户的学习特征：认知状态、学习偏好、行为模式等。生成深度的学习者画像。 |
| `modules/learner_profile/prompts/adaptive_profiler.py` | 画像分析器的系统提示词。 |
| `modules/learner_profile/schemas.py` | **学习者画像数据模型**。`LearnerProfile`包含：learning_goal(学习目标)、level(水平)、topics(主题)、weak_points(薄弱点)、preferences(偏好)、constraints(约束)、cognitive_status(认知状态)、learning_preferences(学习偏好)、behavioral_patterns(行为模式)、recent_intents(近期意图)、quiz_accuracy(测验准确率)、turn_count(对话轮次)。是整个系统最核心的数据模型之一。 |

#### 3.6.4 learning_path（学习路径规划模块）

| 文件 | 功能 |
|------|------|
| `modules/learning_path/agents/path_scheduler.py` | 学习路径规划智能体。`LearningPathScheduler`支持3种任务模式：`create`(创建新路径)、`reflexion`(学习反思)、`reschedule`(重新规划)。生成包含1-10个学习阶段(SessionItem)的路径。 |
| `modules/learning_path/prompts/path_scheduler.py` | 路径规划智能体的系统提示词。包含3种任务模式对应的提示词模板。 |
| `modules/learning_path/schemas.py` | 学习路径数据模型。`SessionItem`(学习阶段，含if_learned是否已学标志、associated_skills关联技能)、`LearningPath`(学习路径，包含1-10个SessionItem)、题目类型、内容类型枚举。 |

#### 3.6.5 resource_gen（资源生成模块）

| 文件 | 功能 |
|------|------|
| `modules/resource_gen/agents/quiz_generator.py` | 测验题目生成智能体。`QuizGenerator`基于知识点生成单选、多选、判断、简答题。 |
| `modules/resource_gen/agents/flashcard_generator.py` | 闪卡生成智能体。`FlashcardGenerator`基于知识点生成正反面闪卡，用于间隔重复记忆。 |
| `modules/resource_gen/agents/mindmap_generator.py` | 思维导图生成智能体。`MindMapGenerator`基于知识点生成结构化思维导图数据（节点+连接关系）。 |
| `modules/resource_gen/prompts/quiz_generator.py` | 测验生成的系统提示词。 |
| `modules/resource_gen/prompts/flashcard_generator.py` | 闪卡生成的系统提示词。 |
| `modules/resource_gen/prompts/mindmap_generator.py` | 思维导图生成的系统提示词。 |
| `modules/resource_gen/schemas.py` | 资源生成数据模型。`LearningContent`(学习内容)、`Quiz`(测验)、`Flashcard`(闪卡)、`MindMap`(思维导图)、`ResourcePackage`(资源包，包含以上所有内容的集合)。 |

### 3.7 API路由层（api/）

| 文件 | 功能 |
|------|------|
| `api/main.py` | 路由注册中心。创建APIRouter，挂载所有子路由（sessions、profile、memory、knowledge、resources、exams、quiz、ws），统一挂载到FastAPI app的`/api`前缀下。 |
| `api/routers/ws.py` | **WebSocket端点（最核心的路由）**。`/api/ws/chat`端点处理所有聊天交互。流程：①接收客户端WebSocket连接 → ②自动创建/加载会话 → ③加载学习者画像和记忆 → ④构建SessionContext → ⑤调用编排器`process_turn()` → ⑥将StreamBus事件实时推送给客户端 → ⑦保存消息记录。支持流式打字效果。 |
| `api/routers/sessions.py` | 会话管理路由。`GET /api/sessions`获取会话列表，`POST /api/sessions`创建新会话，`GET /api/sessions/{id}`获取单个会话详情，`DELETE /api/sessions/{id}`删除会话。 |
| `api/routers/profile.py` | 学习者画像路由。`GET /api/sessions/{id}/profile`获取指定会话的学习者画像数据。 |
| `api/routers/memory.py` | 记忆管理路由。`GET /api/sessions/{id}/memory`读取长期记忆，`POST /api/sessions/{id}/memory`写入/更新记忆。 |
| `api/routers/knowledge.py` | 知识库管理路由。`GET /api/knowledge`获取知识文档列表，`POST /api/knowledge`上传新文档，`GET /api/knowledge/search`搜索知识库（调用RAG）。 |
| `api/routers/resources.py` | 资源包路由。`GET /api/sessions/{id}/resources`获取会话的所有资源包，`GET /api/resources/{id}`获取单个资源包详情。 |
| `api/routers/exams.py` | **试卷管理路由**。`GET /api/sessions/{id}/exams`获取会话的所有试卷，`GET /api/exams/{id}/docx`导出试卷为Word文档，`GET /api/exams/{id}/print`获取试卷打印预览数据。 |
| `api/routers/quiz.py` | 测验路由。`POST /api/sessions/{id}/quiz`提交测验答案，触发LLM生成反馈和补救计划。 |

### 3.8 数据服务层（services/）

| 文件 | 功能 |
|------|------|
| `services/database.py` | 数据库连接管理。使用asyncpg创建PostgreSQL连接池。`get_pool()`获取连接池，`close_pool()`关闭连接池，`get_connection()`获取单个连接。应用启动时初始化，关闭时释放。 |
| `services/models.py` | **数据库建表DDL**。`create_tables()`创建8张表：sessions(会话)、messages(消息)、profiles(画像)、knowledge_docs(知识文档)、knowledge_chunks(知识分块，pgvector向量列)、exam_papers(试卷)、quiz_submissions(测验提交)、resource_packages(资源包)。系统启动时自动执行。 |
| `services/session/store.py` | 会话数据存储。`SessionStore`类提供会话的完整生命周期管理：创建会话、查询会话列表、保存消息、查询消息历史、更新会话标题等。被WebSocket路由和会话路由共同使用。 |
| `services/memory/service.py` | 记忆服务。`MemoryService`类管理长期记忆的读写。将会话中的关键信息（学习进度、重要发现）持久化，下次对话时作为上下文加载。 |
| `services/profile/service.py` | **学习者画像服务（核心服务）**。`LearningProfileService`采用双模式画像提取：①确定性提取（`_extract_topics()`从对话中提取主题、`_infer_level()`推断水平等，速度快）②LLM深度画像（调用`AdaptiveLearnerProfiler`智能体进行全面分析，深度高）。被目标诊断能力和画像路由共同使用。 |
| `services/rag/pipeline.py` | **RAG检索管道（最核心的服务之一）**。`RAGPipeline`实现完整的RAG流程：`ingest_document()`将文档切分为chunks，调用Embedding模型生成向量，存入PostgreSQL(pgvector)；`search()`执行混合检索——pgvector语义相似度 + pg_trgm关键词匹配，取Top-K结果。为聊天和资源生成提供知识支撑。 |
| `services/rag/embeddings.py` | 向量嵌入服务。`EmbeddingService`封装text-embedding-3-small模型，将文本转为向量。被RAG管道调用。 |
| `services/exam/store.py` | 试卷存储服务。`ExamStore`类管理试卷的创建、查询、更新。支持按会话查询、按ID获取详情。 |
| `services/exam/docx_export.py` | 试卷Word导出。`export_exam_to_docx()`使用python-docx库将试卷数据导出为格式化的Word文档。设置中文字体、标题样式、题目编号、答案区域等。 |
| `services/quiz/quiz_store.py` | 测验存储服务。`QuizStore`类持久化测验提交记录（题目、答案、正确答案）。 |
| `services/quiz/feedback_service.py` | **测验反馈服务**。`QuizFeedbackService.generate_feedback()`调用LLM分析用户的测验答案：逐题生成反馈（为什么对/错）、计算准确率、识别错题集中的知识点、生成补救计划（补救策略、目标主题、错误模式、后续任务）。反馈结果更新学习者画像的薄弱点。 |
| `services/resource_package/store.py` | 资源包存储服务。`ResourcePackageStore`类管理资源包的完整生命周期：创建、查询、更新。资源包包含学习内容、测验、闪卡、思维导图等所有生成资源。 |

### 3.9 工具与测试

| 文件 | 功能 |
|------|------|
| `utils/llm_output.py` | **LLM输出JSON解析器**。`parse_json_from_llm_output()`从LLM的文本输出中提取JSON。支持多种格式：markdown代码块包裹的JSON、带尾部逗号的不规范JSON、部分JSON等。是所有需要结构化输出的智能体的基础工具。 |
| `tests/conftest.py` | 测试配置。提供测试用的event_loop、mock LLM（mock invoke/ainvoke/astream方法）、测试session_id等fixture。 |
| `tests/test_smoke.py` | 冒烟测试。测试SessionStore接口、MemoryService接口、LearningProfileService提取方法、StreamBus事件、各模块schema验证。确保核心接口正常。 |

---

## 四、前端详解

### 4.1 配置

| 文件 | 功能 |
|------|------|
| `frontend/package.json` | 前端依赖配置。核心依赖：Next.js 15、React 19、lucide-react(图标)、react-markdown(Markdown渲染)、remark-gfm(GitHub风格Markdown)。 |
| `frontend/tsconfig.json` | TypeScript配置。ES2017目标、严格模式、`@/*`路径别名映射到项目根目录。 |
| `frontend/next.config.ts` | Next.js配置。将所有`/api/*`请求代理到`http://localhost:8000/api/*`（后端服务）。 |
| `frontend/tailwind.config.ts` | Tailwind CSS配置。指定content路径包含app/、components/、context/目录。 |
| `frontend/postcss.config.mjs` | PostCSS配置。使用tailwindcss + autoprefixer插件。 |

### 4.2 页面路由（app/）

| 文件 | 功能 |
|------|------|
| `app/layout.tsx` | 根布局。设置语言为zh-CN（中文），metadata标题"ZhiPath - 个性化资源生成与学习多智能体系统"。包裹所有页面。 |
| `app/template.tsx` | 页面过渡模板。添加`lf-page-transition` CSS类实现页面切换动画。 |
| `app/page.tsx` | 入口页面。直接重定向到`/chat`。 |
| `app/globals.css` | **全局样式（约360行）**。定义了整个设计系统的CSS变量（Apple风格浅色主题）、动画（页面进入、智能体工作流、思考旋转、消息进入、资源扫入）、滚动条样式、`.learnflow-prose` Markdown样式、`.lf-lift`悬浮效果等。 |
| `app/chat/page.tsx` | 聊天页面。渲染`ChatPanel`组件，是用户的主要交互入口。 |
| `app/overview/page.tsx` | 系统总览页面。渲染`SystemOverview`组件，展示多智能体系统架构。 |
| `app/profile/page.tsx` | 学习者画像页面。渲染`LearnerProfileDashboard`组件。 |
| `app/path/page.tsx` | 学习路径页面。渲染`LearningPathTimeline`组件。 |
| `app/knowledge/page.tsx` | 知识库管理页面。渲染`KnowledgeBasePanel`组件。 |
| `app/resources/page.tsx` | 资源工坊页面。渲染`ResourceWorkshop`组件。 |

### 4.3 状态管理（context/）

| 文件 | 功能 |
|------|------|
| `context/ChatContext.tsx` | **全局聊天状态管理（约520行，前端最核心的文件）**。使用`useReducer`管理20+种action类型的聊天状态。核心状态包括：messages(消息列表)、streaming(是否正在流式输出)、agentNodes(智能体工作流节点状态)、quizData(测验数据)、examData(试卷数据)、resourcePackage(资源包数据)。管理WebSocket生命周期（连接、断线重连、心跳检测30秒）。处理StreamBus的各种事件类型。包含120秒超时处理。当`done`事件触发时，自动拉取测验、试卷、资源包数据。`useChat()`hook供所有组件使用。 |

### 4.4 聊天组件（components/chat/）

| 文件 | 功能 |
|------|------|
| `components/chat/ChatPanel.tsx` | **主聊天界面（约630行，前端最复杂的组件）**。包含：左侧边栏（会话列表、能力选择器、知识库状态）、中间消息列表（带流式指示器）、底部输入框、右侧面板（AgentWorkflowGraph工作流图、能力状态面板）、ContestDemoPanel演示面板。是ChatProvider的包装器。 |
| `components/chat/MessageBubble.tsx` | 消息气泡组件。渲染每条消息：支持Markdown渲染（代码块带复制按钮和语法高亮）、工程追溯(thinking)内容展示、内嵌测验(QuizCard)、消息进入动画。区分用户消息和AI消息。 |
| `components/chat/ChatInput.tsx` | 聊天输入框。包含文本输入区域和能力选择下拉菜单（CapabilityOption），用户可以手动选择意图类型。 |

### 4.5 多智能体可视化（components/agent/）

| 文件 | 功能 |
|------|------|
| `components/agent/AgentWorkflowGraph.tsx` | **多智能体工作流可视化图（约490行）**。用SVG绘制6个节点的工作流图：编排器(Orchestrator) → RAG检索 → 画像分析 → 路径规划 → 资源生成 → 反馈。节点有不同状态（待处理、进行中、已完成、错误），用颜色和动画表示。节点间用贝塞尔曲线连接，边上显示数据流向。支持事件时间线。展示在聊天右侧面板和系统总览页。 |

### 4.6 学习闭环可视化（components/visual/）

| 文件 | 功能 |
|------|------|
| `components/visual/LearningLoopVisual.tsx` | **学习闭环五边形可视化（约280行）**。SVG绘制的5节点闭环图：目标→画像→检索→资源→反馈，用流动渐变色动画描边表示学习循环。中心有核心hub。支持自动旋转和阶段感知状态（根据当前学习阶段高亮对应节点）。展示在聊天空白状态的欢迎页。 |

### 4.7 学习者画像组件（components/profile/）

| 文件 | 功能 |
|------|------|
| `components/profile/LearnerProfileDashboard.tsx` | **学习者画像仪表盘（约470行）**。包含会话选择器、画像评分展示（目标/主题/薄弱点/偏好/反馈5个维度分数）、雷达图(ProfileRadar)、标签面板（弱项标签、推荐主题标签、补救任务标签）、下一步行动建议。 |
| `components/profile/ProfileRadar.tsx` | SVG雷达图。6轴雷达图展示学习者画像的6个维度：目标/主题/弱项/偏好/反馈/约束。根据画像数据动态调整各轴长度。 |

### 4.8 学习路径组件（components/path/）

| 文件 | 功能 |
|------|------|
| `components/path/LearningPathTimeline.tsx` | **学习路径时间线（约430行）**。展示6个阶段：目标诊断→基础补齐→薄弱点训练→资源生成→测验反馈→迭代。每个阶段是一个`PathStageCard`，根据学习者画像和资源包数据动态构建，显示各阶段的学习内容和完成状态。 |

### 4.9 资源与测验组件（components/resources/、quiz/、exam/）

| 文件 | 功能 |
|------|------|
| `components/resources/ResourceWorkshop.tsx` | 资源工坊。资源包浏览器，支持列表视图和详情视图切换。展示资源包中包含的学习内容、测验、闪卡、思维导图。 |
| `components/resources/ResourcePackageCard.tsx` | 资源包卡片。支持紧凑模式和完整模式，展示资源包标题、描述，提供Word和PDF下载链接。在聊天消息和资源页面中展示。 |
| `components/resources/ResourceMindMap.tsx` | 思维导图可视化。SVG渲染的径向思维导图，根据资源包中的MindMap数据动态布局节点和连线。在资源详情页展示。 |
| `components/quiz/QuizCard.tsx` | **交互式测验组件（约220行）**。支持4种题型：单选题、多选题、判断题、简答题。用户选择答案后提交，显示对错结果和正确答案。内嵌在MessageBubble中。 |
| `components/quiz/QuizFeedback.tsx` | 测验反馈展示。显示准确率进度条、错题知识点标签、补救计划详情（包含策略、目标主题、错误模式、后续任务）。在测验提交后展示。 |
| `components/exam/ExamResourceCard.tsx` | 试卷卡片。展示试卷标题、题目数、下载按钮（Word格式）。在资源生成完成后展示。 |

### 4.10 知识库与品牌组件

| 文件 | 功能 |
|------|------|
| `components/knowledge/KnowledgeBasePanel.tsx` | 知识库管理面板。支持搜索文档、文档列表展示、添加新文档（表单上传）。调用后端知识库API。 |
| `components/brand/BrandMark.tsx` | 品牌标识组件。4种变体：logo(主logo)、assistant(AI助手头像)、user(用户头像)、input(输入框图标)。在UI各处作为头像/图标使用。 |
| `components/demo/ContestDemoPanel.tsx` | 比赛演示面板。包含预定义的演示提示词(contestDemoPrompt)，点击后自动发送演示对话。用于比赛展示。 |

### 4.11 客户端库（lib/）

| 文件 | 功能 |
|------|------|
| `lib/api.ts` | **REST API客户端（约300行）**。定义了所有TypeScript类型（LearningProfile、SessionSummary、QuizData、ExamData、LearningResourcePackage等），以及所有REST API的fetch封装函数：`getLearningProfile()`、`searchKnowledge()`、`submitQuiz()`、`getExamDocx()`等。所有组件通过这个文件与后端通信。 |
| `lib/ws.ts` | **WebSocket客户端（约150行）**。`ZhiPathWS`类封装WebSocket连接：支持指数退避重连（最多5次）、心跳检测（30秒ping）、消息队列（连接断开时缓存消息）、事件发射器模式（`on()`注册事件监听）。被ChatContext使用。 |

---

## 五、部署架构

`docker-compose.yml` 定义了3个服务：

1. **backend**：Python FastAPI服务，端口8000
2. **frontend**：Next.js前端服务，端口3000
3. **postgres**：PostgreSQL 16 + pgvector扩展，端口5432

启动命令：`docker-compose up -d`

环境变量配置在`.env`文件中：`OPENAI_API_KEY`（LLM API密钥）、`OPENAI_BASE_URL`（LLM API地址）、`DATABASE_URL`（数据库连接串）。

---

## 六、关键文件索引（按功能速查）

| 想了解... | 看这个文件 |
|----------|------------|
| 系统如何启动 | `backend/main.py` → `backend/bootstrap_env.py` |
| 配置怎么加载 | `backend/config/loader.py` → `backend/config/default.yaml` |
| 用户消息怎么处理 | `backend/api/routers/ws.py` → `backend/runtime/orchestrator.py` |
| 意图怎么识别 | `backend/capabilities/__init__.py` 的 `detect_intent()` |
| 目标诊断全流程 | `backend/capabilities/goal.py`（串联5个智能体） |
| 资源生成全流程 | `backend/capabilities/resource_gen.py`（串联多个智能体） |
| RAG知识检索 | `backend/services/rag/pipeline.py` → `backend/base/search_rag.py` |
| 学习者画像怎么构建 | `backend/services/profile/service.py` → `modules/learner_profile/` |
| 测验反馈+补救 | `backend/services/quiz/feedback_service.py` |
| 试卷怎么导出Word | `backend/services/exam/docx_export.py` |
| LLM怎么调用 | `backend/base/base_agent.py` → `backend/base/llm_factory.py` |
| LLM输出怎么解析JSON | `backend/utils/llm_output.py` |
| 流式事件怎么推送 | `backend/core/stream_bus.py` → `backend/core/events.py` |
| 前端WebSocket怎么收消息 | `frontend/lib/ws.ts` → `frontend/context/ChatContext.tsx` |
| 前端API怎么调用 | `frontend/lib/api.ts` |
| 多智能体工作流图 | `frontend/components/agent/AgentWorkflowGraph.tsx` |
| 测验交互组件 | `frontend/components/quiz/QuizCard.tsx` → `QuizFeedback.tsx` |
| 数据库表结构 | `backend/services/models.py` 的 `create_tables()` |
| Docker部署 | `docker-compose.yml` → `.env` |

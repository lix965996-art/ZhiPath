# ZhiPath

ZhiPath 是一个面向 408 复习与个性化学习的多智能体学习系统。用户用自然语言提出目标或问题后，系统会自动完成学习者画像、知识库检索、学习路径规划、资源生成、测验反馈与复习调度，形成「诊断 - 资源 - 练习 - 反馈 - 重规划」的闭环。

![ZhiPath 智能学习工作台](docs/images/chat-agent-trace.png)

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 智能路由 | 根据用户问题自动选择问答、资源生成、动画讲解、多智能体辩论等能力。 |
| 学习者画像 | 从对话与测验中抽取目标、当前水平、关注主题、薄弱点、学习偏好、时间约束和最近意图。 |
| 课程知识库 | 面向 408 的知识切片、关键词检索、向量召回和相似度排序，支持定位薄弱知识点。 |
| 学习路径 | 把目标诊断、资源生成和反馈结果组织成阶段式学习路线。 |
| 资源工坊 | 生成讲义、练习题、试卷、闪卡、思维导图、代码实操、案例分析和讲解音频。 |
| 多智能体协作 | Orchestrator 调度 RAG、画像、路径、资源、反馈等 Agent，前端可视化展示调用链路。 |
| 掌握度追踪 | 使用 BKT、IRT、FSRS 等学习算法记录知识点掌握度、推荐难度和复习日历。 |
| 统一设置 | 前端设置页管理 LLM 与 TTS 凭据，避免把真实密钥写入代码仓库。 |

## 界面预览

### 智能路由与多智能体轨迹

![智能路由与多智能体轨迹](docs/images/chat-agent-trace.png)

### 个性化资源生成

![个性化资源生成](docs/images/resource-package.png)

### 学习者画像

![学习者画像](docs/images/learner-profile.png)

### 学习路径

![学习路径](docs/images/learning-path.png)

### 课程知识库

![课程知识库](docs/images/knowledge-base.png)

![知识库检索结果](docs/images/knowledge-search.png)

### 知识图谱与复习日历

![知识图谱](docs/images/knowledge-graph.png)

![FSRS 复习日历](docs/images/review-calendar.png)

### 系统总览与动画讲解

![系统总览](docs/images/system-overview.png)

![动画讲解链路](docs/images/explainer-trace.png)

## 技术架构

```text
用户浏览器
  -> Next.js / React / TypeScript / Tailwind 前端
  -> REST API + WebSocket 流式通信
  -> FastAPI 后端
     -> Orchestrator 能力编排
     -> Chat / Agentic / Resource / Explainer / Debate 等能力模块
     -> RAGPipeline 知识库召回
     -> Profile / Path / Quiz / Exam / SRS 等学习服务
     -> PostgreSQL + pgvector
```

主要技术：

- 前端：Next.js 15、React 19、TypeScript、Tailwind CSS、lucide-react、Three.js
- 后端：Python 3.12+、FastAPI、LangChain、SQLAlchemy、Alembic
- 数据：PostgreSQL、pgvector、本地 JSON fallback
- AI 能力：DeepSeek、通义千问、硅基流动、讯飞星火、OpenAI 兼容接口
- 学习算法：BKT、DKT、IRT、FSRS
- 输出资源：Markdown、试卷、闪卡、思维导图、Mermaid、代码实操、TTS 音频

## 项目结构

```text
LearnFlow/
  backend/                 FastAPI 后端
    api/                   HTTP / WebSocket 路由
    capabilities/          面向前端的高层能力入口
    modules/               Agent、Prompt 与资源生成模块
    services/              数据、画像、RAG、测验、复习等服务
    runtime/               编排器与能力注册
    tests/                 后端测试
  frontend/                Next.js 前端
    app/                   App Router 页面
    components/            业务组件与可视化组件
    context/               会话、角色、认证等状态
    lib/                   API 与凭据工具
  docs/images/             README 展示截图
  docker-compose.yml       数据库、后端、前端一键启动配置
```

## 本地启动

### 方式一：Docker Compose

适合快速演示。

```bash
docker compose up --build
```

启动后访问：

- 前端：http://localhost:3000
- 后端：http://localhost:8000
- API 健康检查：http://localhost:8000/health

### 方式二：手动启动

适合开发调试。

1. 准备环境

```bash
# Node.js 18+ / 20+ 均可
node -v
npm -v

# Python 建议 3.12+
python --version
```

2. 配置环境变量

```bash
copy .env.example .env
```

编辑 `.env`，至少配置数据库连接。真实 LLM / TTS Key 不建议写入仓库，可以优先在前端「设置」面板中填写。

3. 启动后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

4. 启动前端

```bash
cd ../frontend
npm install
npm run dev
```

5. 打开页面

```text
http://localhost:3000
```

## 环境变量

`.env.example` 给出了模板。常用变量如下：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | 后端数据库连接，Docker 默认使用 `postgresql+asyncpg://zhipath:zhipath@postgres:5432/zhipath`。 |
| `BACKEND_HOST` | 否 | 后端监听地址，默认 `0.0.0.0`。 |
| `BACKEND_PORT` | 否 | 后端端口，默认 `8000`。 |
| `FRONTEND_PORT` | 否 | 前端端口，默认 `3000`。 |
| `DEEPSEEK_API_KEY` | 否 | DeepSeek Key，可通过前端设置页填写。 |
| `DASHSCOPE_API_KEY` | 否 | 通义千问 Key，可通过前端设置页填写。 |
| `SILICONFLOW_API_KEY` | 否 | 硅基流动 Key，可通过前端设置页填写。 |
| `XF_SPARK_API_PASSWORD` | 否 | 讯飞星火 OpenAI 兼容接口凭据。 |
| `XF_TTS_APPID` / `XF_TTS_API_KEY` / `XF_TTS_API_SECRET` | 否 | 讯飞 TTS 凭据，用于讲义音频化。 |

## 常用页面

| 页面 | 地址 | 用途 |
| --- | --- | --- |
| 工作台 | `/chat` | 对话、智能路由、资源生成、多智能体轨迹。 |
| 学习者画像 | `/profile` | 查看目标、薄弱点、偏好和证据链。 |
| 学习路径 | `/path` | 查看阶段式学习路线和下一步任务。 |
| 资源工坊 | `/resources` | 查看生成的讲义、题目、闪卡、代码实操等资源。 |
| 课程知识库 | `/knowledge` | 搜索课程知识切片、定位薄弱知识点。 |
| 学习分析 | `/dashboard` | 知识图谱、掌握度热力图和 FSRS 复习日历。 |
| 系统总览 | `/overview` | 查看系统能力、核心流程和工程结构。 |

## 开发与测试

前端：

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

后端：

```bash
cd backend
pytest
```

常见问题：

- 如果前端请求后端失败，检查 `NEXT_PUBLIC_API_BASE`、`NEXT_PUBLIC_WS_HOST` 和后端端口。
- 如果数据库连接失败，检查 `DATABASE_URL`、PostgreSQL 服务和 pgvector 扩展。
- 如果模型调用失败，先在前端设置页测试 API Key；没有配置 Key 时，部分能力会降级或无法生成内容。
- 如果 `next build` 报 `.next/trace` 权限错误，通常是已有 dev server 占用了 `.next`，停止开发服务后再构建。

## 隐私与安全说明

- 不要提交 `.env`、真实数据库文件、日志、缓存、`node_modules`、`.next`、虚拟环境和本地录屏。
- README 中的截图已使用项目内公开功能截图，未包含 API Key、Token、Cookie 或本机路径。
- 真实密钥建议在浏览器设置页填写，或通过部署平台的环境变量注入。
- 代码实操沙箱只适合教学演示；生产环境应使用容器或独立 VM 做更强隔离。

## License

本仓库保留原项目许可文件。若用于课程、比赛或二次开发，请按实际提交要求补充作者、学校、赛题和许可证信息。

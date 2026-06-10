from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from bootstrap_env import load_project_env

load_project_env()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from services.database import init_db
        await init_db()
        logger.info("Database tables initialized")
    except ModuleNotFoundError as exc:
        logger.warning("Database driver unavailable (%s); falling back to JSON stores", exc)
    except Exception as exc:
        logger.warning("Database initialization skipped: %s", exc)

    # Seed RAG documents if needed
    from services.rag.pipeline import RAGPipeline
    RAGPipeline()
    logger.info("RAG pipeline ready")

    yield


def create_app() -> FastAPI:
    app = FastAPI(title="ZhiPath API", version="0.1.0", lifespan=lifespan)

    # CORS（allow_headers=* 自动包含 X-LF-*）
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 用户凭据中间件（从 X-LF-* header → contextvars，单次请求范围）
    from api.middleware import CredentialsMiddleware
    app.add_middleware(CredentialsMiddleware)

    # 统一错误响应格式（前端可识别 error_type 做不同 toast）
    @app.exception_handler(StarletteHTTPException)
    async def _http_exception(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_type": "http",
                "code": exc.status_code,
                "detail": exc.detail,
                "path": str(request.url.path),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_exception(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "error_type": "validation",
                "code": 422,
                "detail": exc.errors()[:5],
                "path": str(request.url.path),
            },
        )

    @app.exception_handler(Exception)
    async def _unhandled_exception(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "error_type": "internal",
                "code": 500,
                "detail": str(exc)[:240],
                "path": str(request.url.path),
            },
        )

    # Register routers
    from api.routers import (
        audio,
        classroom,
        credentials as creds_router,
        demo,
        exams,
        experiments,
        feedback,
        knowledge,
        knowledge_graph as kg_router,
        mcp,
        memory,
        path as path_router,
        profile,
        quiz,
        report,
        resources,
        review,
        sessions,
        settings,
        study_session,
        tracing,
        ws,
        xapi,
    )
    app.include_router(audio.router)
    app.include_router(classroom.router)
    app.include_router(creds_router.router)
    app.include_router(demo.router)
    app.include_router(exams.router)
    app.include_router(experiments.router)
    app.include_router(feedback.router)
    app.include_router(resources.router)
    app.include_router(knowledge.router)
    app.include_router(kg_router.router)
    app.include_router(mcp.router)
    app.include_router(sessions.router)
    app.include_router(settings.router)
    app.include_router(memory.router)
    app.include_router(path_router.router)
    app.include_router(profile.router)
    app.include_router(quiz.router)
    app.include_router(report.router)
    app.include_router(review.router)
    app.include_router(study_session.router)
    app.include_router(tracing.router)
    app.include_router(xapi.router)
    app.include_router(ws.router)

    # Register capabilities
    from runtime.registry import get_capability_registry
    from capabilities.agentic_chat import AgenticChatCapability
    from capabilities.explainer import ExplainerCapability
    from capabilities.auto_tutor import AutoTutorCapability
    from capabilities.chat import ChatCapability
    from capabilities.debate import DebateCapability
    from capabilities.goal import GoalCapability
    from capabilities.learning import LearningCapability
    from capabilities.resource_gen import ResourceGenerationCapability

    registry = get_capability_registry()
    registry.register(ChatCapability())
    registry.register(GoalCapability())
    registry.register(LearningCapability())
    registry.register(ResourceGenerationCapability())
    registry.register(AutoTutorCapability())
    registry.register(DebateCapability())
    registry.register(AgenticChatCapability())
    registry.register(ExplainerCapability())

    logger.info("ZhiPath API initialized with capabilities: %s", registry.list_capabilities())

    @app.get("/health")
    async def health():
        return {"status": "ok", "capabilities": registry.list_capabilities()}

    @app.get("/api/v1/capabilities")
    async def capabilities():
        return registry.get_manifests()

    @app.get("/api/v1/router")
    async def model_router():
        """暴露多模型路由表：评委可看到 ZhiPath 在不同任务上的模型选择策略。"""
        from base.model_router import get_model_router
        router = get_model_router()
        return {
            "routes": router.list_routes(),
            "recent_routing": router.routing_log[-50:],
        }

    return app


app = create_app()

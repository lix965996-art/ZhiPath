"""用户 API 配置持久化路由：登录后同步 API key 配置到服务端。"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from services.auth import require_user
from services.database import get_db
from services.models import UserApiConfigModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/user/configs", tags=["user-configs"])


# ── 请求/响应模型 ──────────────────────────────────────────────

class SaveConfigsRequest(BaseModel):
    configs: list[dict] = Field(default_factory=list)
    tts: dict = Field(default_factory=dict)


class ConfigsResponse(BaseModel):
    configs: list[dict]
    tts: dict
    updated_at: str | None = None


# ── 路由 ──────────────────────────────────────────────────────

@router.get("", response_model=ConfigsResponse)
async def get_configs(request: Request):
    """获取当前用户的 API 配置。"""
    user = await require_user(request)

    async with get_db() as session:
        result = await session.execute(
            select(UserApiConfigModel).where(UserApiConfigModel.user_id == user.id)
        )
        record = result.scalar_one_or_none()

        if not record:
            return ConfigsResponse(configs=[], tts={}, updated_at=None)

        return ConfigsResponse(
            configs=record.configs_json or [],
            tts=record.tts_json or {},
            updated_at=record.updated_at.isoformat() if record.updated_at else None,
        )


@router.put("", response_model=ConfigsResponse)
async def save_configs(request: Request, body: SaveConfigsRequest):
    """保存当前用户的 API 配置（upsert）。"""
    user = await require_user(request)

    async with get_db() as session:
        result = await session.execute(
            select(UserApiConfigModel).where(UserApiConfigModel.user_id == user.id)
        )
        record = result.scalar_one_or_none()

        if record:
            record.configs_json = body.configs
            record.tts_json = body.tts
            record.updated_at = datetime.now(timezone.utc)
        else:
            record = UserApiConfigModel(
                user_id=user.id,
                configs_json=body.configs,
                tts_json=body.tts,
            )
            session.add(record)

        await session.commit()
        await session.refresh(record)

        logger.info("Saved API configs for user %s: %d configs", user.username, len(body.configs))

        return ConfigsResponse(
            configs=record.configs_json or [],
            tts=record.tts_json or {},
            updated_at=record.updated_at.isoformat() if record.updated_at else None,
        )


@router.post("/sync", response_model=ConfigsResponse)
async def sync_configs(request: Request, body: SaveConfigsRequest):
    """登录后同步：合并客户端和服务端的配置。

    策略：如果服务端有配置，以服务端为准覆盖客户端；
    如果服务端为空但客户端有配置，则保存客户端配置到服务端。
    """
    user = await require_user(request)

    async with get_db() as session:
        result = await session.execute(
            select(UserApiConfigModel).where(UserApiConfigModel.user_id == user.id)
        )
        record = result.scalar_one_or_none()

        if record and record.configs_json:
            # 服务端有配置 → 以服务端为准
            logger.info("Sync: using server configs for user %s", user.username)
            return ConfigsResponse(
                configs=record.configs_json or [],
                tts=record.tts_json or {},
                updated_at=record.updated_at.isoformat() if record.updated_at else None,
            )

        if body.configs:
            # 服务端为空，客户端有配置 → 保存到服务端
            if record:
                record.configs_json = body.configs
                record.tts_json = body.tts
                record.updated_at = datetime.now(timezone.utc)
            else:
                record = UserApiConfigModel(
                    user_id=user.id,
                    configs_json=body.configs,
                    tts_json=body.tts,
                )
                session.add(record)

            await session.commit()
            await session.refresh(record)
            logger.info("Sync: saved client configs to server for user %s", user.username)
            return ConfigsResponse(
                configs=record.configs_json or [],
                tts=record.tts_json or {},
                updated_at=record.updated_at.isoformat() if record.updated_at else None,
            )

        # 双方都没配置
        return ConfigsResponse(configs=[], tts={}, updated_at=None)

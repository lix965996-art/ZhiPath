"""用户认证工具模块：密码哈希、token 管理、用户验证。"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

import bcrypt
from fastapi import HTTPException, Request
from sqlalchemy import select

from services.database import get_db
from services.models import UserModel

logger = logging.getLogger(__name__)

# ── Token 存储（内存 dict，重启失效，比赛项目够用） ──────────────
# {token: {"user_id": str, "username": str, "created_at": datetime}}
_tokens: dict[str, dict] = {}


# ── 密码哈希 ──────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ── Token 管理 ──────────────────────────────────────────────────

def generate_token() -> str:
    return secrets.token_hex(32)


def store_token(token: str, user_id: str, username: str) -> None:
    _tokens[token] = {
        "user_id": user_id,
        "username": username,
        "created_at": datetime.now(timezone.utc),
    }


def get_token_info(token: str) -> Optional[dict]:
    return _tokens.get(token)


def revoke_token(token: str) -> bool:
    return _tokens.pop(token, None) is not None


def get_all_tokens() -> dict[str, dict]:
    return dict(_tokens)


# ── Request 解析 ──────────────────────────────────────────────────

def extract_token_from_request(request: Request) -> Optional[str]:
    """从 Authorization header 或 query param 提取 token。"""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    # WebSocket 降级：query param
    return request.query_params.get("token")


async def get_current_user(request: Request) -> Optional[UserModel]:
    """从请求中解析当前用户，返回 None 表示未登录。"""
    token = extract_token_from_request(request)
    if not token:
        return None

    info = get_token_info(token)
    if not info:
        return None

    try:
        async with get_db() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.id == info["user_id"])
            )
            return result.scalar_one_or_none()
    except Exception as exc:
        logger.warning("Failed to load user from token: %s", exc)
        return None


async def require_user(request: Request) -> UserModel:
    """从请求中解析当前用户，未登录则抛 401。"""
    user = await get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="未登录或 token 已过期")
    return user

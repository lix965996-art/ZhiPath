"""用户认证路由：注册、登录、登出、获取当前用户。"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from services.auth import (
    extract_token_from_request,
    generate_token,
    get_current_user,
    hash_password,
    revoke_token,
    store_token,
    verify_password,
)
from services.database import get_db
from services.models import UserModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ── 请求/响应模型 ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class UserResponse(BaseModel):
    id: str
    username: str
    created_at: str


# ── 工具函数 ──────────────────────────────────────────────────

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_一-鿿]+$")


def _validate_username(username: str) -> None:
    if not _USERNAME_RE.match(username):
        raise HTTPException(
            status_code=422,
            detail="用户名只能包含字母、数字、下划线和中文",
        )


# ── 路由 ──────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest):
    """注册新用户。"""
    _validate_username(body.username)

    async with get_db() as session:
        # 检查用户名是否已存在
        existing = await session.execute(
            select(UserModel).where(UserModel.username == body.username)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="用户名已存在")

        # 创建用户
        user = UserModel(
            username=body.username,
            hashed_password=hash_password(body.password),
        )
        session.add(user)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(status_code=409, detail="用户名已存在")
        await session.refresh(user)

        # 生成 token
        token = generate_token()
        store_token(token, user.id, user.username)

        logger.info("User registered: %s (id=%s)", user.username, user.id)
        return AuthResponse(
            token=token,
            user={
                "id": user.id,
                "username": user.username,
                "created_at": user.created_at.isoformat() if user.created_at else "",
            },
        )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest):
    """用户登录。"""
    async with get_db() as session:
        result = await session.execute(
            select(UserModel).where(UserModel.username == body.username)
        )
        user = result.scalar_one_or_none()

        if not user or not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        token = generate_token()
        store_token(token, user.id, user.username)

        logger.info("User logged in: %s", user.username)
        return AuthResponse(
            token=token,
            user={
                "id": user.id,
                "username": user.username,
                "created_at": user.created_at.isoformat() if user.created_at else "",
            },
        )


@router.get("/me", response_model=UserResponse)
async def me(request: Request):
    """获取当前登录用户信息。"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录或 token 已过期")

    return UserResponse(
        id=user.id,
        username=user.username,
        created_at=user.created_at.isoformat() if user.created_at else "",
    )


@router.post("/logout")
async def logout(request: Request):
    """登出（使当前 token 失效）。"""
    token = extract_token_from_request(request)
    if token:
        revoke_token(token)

    return {"ok": True, "message": "已登出"}

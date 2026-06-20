"""视频讲解生成服务：模板渲染 + 旁白合成 + 音轨合成，带文件级缓存。

generate_lesson_video(template_key, user_text) -> dict | None

流程：选参 → 算缓存键（命中直接返回）→ 隔离进程渲染哑片 → 讯飞/SAPI 合旁白
→ ffmpeg 合轨并 faststart → 落到 data/video，返回可播放 URL。任何环节失败返回 None。
"""
from __future__ import annotations

import glob
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any

from services.video import narration as narration_mod
from services.video.registry import TEMPLATES, build_params, narration_for

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DATA_VIDEO_DIR = BACKEND_ROOT / "data" / "video"
QUALITY = "medium_quality"  # 720p30：清晰度与渲染耗时的平衡

_RENDER_LOCK = threading.Lock()  # manim 全程串行，避免并发渲染相互干扰


def generate_lesson_video(template_key: str, user_text: str = "") -> dict[str, Any] | None:
    if template_key not in TEMPLATES:
        return None
    spec = TEMPLATES[template_key]
    try:
        DATA_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
        params = build_params(template_key, user_text)
        narration_text = narration_for(template_key, params)
        provider_hint = narration_mod.provider_marker()

        cache_key = _cache_key(template_key, params, narration_text, provider_hint)
        fname = f"{template_key}_{cache_key}.mp4"
        out_path = DATA_VIDEO_DIR / fname
        if out_path.exists():
            return _cached_result(spec, template_key, fname, params, out_path)

        with _RENDER_LOCK:
            if out_path.exists():
                return _cached_result(spec, template_key, fname, params, out_path)
            silent = _render_scene(template_key, params)
            if not silent:
                return None
            audio_path, provider = narration_mod.synthesize(narration_text, hint=template_key)
            ok = _mux(silent, audio_path, out_path)
            shutil.rmtree(Path(silent).parents[2], ignore_errors=True)
            if not ok or not out_path.exists():
                return None
        result = _result(spec, template_key, fname, params, out_path, cached=False)
        result["narration_provider"] = provider
        result["has_audio"] = bool(audio_path)
        _write_meta(out_path, result)
        logger.info("video generated: %s (provider=%s)", fname, provider)
        return result
    except Exception as exc:  # noqa: BLE001
        logger.warning("视频生成失败（已降级，不阻塞资源包）：%s", exc)
        return None


def _render_scene(template_key: str, params: dict[str, Any]) -> str | None:
    """隔离子进程跑 manim，返回渲染出的哑片 mp4 路径。"""
    media_dir = tempfile.mkdtemp(prefix="zhipath_vid_")
    params_path = os.path.join(media_dir, "params.json")
    with open(params_path, "w", encoding="utf-8") as f:
        json.dump(params, f, ensure_ascii=False)
    out_name = f"{template_key}_raw"
    cmd = [
        sys.executable, "-m", "services.video._render_runner",
        template_key, params_path, out_name, media_dir, QUALITY,
    ]
    proc = subprocess.run(
        cmd, cwd=str(BACKEND_ROOT), capture_output=True, timeout=240,
        env={**os.environ},
    )
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", "replace")[-500:]
        logger.warning("manim 渲染失败 rc=%s: %s", proc.returncode, err)
        shutil.rmtree(media_dir, ignore_errors=True)
        return None
    hits = glob.glob(os.path.join(media_dir, "videos", "**", f"{out_name}.mp4"), recursive=True)
    if not hits:
        logger.warning("manim 渲染无输出文件：%s", media_dir)
        shutil.rmtree(media_dir, ignore_errors=True)
        return None
    return hits[0]


def _mux(video_path: str, audio_path: str | None, out_path: Path) -> bool:
    """合并音轨（或纯转码），输出 web 友好 H.264 + faststart。"""
    if audio_path:
        a = _duration(audio_path)
        v = _duration(video_path)
        pad = max(0.0, a - v + 0.7)
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", video_path, "-i", audio_path,
            "-filter_complex", f"[0:v]tpad=stop_mode=clone:stop_duration={pad}[v]",
            "-map", "[v]", "-map", "1:a",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
            "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", str(out_path),
        ]
    else:
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error", "-i", video_path,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
            "-movflags", "+faststart", str(out_path),
        ]
    proc = subprocess.run(cmd, capture_output=True, timeout=120)
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", "replace")[-300:]
        logger.warning("ffmpeg 合成失败：%s", err)
        return False
    return True


def _duration(path: str) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", path],
            capture_output=True, timeout=20,
        )
        return float(out.stdout.decode("utf-8", "replace").strip())
    except Exception:  # noqa: BLE001
        return 0.0


def _meta_path(out_path: Path) -> Path:
    return out_path.with_name(out_path.name + ".json")


def _write_meta(out_path: Path, result: dict[str, Any]) -> None:
    try:
        _meta_path(out_path).write_text(
            json.dumps(result, ensure_ascii=False), encoding="utf-8"
        )
    except Exception:  # noqa: BLE001
        pass


def _cached_result(
    spec: dict[str, Any], template_key: str, fname: str,
    params: dict[str, Any], out_path: Path,
) -> dict[str, Any]:
    meta = _meta_path(out_path)
    if meta.exists():
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("url"):
                data["cached"] = True
                return data
        except Exception:  # noqa: BLE001
            pass
    return _result(spec, template_key, fname, params, out_path, cached=True)


def _cache_key(template_key: str, params: dict[str, Any], narration_text: str, provider: str) -> str:
    raw = json.dumps(
        {"k": template_key, "p": params, "n": narration_text, "q": QUALITY, "v": provider},
        ensure_ascii=False, sort_keys=True,
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _result(
    spec: dict[str, Any], template_key: str, fname: str,
    params: dict[str, Any], out_path: Path, cached: bool,
) -> dict[str, Any]:
    return {
        "url": f"/api/video/{fname}",
        "title": spec["title"],
        "topic": spec.get("topic", ""),
        "template": template_key,
        "params": params,
        "duration": round(_duration(str(out_path)), 1),
        "cached": cached,
        "narration_provider": "",
        "has_audio": False,
    }

"""代码实操沙箱：编译并运行学生提交的 C 代码。

设计要点：
- 编译器自动探测（tcc -run 优先 → gcc/clang 编译再跑 → cl 兜底），可用
  config.code_lab.compiler_path 或环境变量 ZHIPATH_C_COMPILER 显式指定。
- 运行前先过 services.guardrail.code_safety 黑名单（拒绝 system/进程/文件/网络等）。
- 每次运行用独立 mkdtemp 临时目录，finally 里清理。
- subprocess 硬超时（默认 5s），输出截断，编码 errors=replace。
- 本函数是**同步阻塞**的；调用方（FastAPI endpoint）用 asyncio.to_thread 包一层，
  与项目里 TTS / 检索的 offload 写法一致。
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from config.loader import get_config
from services.guardrail.code_safety import check_code_safety

_IS_WINDOWS = os.name == "nt"
# Windows: 新进程组，便于超时时按树状 kill（taskkill /T）。
_CREATE_NEW_PROCESS_GROUP = 0x00000200 if _IS_WINDOWS else 0


@dataclass
class RunResult:
    ok: bool = False          # 流程是否走完（不一定代表逻辑正确）
    ran: bool = False         # 是否真正执行到了学生的程序
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    timed_out: bool = False
    blocked: bool = False
    compiler: str = ""
    reason: str = ""          # ok / runtime_error / compile_error / timeout / no_compiler / blocked
    matched_patterns: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "ran": self.ran,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "timed_out": self.timed_out,
            "blocked": self.blocked,
            "compiler": self.compiler,
            "reason": self.reason,
            "matched_patterns": self.matched_patterns,
        }


@dataclass
class _Compiler:
    family: str  # tcc | gcc | clang | cl
    path: str


# ---- 编译器探测（缓存） ----
_resolved: _Compiler | None = None
_probed: bool = False


def _infer_family(name: str) -> str:
    low = os.path.basename(name).lower()
    if "tcc" in low:
        return "tcc"
    if "clang" in low:
        return "clang"
    if low in ("cl", "cl.exe"):
        return "cl"
    return "gcc"  # gcc / g++ / cc


def _probe(path: str) -> bool:
    """快速验证编译器可执行（--version / -v / cl /?）。"""
    family = _infer_family(path)
    flag = "/?" if family == "cl" else ("-v" if family == "tcc" else "--version")
    try:
        cp = subprocess.run(
            [path, flag], capture_output=True, timeout=3,
        )
        return cp.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _do_resolve() -> _Compiler | None:
    cfg = get_config().code_lab
    # 1. 显式指定（config 或环境变量）优先
    explicit = cfg.compiler_path.strip()
    if explicit:
        if os.path.isfile(explicit) and _probe(explicit):
            return _Compiler(_infer_family(explicit), explicit)
    # 2. 按 preference 在 PATH 上探测
    for name in cfg.compiler_preference:
        path = shutil.which(name)
        if path and _probe(path):
            return _Compiler(_infer_family(name), path)
    return None


def resolve_compiler() -> _Compiler | None:
    """返回（缓存后的）可用编译器；没有返回 None。"""
    global _resolved, _probed
    if not _probed:
        _resolved = _do_resolve()
        _probed = True
    return _resolved


def reset_compiler_cache() -> None:
    """测试用：清掉探测缓存（装好编译器后重探）。"""
    global _resolved, _probed
    _resolved = None
    _probed = False


# ---- 运行 ----
def _truncate(text: str, limit: int) -> str:
    if len(text) > limit:
        return text[:limit] + f"\n...（已截断，共 {len(text)} 字节）"
    return text


def _run_proc(argv: list[str], stdin: str, timeout: float, limit: int) -> "subprocess.CompletedProcess[str]":
    """启动子进程，超时则**按进程树 kill**（Windows 用 taskkill /T /F，POSIX 用 kill 整组）。

    用 PIPE + 独立读线程 + 边读边截断，避免学生 `while(printf) {...}` 把 worker 内存撑爆
    （subprocess.run(capture_output=True) 会把整段输出吃进内存）。用 wait() 而不是 communicate()，
    避免 communicate 关闭管道时和读线程抢夺导致 "I/O operation on closed file"。
    """
    proc = subprocess.Popen(
        argv,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=_CREATE_NEW_PROCESS_GROUP,
    )

    out_chunks: list[str] = []
    err_chunks: list[str] = []

    def reader(pipe, sink: list[str]) -> None:
        size = 0
        try:
            for line in iter(pipe.readline, ""):
                if size <= limit:        # 超出上限后继续排空管道但不存储，防 OOM 也防管道阻塞
                    sink.append(line)
                    size += len(line)
        except (ValueError, OSError):
            pass
        finally:
            try:
                pipe.close()
            except Exception:
                pass

    rt = threading.Thread(target=reader, args=(proc.stdout, out_chunks), daemon=True)
    re_ = threading.Thread(target=reader, args=(proc.stderr, err_chunks), daemon=True)
    rt.start(); re_.start()

    # 喂 stdin（学生任务通常为空）
    try:
        if stdin:
            proc.stdin.write(stdin)
        if proc.stdin is not None:
            proc.stdin.close()
    except (ValueError, OSError, BrokenPipeError):
        pass

    try:
        proc.wait(timeout=max(0.5, timeout))
    except subprocess.TimeoutExpired:
        _kill_tree(proc)
        try:
            proc.wait(timeout=1.0)
        except Exception:
            pass
        rt.join(timeout=0.5); re_.join(timeout=0.5)
        raise

    rt.join(timeout=0.5); re_.join(timeout=0.5)
    return subprocess.CompletedProcess(
        args=argv,
        returncode=proc.returncode if proc.returncode is not None else -1,
        stdout="".join(out_chunks),
        stderr="".join(err_chunks),
    )


def _kill_tree(proc: subprocess.Popen) -> None:
    """尽力杀掉子进程及其子进程（防止超时后孤儿继续跑 / 锁住临时 exe）。"""
    try:
        if _IS_WINDOWS:
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True, timeout=3,
            )
        else:
            import signal
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def run_c_code(code: str, stdin: str = "", *, timeout: float | None = None,
               max_output_bytes: int | None = None) -> RunResult:
    """编译并运行学生 C 代码。同步阻塞，调用方用 asyncio.to_thread 包一层。"""
    cfg = get_config().code_lab
    timeout = cfg.timeout_seconds if timeout is None else timeout
    limit = cfg.max_output_bytes if max_output_bytes is None else max_output_bytes

    # 1. 安全护栏
    safety = check_code_safety(code)
    if not safety.safe:
        return RunResult(blocked=True, reason="blocked", matched_patterns=safety.matched)

    # 2. 编译器
    comp = resolve_compiler()
    if comp is None:
        return RunResult(reason="no_compiler")

    workdir = tempfile.mkdtemp(prefix="zhipath_c_")
    src = os.path.join(workdir, "student.c")
    try:
        Path(src).write_text(code, encoding="utf-8")
        deadline = time.monotonic() + timeout

        try:
            if comp.family == "tcc":
                cp = _run_proc([comp.path, "-run", src], stdin, deadline - time.monotonic(), limit)
                return RunResult(
                    ok=True, ran=True,
                    stdout=_truncate(cp.stdout, limit), stderr=_truncate(cp.stderr, limit),
                    exit_code=cp.returncode, compiler=comp.family,
                    reason="ok" if cp.returncode == 0 else "runtime_error",
                )

            # gcc / clang / cl：先编译再运行
            exe_name = "student.exe" if os.name == "nt" else "student"
            exe = os.path.join(workdir, exe_name)
            if comp.family == "cl":
                compile_argv = [comp.path, "/nologo", "/Fe:" + exe, src]
            else:
                compile_argv = [comp.path, src, "-o", exe, "-std=c11"]
            cp_c = _run_proc(compile_argv, "", deadline - time.monotonic(), limit)
            if cp_c.returncode != 0:
                return RunResult(
                    ok=True, ran=False,
                    stderr=_truncate(cp_c.stderr or cp_c.stdout, limit),
                    exit_code=cp_c.returncode, compiler=comp.family, reason="compile_error",
                )
            cp = _run_proc([exe], stdin, deadline - time.monotonic(), limit)
            return RunResult(
                ok=True, ran=True,
                stdout=_truncate(cp.stdout, limit), stderr=_truncate(cp.stderr, limit),
                exit_code=cp.returncode, compiler=comp.family,
                reason="ok" if cp.returncode == 0 else "runtime_error",
            )
        except subprocess.TimeoutExpired:
            return RunResult(timed_out=True, compiler=comp.family, reason="timeout")
        except FileNotFoundError:
            return RunResult(reason="no_compiler")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

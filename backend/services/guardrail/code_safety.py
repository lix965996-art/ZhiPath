"""学生 C 源码安全护栏。

⚠️ 重要：对 C 源码做"正则黑名单"**不可能**做到绝对安全——预处理器（宏、token 粘贴、
相邻字符串拼接）才是真正生成调用的地方，正则无法建模它。因此本护栏只是**第一道防线**，
真正的隔离由 services/code_lab/runner.py 在临时目录里以独立进程组 + 超时 + 树状 kill 完成。
本模块尽力把常见逃逸路径堵上（禁宏、头文件白名单、剥离注释/字符串、扩大黑名单、禁文件 I/O），
但不要假设它能抵挡恶意构造的代码；生产环境应在容器/VM 里运行学生代码。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class CodeSafetyResult:
    safe: bool
    severity: str  # "ok" | "block"
    reason: str = ""
    matched: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "safe": self.safe,
            "severity": self.severity,
            "reason": self.reason,
            "matched": self.matched,
        }


# 学生允许 #include 的头文件白名单（标准库基础子集，足够 408 题用）。
_ALLOWED_HEADERS = {
    "stdio.h", "stdlib.h", "string.h", "math.h", "stdbool.h",
    "stddef.h", "stdint.h", "inttypes.h", "limits.h", "ctype.h", "time.h",
    "assert.h",
}

# 危险函数名（按类别分组，便于读）。匹配时用 `\b<name>\s*\(`，即"被调用"形态。
_BLOCKED_FUNCS = [
    # 执行外部命令 / 起进程
    "system", "_wsystem", "_wsystem", "popen", "_popen", "_wpopen",
    "execl", "execlp", "execle", "execlpe", "execv", "execvp", "execve", "execvpe",
    "_execl", "_execle", "_execlp", "_execlpe", "_execv", "_execve", "_execvp", "_execvpe",
    "fork", "vfork",
    "_spawnl", "_spawnle", "_spawnlp", "_spawnlpe", "_spawnv", "_spawnve", "_spawnvp", "_spawnvpe",
    "wspawnl", "wspawnle", "wspawnlp", "wspawnlpe", "wspawnv", "wspawnve", "wspawnvp", "wspawnvpe",
    "WinExec",
    # 文件 / 目录（读也算——学生任务不需要任何文件 I/O）
    "fopen", "freopen", "tmpfile", "open", "_open", "_wopen", "sopen", "_sopen",
    "creat", "_creat", "close", "_close",
    "remove", "unlink", "_unlink", "rename", "_rename",
    "mkdir", "_mkdir", "rmdir", "_rmdir", "chdir", "_chdir", "getcwd", "_getcwd",
    # Windows 文件/进程 API
    "CreateFile", "CreateFileA", "CreateFileW",
    "MoveFile", "MoveFileA", "MoveFileW", "MoveFileEx", "MoveFileExA", "MoveFileExW",
    "CopyFile", "CopyFileA", "CopyFileW", "CopyFileEx",
    "DeleteFile", "DeleteFileA", "DeleteFileW",
    "WriteFile", "ReadFile",
    "CreateProcess", "CreateProcessA", "CreateProcessW", "CreateProcessAsUserA", "CreateProcessAsUserW",
    "ShellExecute", "ShellExecuteA", "ShellExecuteW", "ShellExecuteEx", "ShellExecuteExA", "ShellExecuteExW",
    # 动态加载 / 取函数地址
    "LoadLibrary", "LoadLibraryA", "LoadLibraryW", "LoadLibraryEx", "LoadLibraryExA", "LoadLibraryExW",
    "GetProcAddress", "GetModuleHandle", "GetModuleHandleA", "GetModuleHandleW",
    # 网络
    "socket", "connect", "bind", "listen", "accept", "recv", "send", "sendto", "recvfrom",
    "closesocket", "shutdown", "getaddrinfo", "gethostbyname", "inet_addr", "WSAStartup",
    # 取环境变量（配合 exec 有风险，且学生任务用不到）
    "getenv", "_dupenv_s", "_wgetenv", "putenv", "_putenv",
    # 信号 / 非本地跳转 / 崩溃 / 栈耗尽
    "signal", "raise", "abort", "exit", "_exit",
    "setjmp", "longjmp", "sigsetjmp", "siglongjmp",
    "alloca", "_alloca",
    # 内联汇编钻平台底层
    "__asm", "__asm__", "asm",
]

_BLOCKED_FUNC_RE = re.compile(
    r"\b(" + "|".join(re.escape(n) for n in _BLOCKED_FUNCS) + r")\s*\("
)

# 禁止预处理器宏 / token 粘贴：这是宏绕过（#define C system）的根因。
_DEFINE_RE = re.compile(r"#\s*define\b")
_TOKEN_PASTE_RE = re.compile(r"##")
# 捕获所有 #include 的头文件名（<> 和 "" 两种形式）。
_INCLUDE_RE = re.compile(r"#\s*include\s*[<\"]([^>\"]+)[>\"]")
# 注释 / 字符串字面量剥离，让正则只看"真正的代码 token"。
_LINE_COMMENT_RE = re.compile(r"//[^\n]*")
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_STRING_RE = re.compile(r"(?:\\.|[^\"\\])*")  # 配合下面用
_CHAR_RE = re.compile(r'(?:\\.|[^\'\\])*')


def _strip_noise(code: str) -> str:
    """剥离注释 + 字符串/字符字面量，只留代码骨架用于黑名单匹配。

    这样：(a) 注释里写 system() 不会误报；(b) 字符串里藏 token 也无法隐藏真实调用。
    """
    no_block = _BLOCK_COMMENT_RE.sub("", code)
    no_line = _LINE_COMMENT_RE.sub("", no_block)
    # 先剥字符串再剥字符（避免互相干扰）。把字面量替换成空串。
    # 用简单状态机更稳：逐字符扫描，跳过 "..." 与 '...'。
    out: list[str] = []
    i = 0
    n = len(no_line)
    while i < n:
        ch = no_line[i]
        if ch == '"':
            i += 1
            while i < n:
                if no_line[i] == "\\":
                    i += 2
                    continue
                if no_line[i] == '"':
                    i += 1
                    break
                i += 1
            out.append('""')
        elif ch == "'":
            i += 1
            while i < n:
                if no_line[i] == "\\":
                    i += 2
                    continue
                if no_line[i] == "'":
                    i += 1
                    break
                i += 1
            out.append("''")
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def check_code_safety(code: str) -> CodeSafetyResult:
    """对学生 C 源码做安全检查。命中任一规则 → 拒绝编译运行。"""
    if not code or not code.strip():
        return CodeSafetyResult(safe=False, severity="block", reason="代码为空", matched=["empty"])

    hits: list[str] = []

    # 这些规则对原始文本（剥离注释/字符串后）生效
    stripped = _strip_noise(code)

    if _DEFINE_RE.search(stripped):
        hits.append("#define 宏（禁止预处理器宏，避免绕过黑名单）")
    if _TOKEN_PASTE_RE.search(stripped):
        hits.append("## token 粘贴（禁止，避免拼出危险符号）")

    func_hit = _BLOCKED_FUNC_RE.search(stripped)
    if func_hit:
        hits.append(f"受限调用 {func_hit.group(1)}(")

    # 头文件白名单（用原始 code 取 include 行即可，注释里的 #include 已无所谓）
    for hdr in _INCLUDE_RE.findall(code):
        name = hdr.strip().split("/")[-1].split("\\")[-1]
        if name not in _ALLOWED_HEADERS:
            hits.append(f"非白名单头文件 <{hdr}>")

    if hits:
        return CodeSafetyResult(
            safe=False,
            severity="block",
            reason="代码包含受限调用/宏/头文件（系统命令/进程/文件/网络等）",
            matched=hits,
        )
    return CodeSafetyResult(safe=True, severity="ok", reason="", matched=[])

"""代码实操服务：编译运行学生 C 代码 + 输出比对 + 主题适用性判定。"""
from services.code_lab.runner import RunResult, resolve_compiler, reset_compiler_cache, run_c_code
from services.code_lab.suitability import topic_supports_code, code_suitable_subjects
from services.code_lab.verify import compare_outputs, normalize_output, CompareResult

__all__ = [
    "RunResult",
    "resolve_compiler",
    "reset_compiler_cache",
    "run_c_code",
    "topic_supports_code",
    "code_suitable_subjects",
    "compare_outputs",
    "normalize_output",
    "CompareResult",
]

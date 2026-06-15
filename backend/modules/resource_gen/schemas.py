from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# ---- Quiz ----

class SingleChoiceQuestion(BaseModel):
    question: str
    options: List[str]
    correct_option: int | str
    explanation: Optional[str] = None


class MultipleChoiceQuestion(BaseModel):
    question: str
    options: List[str]
    correct_options: List[int | str]
    explanation: Optional[str] = None


class TrueFalseQuestion(BaseModel):
    question: str
    correct_answer: bool
    explanation: Optional[str] = None


class ShortAnswerQuestion(BaseModel):
    question: str
    expected_answer: str
    explanation: Optional[str] = None


class Quiz(BaseModel):
    single_choice_questions: List[SingleChoiceQuestion] = Field(default_factory=list)
    multiple_choice_questions: List[MultipleChoiceQuestion] = Field(default_factory=list)
    true_false_questions: List[TrueFalseQuestion] = Field(default_factory=list)
    short_answer_questions: List[ShortAnswerQuestion] = Field(default_factory=list)


# ---- Flashcard ----

class Flashcard(BaseModel):
    front: str = Field(..., description="问题/概念")
    back: str = Field(..., description="答案/解释")
    difficulty: str = Field("medium", description="easy / medium / hard")


class FlashcardSet(BaseModel):
    title: str
    cards: List[Flashcard]


# ---- Mind Map ----

class MindMapNode(BaseModel):
    id: str
    label: str
    children: List[str] = Field(default_factory=list)


class MindMap(BaseModel):
    title: str
    nodes: List[MindMapNode]


# ---- Code Lab (C 语言代码实操：编译运行 + 逻辑判定) ----

class CodeCheckpoint(BaseModel):
    """一条可验证的逻辑检查点。

    label 用自然语言描述学生补全后必须成立的**逻辑**，
    例如 'get_port_type(80) 返回 WELL_KNOWN' / 'is_deadlock_possible(...) 返回 1' /
    'inorder(root) 输出顺序为 1 2 3'。
    前端按「程序实际 stdout == expected_output」整体判定，匹配则该检查点判为「逻辑通过」。
    """
    label: str = Field(..., description="描述学生补全后必须成立的逻辑，例如 'get_port_type(80) 返回 WELL_KNOWN'")


class CodeSnippet(BaseModel):
    title: str
    description: str = Field("", description="任务说明：一句话讲清学生要补全哪段真实 C 逻辑")
    language: str = Field("c", description="代码实操只使用 C 语言")
    code: str = Field(..., description="真实 C 代码：含 #include <stdio.h>、自定义函数、TODO 待补逻辑；main 调用学生函数并 printf 结果。绝不能只是 printf 知识点清单")
    test_input: str = Field("", description="程序运行时喂给 stdin 的内容；多数 408 题变量在代码内固定，留空")
    expected_output: str = Field("", description="学生正确补全后程序的标准输出（每行通常对应一条 checkpoint）")
    checkpoints: List[CodeCheckpoint] = Field(default_factory=list, description="逻辑检查点（描述学生补全后必须成立的逻辑）")
    hints: List[str] = Field(default_factory=list, description="给学生的学习提示")


class CodeLab(BaseModel):
    title: str
    language: str = "c"
    snippets: List[CodeSnippet] = Field(default_factory=list)
    practice_tasks: List[str] = Field(default_factory=list, description="留给学生的练习任务")


# ---- Mermaid 结构化图表 (前端 mermaid.js 渲染) ----

class MermaidDiagram(BaseModel):
    title: str = ""
    diagram_type: str = Field("flowchart", description="flowchart/sequenceDiagram/...")
    mermaid_code: str = Field(..., description="完整可独立渲染的 mermaid 源码")
    narrative: str = Field("", description="解释这张图在讲什么")
    alternatives: List[str] = Field(default_factory=list)


# ---- Case Study (案例分析) ----

class CaseStudyItem(BaseModel):
    title: str = Field(..., description="案例标题")
    case_type: str = Field("scenario", description="案例类型：bug_hunt / performance / architecture / scenario")
    scenario: str = Field(..., description="场景描述，还原真实工程情境")
    code_snippet: str = Field("", description="代码片段（可选），用于找 Bug 或分析性能")
    code_language: str = Field("", description="代码语言标识，如 python / c / java 等")
    questions: List[str] = Field(..., description="分析性问题列表，2-5 个递进问题")
    analysis: str = Field(..., description="详细分析/参考答案，包含关键推理步骤")
    difficulty: str = Field("medium", description="easy / medium / hard")
    knowledge_points: List[str] = Field(default_factory=list, description="涉及的知识点")
    hints: List[str] = Field(default_factory=list, description="给学生的学习提示（可选）")


class CaseStudy(BaseModel):
    title: str = Field(..., description="案例分析集标题")
    description: str = Field(..., description="整体说明：本案例集覆盖的场景和学习目标")
    cases: List[CaseStudyItem] = Field(..., description="2-4 个递进式案例")

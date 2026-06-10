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


# ---- Code Lab (实操案例：浏览器内 Pyodide 沙箱) ----

class CodeSnippet(BaseModel):
    title: str
    description: str = Field("", description="一句话讲清这段代码在做什么")
    language: str = Field("python", description="目前固定 python，对应浏览器 Pyodide 沙箱")
    code: str = Field(..., description="可直接运行的 Python 代码")
    expected_output: str = Field("", description="期望输出（学生可对照）")
    hints: List[str] = Field(default_factory=list, description="给学生的学习提示")


class CodeLab(BaseModel):
    title: str
    language: str = "python"
    snippets: List[CodeSnippet] = Field(default_factory=list)
    practice_tasks: List[str] = Field(default_factory=list, description="留给学生的练习任务")


# ---- Mermaid 结构化图表 (前端 mermaid.js 渲染) ----

class MermaidDiagram(BaseModel):
    title: str = ""
    diagram_type: str = Field("flowchart", description="flowchart/sequenceDiagram/...")
    mermaid_code: str = Field(..., description="完整可独立渲染的 mermaid 源码")
    narrative: str = Field("", description="解释这张图在讲什么")
    alternatives: List[str] = Field(default_factory=list)

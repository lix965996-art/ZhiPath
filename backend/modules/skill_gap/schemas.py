from enum import Enum
from typing import List
from pydantic import BaseModel, Field, field_validator, model_validator


class LevelRequired(str, Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class LevelCurrent(str, Enum):
    unlearned = "unlearned"
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class Confidence(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class SkillRequirement(BaseModel):
    name: str = Field(..., description="简洁、可操作的技能名称")
    required_level: LevelRequired


class SkillRequirements(BaseModel):
    skill_requirements: List[SkillRequirement]

    @field_validator("skill_requirements")
    @classmethod
    def validate_length_and_uniqueness(cls, v: List[SkillRequirement]):
        if not (1 <= len(v) <= 10):
            raise ValueError("技能需求数量必须在 1 到 10 之间。")
        seen = set()
        for item in v:
            key = item.name.strip().lower()
            if key in seen:
                raise ValueError(f'检测到重复技能名称: "{item.name}"')
            seen.add(key)
        return v


class SkillGap(BaseModel):
    name: str
    required_level: LevelRequired
    current_level: LevelCurrent
    is_gap: bool
    reason: str = Field(..., description="简要说明")
    level_confidence: Confidence

    @field_validator("reason")
    @classmethod
    def limit_reason_length(cls, v: str) -> str:
        # Use character count for Chinese text instead of word split
        if len(v) > 100:
            raise ValueError("reason 不超过 100 个字符。")
        return v

    @model_validator(mode="after")
    def check_gap_consistency(self):
        order = {"unlearned": 0, "beginner": 1, "intermediate": 2, "advanced": 3}
        gap_should_be = order[self.current_level.value] < order[self.required_level.value]
        if self.is_gap != gap_should_be:
            raise ValueError(
                f'is_gap 不一致: required="{self.required_level.value}", '
                f'current="{self.current_level.value}" 应为 is_gap={gap_should_be}'
            )
        return self


class SkillGaps(BaseModel):
    skill_gaps: List[SkillGap]

    @field_validator("skill_gaps")
    @classmethod
    def limit_length_and_names(cls, v: List[SkillGap]):
        if not (1 <= len(v) <= 10):
            raise ValueError("技能差距数量必须在 1 到 10 之间。")
        seen = set()
        for item in v:
            key = item.name.strip().lower()
            if key in seen:
                raise ValueError(f'检测到重复技能名称: "{item.name}"')
            seen.add(key)
        return v


class RefinedLearningGoal(BaseModel):
    refined_goal: str

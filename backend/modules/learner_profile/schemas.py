from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class ProficiencyLevel(str, Enum):
    unlearned = "unlearned"
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class MasteredSkill(BaseModel):
    name: str
    proficiency_level: ProficiencyLevel


class InProgressSkill(BaseModel):
    name: str
    required_proficiency_level: ProficiencyLevel
    current_proficiency_level: ProficiencyLevel


class CognitiveStatus(BaseModel):
    overall_progress: int = Field(..., ge=0, le=100)
    mastered_skills: List[MasteredSkill] = Field(default_factory=list)
    in_progress_skills: List[InProgressSkill] = Field(default_factory=list)


class LearningPreferences(BaseModel):
    content_style: str
    activity_type: str
    additional_notes: Optional[str] = None


class BehavioralPatterns(BaseModel):
    system_usage_frequency: str
    session_duration_engagement: str
    motivational_triggers: Optional[str] = None
    additional_notes: Optional[str] = None


class LearnerProfile(BaseModel):
    learner_information: str
    learning_goal: str
    cognitive_status: CognitiveStatus
    learning_preferences: LearningPreferences
    behavioral_patterns: BehavioralPatterns

    @field_validator("learning_goal")
    @classmethod
    def ensure_nonempty_goal(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("learning_goal 不能为空")
        return v

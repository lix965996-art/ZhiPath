export interface LearningDemoState {
  diagnosticCompleted: boolean;
  diagnosticScore: number;
  bankerAttempts: number;
  safeSequence: string[];
  remedialPassed: boolean;
  pathAdjusted: boolean;
  masteryBefore: number;
  masteryAfter: number;
  updatedAt: string;
}

const STORAGE_KEY = "zhipath-learning-loop-v1";

export const defaultLearningDemoState: LearningDemoState = {
  diagnosticCompleted: false,
  diagnosticScore: 0,
  bankerAttempts: 0,
  safeSequence: [],
  remedialPassed: false,
  pathAdjusted: false,
  masteryBefore: 42,
  masteryAfter: 42,
  updatedAt: "",
};

export function readLearningDemoState(): LearningDemoState {
  if (typeof window === "undefined") return defaultLearningDemoState;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved
      ? { ...defaultLearningDemoState, ...JSON.parse(saved) }
      : defaultLearningDemoState;
  } catch {
    return defaultLearningDemoState;
  }
}

export function writeLearningDemoState(
  patch: Partial<LearningDemoState>,
): LearningDemoState {
  const next = {
    ...readLearningDemoState(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

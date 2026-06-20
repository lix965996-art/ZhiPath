export interface LearningSessionState {
  diagnosticCompleted: boolean;
  diagnosticScore: number | null;
  bankerAttempts: number;
  safeSequence: string[];
  remedialAnswered: boolean;
  remedialCorrect: boolean;
  updatedAt: string;
}

const STORAGE_KEY = "zhipath-learning-session-v1";

export const emptyLearningSession: LearningSessionState = {
  diagnosticCompleted: false,
  diagnosticScore: null,
  bankerAttempts: 0,
  safeSequence: [],
  remedialAnswered: false,
  remedialCorrect: false,
  updatedAt: "",
};

export function readLearningSession(): LearningSessionState {
  if (typeof window === "undefined") return emptyLearningSession;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved
      ? { ...emptyLearningSession, ...JSON.parse(saved) }
      : emptyLearningSession;
  } catch {
    return emptyLearningSession;
  }
}

export function writeLearningSession(
  patch: Partial<LearningSessionState>,
): LearningSessionState {
  const next = {
    ...readLearningSession(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

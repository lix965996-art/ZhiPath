"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import {
  apiUrl,
  apiFetch,
  wsUrl,
  getLatestExam,
  getLatestQuiz,
  getLatestResourcePackage,
  type ExamData,
  type LearningResourcePackage,
  type QuizData,
  type QuizSubmitResult,
} from "@/lib/api";
import { ZhiPathWS } from "@/lib/ws";
import { showError, showInfo } from "@/components/ui/Toast";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  thinking?: string[];
  result?: string;
}

export interface AgentNodeState {
  name: string;
  status: "idle" | "running" | "done" | "error";
  inputSummary: string;
  outputSummary: string;
  startTime: number;
  endTime: number;
}

export interface AgentEdgeMessage {
  id: string;
  from: string;
  to: string;
  label: string;
  payload: unknown;
  timestamp: number;
}

export interface KnowledgeSource {
  index: number;
  title: string;
  document_id?: string;
  tags?: string[];
  score?: number;
  excerpt?: string;
  retrieval_mode?: string;
}

export interface ProfileEvidence {
  dimension: string;
  value: string;
  evidence: string;
  turn: number;
  timestamp: number;
}

export interface LoopStepState {
  step: string;
  status: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface GuardrailWarning {
  severity: string;
  reason: string;
  matched?: string[];
  timestamp: number;
}

export interface ChatState {
  sessionId: string;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingThinking: string[];
  streamingResult: string;
  activeStages: string[];
  error: string | null;
  agentNodes: Record<string, AgentNodeState>;
  agentEdges: AgentEdgeMessage[];
  activeCapability: string;
  quizData: QuizData | null;
  quizResult: QuizSubmitResult | null;
  examData: ExamData | null;
  resourcePackage: LearningResourcePackage | null;
  knowledgeSources: KnowledgeSource[];
  lowConfidenceSources: boolean;
  profileEvidence: ProfileEvidence[];
  loopSteps: LoopStepState[];
  guardrail: GuardrailWarning | null;
}

type ChatAction =
  | { type: "ADD_USER_MSG"; content: string }
  | { type: "ADD_ASSISTANT_MSG"; content: string; thinking?: string[]; result?: string }
  | { type: "STREAM_START" }
  | { type: "STREAM_CHUNK"; content: string }
  | { type: "STREAM_END" }
  | { type: "STREAM_CANCEL" }
  | { type: "ADD_THINKING"; content: string }
  | { type: "STAGE_START"; stage: string }
  | { type: "STAGE_END"; stage: string }
  | { type: "SET_RESULT"; content: string }
  | { type: "SET_SESSION"; sessionId: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "RESET" }
  | { type: "AGENT_CALL"; source: string; inputSummary: string }
  | { type: "AGENT_RESULT"; source: string; outputSummary: string; status: "success" | "error" }
  | { type: "SET_ACTIVE_CAPABILITY"; capability: string }
  | { type: "SET_QUIZ_DATA"; data: QuizData | null }
  | { type: "SET_QUIZ_RESULT"; result: QuizSubmitResult | null }
  | { type: "SET_EXAM_DATA"; data: ExamData | null }
  | { type: "SET_RESOURCE_PACKAGE"; data: LearningResourcePackage | null }
  | { type: "AGENT_MESSAGE"; from: string; to: string; label: string; payload: unknown }
  | { type: "SET_SOURCES"; sources: KnowledgeSource[]; lowConfidence: boolean }
  | { type: "PROFILE_EVIDENCE"; dimension: string; value: string; evidence: string; turn: number }
  | { type: "LOOP_STEP"; step: string; status: string; metadata?: Record<string, unknown> }
  | { type: "GUARDRAIL"; severity: string; reason: string; matched?: string[] };

const initialState: ChatState = {
  sessionId: "",
  messages: [],
  isStreaming: false,
  streamingContent: "",
  streamingThinking: [],
  streamingResult: "",
  activeStages: [],
  error: null,
  agentNodes: {},
  agentEdges: [],
  activeCapability: "",
  quizData: null,
  quizResult: null,
  examData: null,
  resourcePackage: null,
  knowledgeSources: [],
  lowConfidenceSources: false,
  profileEvidence: [],
  loopSteps: [],
  guardrail: null,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_USER_MSG":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: "user", content: action.content, timestamp: Date.now() },
        ],
      };
    case "ADD_ASSISTANT_MSG":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: action.content,
            timestamp: Date.now(),
            thinking: action.thinking,
            result: action.result,
          },
        ],
      };
    case "STREAM_START":
      return {
        ...state,
        isStreaming: true,
        streamingContent: "",
        streamingThinking: [],
        streamingResult: "",
        activeStages: [],
        error: null,
        agentNodes: {},
        agentEdges: [],
        activeCapability: "",
        quizData: null,
        quizResult: null,
        examData: null,
        resourcePackage: null,
        knowledgeSources: [],
        lowConfidenceSources: false,
        loopSteps: [],
        guardrail: null,
      };
    case "STREAM_CHUNK":
      return {
        ...state,
        streamingContent: state.streamingContent + action.content,
      };
    case "STREAM_END":
      return {
        ...state,
        isStreaming: false,
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: state.streamingContent,
            timestamp: Date.now(),
            thinking: state.streamingThinking.length
              ? state.streamingThinking
              : undefined,
            result: state.streamingResult || undefined,
          },
        ],
        streamingContent: "",
        streamingThinking: [],
        streamingResult: "",
        activeStages: [],
      };
    case "STREAM_CANCEL":
      return {
        ...state,
        isStreaming: false,
        messages: [
          ...state.messages,
          ...(state.streamingContent
            ? [
                {
                  role: "assistant" as const,
                  content: `${state.streamingContent}\n\n*(已停止生成)*`,
                  timestamp: Date.now(),
                  thinking: state.streamingThinking.length
                    ? state.streamingThinking
                    : undefined,
                },
              ]
            : []),
        ],
        streamingContent: "",
        streamingThinking: [],
        streamingResult: "",
        activeStages: [],
      };
    case "ADD_THINKING":
      return {
        ...state,
        streamingThinking: [...state.streamingThinking, action.content],
      };
    case "STAGE_START":
      return {
        ...state,
        activeStages: [
          ...state.activeStages.filter((stage) => stage !== action.stage),
          action.stage,
        ],
      };
    case "STAGE_END":
      return {
        ...state,
        activeStages: state.activeStages.filter((stage) => stage !== action.stage),
      };
    case "SET_RESULT":
      return { ...state, streamingResult: action.content };
    case "SET_SESSION":
      return { ...state, sessionId: action.sessionId };
    case "SET_ERROR":
      return { ...state, error: action.error, isStreaming: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "AGENT_CALL":
      return {
        ...state,
        agentNodes: {
          ...state.agentNodes,
          [action.source]: {
            name: action.source,
            status: "running" as const,
            inputSummary: action.inputSummary,
            outputSummary: "",
            startTime: Date.now(),
            endTime: 0,
          },
        },
      };
    case "AGENT_RESULT":
      return {
        ...state,
        agentNodes: {
          ...state.agentNodes,
          [action.source]: {
            ...state.agentNodes[action.source],
            name: action.source,
            status: action.status === "success" ? "done" : "error",
            outputSummary: action.outputSummary,
            endTime: Date.now(),
          },
        },
      };
    case "SET_ACTIVE_CAPABILITY":
      return { ...state, activeCapability: action.capability };
    case "SET_QUIZ_DATA":
      return { ...state, quizData: action.data, quizResult: null };
    case "SET_QUIZ_RESULT":
      return { ...state, quizResult: action.result };
    case "SET_EXAM_DATA":
      return { ...state, examData: action.data };
    case "SET_RESOURCE_PACKAGE":
      return { ...state, resourcePackage: action.data };
    case "AGENT_MESSAGE":
      return {
        ...state,
        agentEdges: [
          ...state.agentEdges.slice(-29),
          {
            id: `${action.from}->${action.to}-${state.agentEdges.length}-${Date.now()}`,
            from: action.from,
            to: action.to,
            label: action.label,
            payload: action.payload,
            timestamp: Date.now(),
          },
        ],
      };
    case "SET_SOURCES":
      return {
        ...state,
        knowledgeSources: action.sources,
        lowConfidenceSources: action.lowConfidence,
      };
    case "PROFILE_EVIDENCE":
      return {
        ...state,
        profileEvidence: [
          ...state.profileEvidence.slice(-49),
          {
            dimension: action.dimension,
            value: action.value,
            evidence: action.evidence,
            turn: action.turn,
            timestamp: Date.now(),
          },
        ],
      };
    case "LOOP_STEP":
      return {
        ...state,
        loopSteps: [
          ...state.loopSteps.slice(-19),
          {
            step: action.step,
            status: action.status,
            metadata: action.metadata,
            timestamp: Date.now(),
          },
        ],
      };
    case "GUARDRAIL":
      return {
        ...state,
        guardrail: {
          severity: action.severity,
          reason: action.reason,
          matched: action.matched,
          timestamp: Date.now(),
        },
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface ChatContextType {
  state: ChatState;
  sendMessage: (content: string, capability?: string) => void;
  cancelTurn: () => void;
  newSession: () => void;
  switchSession: (sessionId: string) => void;
  clearError: () => void;
  submitQuizAnswer: (answers: { question_index: number; answer: number | boolean | string | number[] }[]) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | null>(null);
const STREAM_TIMEOUT_MS = 120_000;

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const wsRef = useRef<ZhiPathWS | null>(null);
  const sessionIdRef = useRef("");
  const activeCapabilityRef = useRef("");
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStreamingRef = useRef(false);

  sessionIdRef.current = state.sessionId;
  isStreamingRef.current = state.isStreaming;

  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
  }, []);

  const startStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    streamTimeoutRef.current = setTimeout(() => {
      dispatch({
        type: "SET_ERROR",
        error: "响应超时，请稍后重试或缩小问题范围。",
      });
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout]);

  const ensureWS = useCallback((): ZhiPathWS => {
    if (wsRef.current) return wsRef.current;

    const ws = new ZhiPathWS(wsUrl("/api/v1/ws"));

    ws.on("session", (data) => {
      if (typeof data.session_id === "string") {
        dispatch({ type: "SET_SESSION", sessionId: data.session_id });
      }
    });

    ws.on("stream", (data) => {
      if (typeof data.content === "string") {
        dispatch({ type: "STREAM_CHUNK", content: data.content });
      }
    });

    ws.on("thinking", (data) => {
      if (typeof data.content === "string") {
        dispatch({ type: "ADD_THINKING", content: data.content });
      }
    });

    ws.on("stage_start", (data) => {
      if (typeof data.stage === "string") {
        dispatch({ type: "STAGE_START", stage: data.stage });
      }
    });

    ws.on("tool_call", (data) => {
      if (typeof data.source === "string") {
        dispatch({
          type: "AGENT_CALL",
          source: data.source,
          inputSummary: typeof data.content === "string" ? data.content : "",
        });
      }
    });

    ws.on("tool_result", (data) => {
      if (typeof data.source === "string") {
        dispatch({
          type: "AGENT_RESULT",
          source: data.source,
          outputSummary: typeof data.content === "string" ? data.content : "",
          status: (data.metadata as Record<string, unknown>)?.status === "error" ? "error" : "success",
        });
      }
    });

    ws.on("stage_end", (data) => {
      if (typeof data.stage === "string") {
        dispatch({ type: "STAGE_END", stage: data.stage });
      }
    });

    ws.on("result", (data) => {
      if (typeof data.content === "string") {
        dispatch({ type: "SET_RESULT", content: data.content });
      }
    });

    ws.on("agent_message", (data) => {
      const from = typeof data.from === "string" ? data.from : "";
      const to = typeof data.to === "string" ? data.to : "";
      if (!from || !to) return;
      dispatch({
        type: "AGENT_MESSAGE",
        from,
        to,
        label: typeof data.label === "string" ? data.label : "",
        payload: data.payload,
      });
    });

    ws.on("sources", (data) => {
      const sources = Array.isArray(data.sources) ? (data.sources as KnowledgeSource[]) : [];
      dispatch({
        type: "SET_SOURCES",
        sources,
        lowConfidence: Boolean(data.low_confidence),
      });
    });

    ws.on("profile_update", (data) => {
      const dimension = typeof data.dimension === "string" ? data.dimension : "";
      if (!dimension) return;
      dispatch({
        type: "PROFILE_EVIDENCE",
        dimension,
        value: typeof data.value === "string" ? data.value : "",
        evidence: typeof data.evidence === "string" ? data.evidence : "",
        turn: typeof data.turn === "number" ? data.turn : 0,
      });
    });

    ws.on("loop_step", (data) => {
      const step = typeof data.step === "string" ? data.step : "";
      if (!step) return;
      dispatch({
        type: "LOOP_STEP",
        step,
        status: typeof data.status === "string" ? data.status : "running",
        metadata: (data.metadata as Record<string, unknown>) ?? undefined,
      });
    });

    ws.on("guardrail", (data) => {
      dispatch({
        type: "GUARDRAIL",
        severity: typeof data.severity === "string" ? data.severity : "warning",
        reason: typeof data.reason === "string" ? data.reason : "",
        matched: Array.isArray(data.matched) ? (data.matched as string[]) : [],
      });
      const reason = typeof data.reason === "string" ? data.reason : "命中安全策略";
      showInfo(`🛡 ${reason}`);
    });

    ws.on("done", () => {
      clearStreamTimeout();
      dispatch({ type: "STREAM_END" });
      if (sessionIdRef.current && activeCapabilityRef.current === "resource_gen") {
        getLatestQuiz(sessionIdRef.current)
          .then((quiz) => {
            if (quiz) dispatch({ type: "SET_QUIZ_DATA", data: quiz });
          })
          .catch(() => { /* ignore */ });
        getLatestExam(sessionIdRef.current)
          .then((exam) => {
            if (exam) dispatch({ type: "SET_EXAM_DATA", data: exam });
          })
          .catch(() => { /* ignore */ });
        getLatestResourcePackage(sessionIdRef.current)
          .then((resourcePackage) => {
            if (resourcePackage) {
              dispatch({ type: "SET_RESOURCE_PACKAGE", data: resourcePackage });
            }
          })
          .catch(() => { /* ignore */ });
      }
    });

    ws.on("error", (data) => {
      clearStreamTimeout();
      const msg = typeof data.content === "string" ? data.content : "WebSocket 连接错误";
      dispatch({ type: "SET_ERROR", error: msg });
      showError(msg);
    });

    ws.connect();
    wsRef.current = ws;
    return ws;
  }, [clearStreamTimeout]);

  useEffect(() => {
    return () => {
      clearStreamTimeout();
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, [clearStreamTimeout]);

  const sendMessage = useCallback(
    (content: string, capability = "chat") => {
      if (isStreamingRef.current) return;

      dispatch({ type: "ADD_USER_MSG", content });
      dispatch({ type: "STREAM_START" });
      dispatch({ type: "SET_ACTIVE_CAPABILITY", capability });
      activeCapabilityRef.current = capability;
      startStreamTimeout();

      const ws = ensureWS();
      ws.send({
        type: "start_turn",
        content,
        session_id: sessionIdRef.current,
        capability,
      });
    },
    [ensureWS, startStreamTimeout],
  );

  const cancelTurn = useCallback(() => {
    clearStreamTimeout();
    const ws = wsRef.current;
    if (ws?.isConnected()) {
      ws.send({ type: "cancel_turn" });
    }
    dispatch({ type: "STREAM_CANCEL" });
  }, [clearStreamTimeout]);

  const newSession = useCallback(() => {
    clearStreamTimeout();
    wsRef.current?.disconnect();
    wsRef.current = null;
    dispatch({ type: "RESET" });
  }, [clearStreamTimeout]);

  const switchGeneration = useRef(0);

  const switchSession = useCallback(
    async (sessionId: string) => {
      clearStreamTimeout();
      wsRef.current?.disconnect();
      wsRef.current = null;
      dispatch({ type: "RESET" });

      const gen = ++switchGeneration.current;

      try {
        const res = await apiFetch(`/api/v1/sessions/${sessionId}`);
        if (!res.ok) {
          if (switchGeneration.current === gen) {
            dispatch({ type: "SET_ERROR", error: "加载历史会话失败" });
          }
          return;
        }
        const session = await res.json();
        if (switchGeneration.current !== gen) return;
        dispatch({ type: "SET_SESSION", sessionId: session.id });
        for (const msg of session.messages || []) {
          if (switchGeneration.current !== gen) return;
          if (msg.role === "user") {
            dispatch({ type: "ADD_USER_MSG", content: msg.content });
          } else if (msg.role === "assistant") {
            dispatch({ type: "ADD_ASSISTANT_MSG", content: msg.content });
          }
        }
        const [quiz, exam, resourcePackage] = await Promise.all([
          getLatestQuiz(sessionId).catch(() => null),
          getLatestExam(sessionId).catch(() => null),
          getLatestResourcePackage(sessionId).catch(() => null),
        ]);
        if (switchGeneration.current !== gen) return;
        if (quiz) dispatch({ type: "SET_QUIZ_DATA", data: quiz });
        if (exam) dispatch({ type: "SET_EXAM_DATA", data: exam });
        if (resourcePackage) {
          dispatch({ type: "SET_RESOURCE_PACKAGE", data: resourcePackage });
        }
      } catch {
        dispatch({ type: "SET_ERROR", error: "加载历史会话失败" });
      }
    },
    [clearStreamTimeout],
  );

  const clearError = useCallback(() => dispatch({ type: "CLEAR_ERROR" }), []);

  const submitQuizAnswer = useCallback(
    async (answers: { question_index: number; answer: number | boolean | string | number[] }[]) => {
      if (!sessionIdRef.current) return;
      try {
        const { submitQuiz } = await import("@/lib/api");
        const result = await submitQuiz(sessionIdRef.current, answers);
        dispatch({ type: "SET_QUIZ_RESULT", result });
      } catch {
        dispatch({ type: "SET_ERROR", error: "提交答案失败" });
      }
    },
    [],
  );

  return (
    <ChatContext.Provider
      value={{
        state,
        sendMessage,
        cancelTurn,
        newSession,
        switchSession,
        clearError,
        submitQuizAnswer,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

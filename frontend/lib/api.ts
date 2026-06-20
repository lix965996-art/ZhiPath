import { withCredentials } from "@/lib/credentials";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const WS_HOST = process.env.NEXT_PUBLIC_WS_HOST || "localhost:8000";

/** 从 localStorage 读取 auth token。 */
function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("zhipath-auth-token");
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function wsUrl(path: string): string {
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${WS_HOST}${path}`;
}

/** fetch 包装：自动注入 X-LF-* 凭据头 + auth token。
 *  其余参数透传。所有内部 API 调用应统一走这里。 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(withCredentials(init.headers));

  // 注入 auth token（如果有）
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(apiUrl(input), { ...init, headers });
}

export interface ProfileEvidenceEntry {
  dimension: string;
  value: string;
  turn: number;
  snippet: string;
  capability?: string;
}

export interface ProfileDimensionCoverage {
  score: number;
  total: number;
  ratio: number;
  dimensions: Record<string, boolean>;
}

export interface ProfileInsightCard {
  id: string;
  title: string;
  dimension: string;
  status: string;
  confidence: number;
  evidence_count: number;
  sources: string[];
  rationale: string;
  action: string;
  target?: string;
}

export interface ProfileInsights {
  trust_score: number;
  evidence_total: number;
  cards: ProfileInsightCard[];
  next_actions: string[];
  summary: string;
}

/** 408 考研场景上下文（作者本人 dogfood 场景）。 */
export interface ExamContext {
  exam_code?: string;          // "408"
  target_school?: string;      // 院校层次
  exam_stage?: string;         // 基础 / 强化 / 冲刺
  weak_subjects?: string[];    // 408 四门里的弱项
  daily_hours?: number;
  exam_date?: string;          // ISO yyyy-mm-dd
  subject_mastery?: Record<string, number>; // 0-1, 4 门 BKT 平均
}

export interface LearningProfile {
  session_id: string;
  learning_goal: string;
  level: string;
  topics: string[];
  weak_points: string[];
  preferences: string[];
  constraints: string[];
  recent_intents: string[];
  turn_count: number;
  last_capability?: string;
  quiz_accuracy?: number;
  last_quiz_time?: string;
  created_at?: string;
  updated_at?: string;
  // 画像证据链（评委演示重点）
  evidence_log?: ProfileEvidenceEntry[];
  evidence_index?: Record<string, Array<{ dimension: string; turn: number; snippet: string }>>;
  dimension_coverage?: ProfileDimensionCoverage;
  profile_insights?: ProfileInsights;
  exam_context?: ExamContext;
}

export interface ProfileEvidenceResponse {
  evidence_log: ProfileEvidenceEntry[];
  evidence_index: Record<string, Array<{ dimension: string; turn: number; snippet: string }>>;
  dimension_coverage: ProfileDimensionCoverage;
}

export async function getProfileEvidence(sessionId: string): Promise<ProfileEvidenceResponse> {
  const response = await apiFetch(`/api/v1/profile/${sessionId}/evidence`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load profile evidence: ${response.status}`);
  }
  return response.json();
}

export interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  tags: string[];
  source: string;
  created_at: string;
  chunk_count: number;
  retrieval?: string;
}

export interface KnowledgeSearchResult {
  document_id: string;
  title: string;
  content: string;
  tags: string[];
  score: number;
  retrieval_mode: "pgvector" | "lexical" | string;
}

export async function getLearningProfile(sessionId: string): Promise<LearningProfile> {
  const response = await apiFetch(`/api/v1/profile/${sessionId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load profile: ${response.status}`);
  }
  return response.json();
}

export async function listSessions(limit = 50): Promise<SessionSummary[]> {
  const response = await apiFetch(`/api/v1/sessions?limit=${limit}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load sessions: ${response.status}`);
  }
  return response.json();
}

export async function listKnowledgeDocuments(): Promise<KnowledgeDocumentSummary[]> {
  const response = await apiFetch("/api/v1/knowledge/documents", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load knowledge documents: ${response.status}`);
  }
  return response.json();
}

export async function addKnowledgeDocument(input: {
  title: string;
  content: string;
  tags: string[];
}): Promise<KnowledgeDocumentSummary> {
  const response = await apiFetch("/api/v1/knowledge/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Failed to add knowledge document: ${response.status}`);
  }
  return response.json();
}

export interface KnowledgeTopologyNode {
  id: string;
  title: string;
  tags: string[];
  chunk_count: number;
  source: string;
}

export interface KnowledgeTopologyEdge {
  source: string;
  target: string;
  similarity: number;
}

export interface KnowledgeTopology {
  nodes: KnowledgeTopologyNode[];
  edges: KnowledgeTopologyEdge[];
  embedding_dim: number;
  threshold: number;
  retrieval: "pgvector" | "lexical" | string;
}

export async function getKnowledgeTopology(): Promise<KnowledgeTopology> {
  const response = await apiFetch("/api/v1/knowledge/topology", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load topology: ${response.status}`);
  }
  return response.json();
}

// ---- 语义空间真投影 (768d → 2D PCA) ----

export interface SemanticMapNode {
  id: string;
  title: string;
  tags: string[];
  chunk_count: number;
  x: number; // [0,1] 真 PCA 坐标
  y: number;
}

export interface SemanticMap {
  nodes: SemanticMapNode[];
  edges: KnowledgeTopologyEdge[];
  explained_variance: number;
  embedding_dim: number;
  retrieval: string;
}

export interface QueryProjection {
  x: number;
  y: number;
  topk: Array<{
    document_id: string;
    title: string;
    similarity: number;
  }>;
}

export async function getSemanticMap(): Promise<SemanticMap> {
  const response = await apiFetch("/api/v1/knowledge/semantic_map", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load semantic map: ${response.status}`);
  }
  return response.json();
}

export async function projectQuery(
  q: string,
  k = 5,
): Promise<QueryProjection> {
  const params = new URLSearchParams({ q, k: String(k) });
  const response = await apiFetch(`/api/v1/knowledge/project_query?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to project query: ${response.status}`);
  }
  return response.json();
}

export async function searchKnowledge(
  query: string,
  k = 5,
): Promise<KnowledgeSearchResult[]> {
  const params = new URLSearchParams({ q: query, k: String(k) });
  const response = await apiFetch(`/api/v1/knowledge/search?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to search knowledge: ${response.status}`);
  }
  return response.json();
}

// ---- Quiz ----

export interface QuizQuestion {
  question: string;
  options?: string[];
  correct_option?: number | string | number[];
  correct_options?: Array<number | string>;
  correct_answer?: boolean;
  expected_answer?: string;
  explanation?: string;
  _type: "single_choice" | "multiple_choice" | "true_false" | "short_answer";
}

export interface QuizData {
  single_choice_questions: QuizQuestion[];
  multiple_choice_questions: QuizQuestion[];
  true_false_questions: QuizQuestion[];
  short_answer_questions: QuizQuestion[];
}

export interface ShortAnswerFeedback {
  index: number;        // 在 flatten 后的题目列表中的下标
  score: number;        // 0~1
  passed: boolean;
  covered: string[];    // 答到的要点
  missing: string[];    // 漏掉的要点
  errors: string[];     // 说错/概念混淆处
  diagnosis: string;    // 思路断在哪
  follow_up: string;    // 引导性追问（不直接给答案）
  offline: boolean;     // true = LLM 不可用时的离线粗判
}

export interface QuizSubmitResult {
  total: number;
  correct: number;
  accuracy: number;
  wrong_topics: string[];
  analysis: string;
  path_updated: boolean;
  wrong_indices?: number[];                      // 真正答错的题目下标（前端据此精确标红，而非按位置）
  short_answer_feedback?: ShortAnswerFeedback[]; // 简答题逐点点评
  remediation_plan?: {
    mastery_level: string;
    priority: "low" | "medium" | "high" | string;
    strategy: string;
    target_topics: string[];
    error_patterns: string[];
    next_tasks: string[];
    resource_actions: Array<{
      type: string;
      label: string;
      prompt: string;
    }>;
    acceptance_criteria: string[];
  };
}

export async function getLatestQuiz(sessionId: string): Promise<QuizData | null> {
  const response = await apiFetch(`/api/v1/quiz/${sessionId}/latest`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data || null;
}

export async function submitQuiz(
  sessionId: string,
  answers: { question_index: number; answer: number | boolean | string | number[] }[],
): Promise<QuizSubmitResult> {
  const response = await apiFetch("/api/v1/quiz/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, answers }),
  });
  if (!response.ok) throw new Error("Quiz submit failed");
  return response.json();
}

// ---- Exams ----

export interface ExamQuestion {
  id: string;
  type: "single_choice" | "multiple_choice" | "true_false" | "short_answer";
  section: string;
  score: number;
  question: string;
  options: string[];
  answer: string | number | boolean | Array<string | number>;
  explanation: string;
  knowledge_point: string;
}

export interface ExamData {
  id: string;
  session_id: string;
  title: string;
  subject: string;
  topic: string;
  duration_minutes: number;
  total_score: number;
  questions: ExamQuestion[];
  created_at: string;
}

export async function getLatestExam(sessionId: string): Promise<ExamData | null> {
  const response = await apiFetch(`/api/v1/exams/session/${sessionId}/latest`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data || null;
}

// ---- Learning Resource Packages ----

export interface ResourcePackageAsset {
  type: "quiz" | "exam" | "flashcards" | "mindmap" | "audio" | "code_lab" | "video" | string;
  label: string;
  status: "ready" | "pending" | string;
  count?: number;
  ref_id?: string;
  url?: string;
  language?: string;
  title?: string;
}

export interface CodeCheckpoint {
  label: string;
}

export interface CodeLabSnippet {
  title: string;
  description: string;
  language: string;
  code: string;
  test_input?: string;
  expected_output?: string;
  checkpoints?: CodeCheckpoint[];
  hints?: string[];
}

export interface CodeLabResource {
  title: string;
  language: string;
  snippets: CodeLabSnippet[];
  practice_tasks?: string[];
}

export interface CodeLabRunResult {
  ok: boolean;
  ran: boolean;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  blocked: boolean;
  compiler: string;
  reason: string; // ok / runtime_error / compile_error / timeout / no_compiler / blocked
  matched_patterns?: string[];
  matched_expected?: boolean;
  diff?: string[];
}

export interface MermaidDiagram {
  title: string;
  diagram_type: string;
  mermaid_code: string;
  narrative?: string;
  alternatives?: string[];
}

export interface KnowledgeSourceRef {
  index: number;
  title: string;
  document_id?: string;
  tags?: string[];
  score?: number;
  excerpt?: string;
  retrieval_mode?: string;
}

export interface ResourcePackageSection {
  title: string;
  summary: string;
}

// ---- Path Revisions (PathScheduler 真实重规划记录) ----

export interface PathRevisionRecord {
  id: string;
  session_id: string;
  timestamp: string;
  trigger: "profile_update" | "quiz_feedback" | "explicit_request" | string;
  reason: string;
  previous_summary: string;
  new_summary: string;
  previous_stage_count: number;
  new_stage_count: number;
  metadata: Record<string, unknown>;
}

export interface PathRevisionsResponse {
  session_id: string;
  count: number;
  revisions: PathRevisionRecord[];
}

export async function getPathRevisions(
  sessionId: string,
  limit = 20,
): Promise<PathRevisionsResponse> {
  const response = await apiFetch(
    `/api/v1/path/${sessionId}/revisions?limit=${limit}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Failed to load path revisions: ${response.status}`);
  }
  return response.json();
}

// ---- xAPI 资源真实学习时长聚合 ----

export interface ResourceAvgDuration {
  avg_seconds: number;
  samples: number;
  recent: Array<{
    session_id: string;
    duration_seconds: number;
    timestamp: string;
  }>;
}

export async function getResourceAvgDuration(
  objectId: string,
): Promise<ResourceAvgDuration> {
  const response = await apiFetch(
    `/api/v1/xapi/resource/${encodeURIComponent(objectId)}/avg_duration`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Failed to load avg duration: ${response.status}`);
  }
  return response.json();
}

export interface LearningResourcePackage {
  id: string;
  session_id: string;
  title: string;
  topic: string;
  source_prompt: string;
  learner_snapshot: {
    learning_goal: string;
    level: string;
    topics: string[];
    weak_points: string[];
    preferences: string[];
    constraints: string[];
  };
  adaptation_basis: string[];
  knowledge_evidence: {
    has_context: boolean;
    excerpt: string;
    sources?: KnowledgeSourceRef[];
  };
  resources: {
    micro_lecture?: {
      title: string;
      sections: ResourcePackageSection[];
      audio_url?: string;
      audio_provider?: string;
    };
    quiz?: {
      question_count: number;
      sections: Array<{ label: string; count: number }>;
      data: QuizData;
    };
    exam?: {
      id: string;
      title: string;
      subject: string;
      topic: string;
      question_count: number;
      total_score: number;
      duration_minutes: number;
    } | null;
    flashcards?: {
      title?: string;
      cards?: Array<{ front: string; back: string; difficulty?: string }>;
    };
    mindmap?: {
      title?: string;
      nodes?: Array<{ id: string; label: string; children: string[] }>;
    };
    code_lab?: CodeLabResource;
    mermaid?: MermaidDiagram;
    video_lesson?: {
      url: string;
      title: string;
      topic?: string;
      template?: string;
      duration?: number;
      narration_provider?: string;
      has_audio?: boolean;
    };
  };
  assets: ResourcePackageAsset[];
  // 真实可追溯字段 (后端落库, 替代前端启发式推断)
  generated_for_stage?: {
    id: string;        // "resource"
    camp_num: number;  // 4
    label: string;     // "Camp 4 · 资源包生成"
  };
  weak_points_targeted?: string[];
  pipeline_steps?: Array<{
    id: string;
    label: string;
    status: "done" | "pending";
    timestamp: string | null;
    note: string;
  }>;
  // 同主题重复生成会合并更新, 此为版本计数
  regeneration_count?: number;
  next_actions: string[];
  created_at: string;
  updated_at: string;
}

export async function runCCode(input: {
  code: string;
  stdin?: string;
  expected_output?: string;
}): Promise<CodeLabRunResult> {
  const response = await apiFetch("/api/v1/resources/code-lab/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: input.code,
      stdin: input.stdin ?? "",
      expected_output: input.expected_output ?? "",
    }),
  });
  if (!response.ok) {
    throw new Error(`代码运行失败：${response.status}`);
  }
  return response.json();
}

export interface CodeLabCoach {
  diagnosis: string; // 代码/思路断在哪
  hint: string;      // 一条下一步提示（不直接给答案）
  focus: string;     // 需回顾的知识点（可空）
}

// 学生代码未通过时，主动求一次「导师点拨」。LLM 不可用时返回 null。
export async function coachCodeLab(input: {
  code: string;
  description?: string;
  expected_output?: string;
  reason?: string;
  stderr?: string;
  diff?: string[];
}): Promise<CodeLabCoach | null> {
  const response = await apiFetch("/api/v1/resources/code-lab/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: input.code,
      description: input.description ?? "",
      expected_output: input.expected_output ?? "",
      reason: input.reason ?? "wrong_output",
      stderr: input.stderr ?? "",
      diff: input.diff ?? [],
    }),
  });
  if (!response.ok) {
    throw new Error(`导师点拨失败：${response.status}`);
  }
  const data = await response.json();
  return data?.coach ?? null;
}

export async function listResourcePackages(sessionId?: string): Promise<LearningResourcePackage[]> {
  const params = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  const response = await apiFetch(`/api/v1/resources${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load resource packages: ${response.status}`);
  }
  return response.json();
}

export async function getResourcePackage(packageId: string): Promise<LearningResourcePackage> {
  const response = await apiFetch(`/api/v1/resources/${encodeURIComponent(packageId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load resource package: ${response.status}`);
  }
  return response.json();
}

export async function getLatestResourcePackage(sessionId: string): Promise<LearningResourcePackage | null> {
  const response = await apiFetch(`/api/v1/resources/session/${sessionId}/latest`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data || null;
}

// ---- Mastery (BKT) ----

export interface MasteryKC {
  kc_id: string;
  label: string;
  mastery: number;
  attempts: number;
  correct: number;
  accuracy: number;
  history: Array<{ ts: string; correct: boolean; mastery_after: number }>;
}

export interface MasterySnapshot {
  session_id: string;
  kcs: MasteryKC[];
  summary: {
    count: number;
    avg_mastery: number;
    weak: number;
    mature: number;
  };
  updated_at?: string;
}

export async function getMastery(sessionId: string): Promise<MasterySnapshot> {
  const r = await apiFetch(`/api/v1/mastery/${sessionId}`, { cache: "no-store" });
  if (!r.ok) throw new Error("mastery load failed");
  return r.json();
}

// ---- Learning History ----

/** 每个知识点的学习次数（基于会话消息关键词命中） */
export type LearningHistory = Record<string, number>;

export async function getLearningHistory(): Promise<LearningHistory> {
  const r = await apiFetch("/api/v1/knowledge/learning_history", { cache: "no-store" });
  if (!r.ok) return {};
  return r.json();
}

// ---- SRS (FSRS) ----

export interface FSRSCard {
  card_id: string;
  topic: string;
  front: string;
  back: string;
  stability: number;
  difficulty: number;
  state: "new" | "learning" | "review" | "relearning";
  due: string;
  reps: number;
  lapses: number;
  source?: string;
}

export interface ReviewCalendar {
  today: string;
  buckets: Record<string, Array<Partial<FSRSCard>>>;
  stats: {
    total: number;
    new: number;
    learning: number;
    review: number;
    relearning: number;
    avg_stability: number;
    avg_difficulty: number;
    mature_count: number;
  };
}

export async function getReviewCalendar(sessionId: string, days = 14): Promise<ReviewCalendar> {
  const r = await apiFetch(`/api/v1/review/${sessionId}/calendar?days=${days}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("calendar load failed");
  return r.json();
}

export async function getDueCards(sessionId: string, limit = 30): Promise<FSRSCard[]> {
  const r = await apiFetch(`/api/v1/review/${sessionId}/due?limit=${limit}`, {
    cache: "no-store",
  });
  if (!r.ok) return [];
  return r.json();
}

export async function rateCard(sessionId: string, cardId: string, rating: 1 | 2 | 3 | 4): Promise<FSRSCard | null> {
  const r = await apiFetch(`/api/v1/review/${sessionId}/cards/${cardId}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!r.ok) return null;
  return r.json();
}

// ---- Trace ----

export interface TraceSpan {
  span_id: string;
  trace_id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  start_time: number;
  end_time: number | null;
  duration_ms: number | null;
  attributes: Record<string, unknown>;
  status: string;
  error_message: string;
}

export interface TraceSummary {
  trace_id: string;
  span_count: number;
  start_time: number;
  end_time: number;
  duration_ms: number;
  root_name: string;
}

export async function listTraces(limit = 30): Promise<TraceSummary[]> {
  const r = await apiFetch(`/api/v1/trace?limit=${limit}`, { cache: "no-store" });
  if (!r.ok) return [];
  return r.json();
}

export async function getTrace(traceId: string): Promise<{ trace_id: string; spans: TraceSpan[] }> {
  const r = await apiFetch(`/api/v1/trace/${traceId}`, { cache: "no-store" });
  if (!r.ok) return { trace_id: traceId, spans: [] };
  return r.json();
}

// ---- Model Router ----

export interface ModelRouteInfo {
  name: string;
  primary: string;
  fallbacks: string[];
  description: string;
  primary_available: boolean;
}

export async function getModelRoutes(): Promise<{
  routes: ModelRouteInfo[];
  recent_routing: Array<{ task: string; profile: string; reason: string; success: boolean }>;
}> {
  const r = await apiFetch("/api/v1/router", { cache: "no-store" });
  if (!r.ok) return { routes: [], recent_routing: [] };
  return r.json();
}

// ---- Knowledge Graph ----

export interface KGNode {
  id: string;
  label: string;
  category: string;
  summary: string;
  difficulty: number;
  tags: string[];
}

export interface KGEdge {
  source: string;
  target: string;
  weight: number;
  relation: string;
}

export interface KnowledgeGraphData {
  nodes: KGNode[];
  edges: KGEdge[];
  updated_at?: string;
}

export async function getKnowledgeGraph(sessionId: string): Promise<KnowledgeGraphData> {
  const r = await apiFetch(`/api/v1/kg/${sessionId}`, { cache: "no-store" });
  if (!r.ok) return { nodes: [], edges: [] };
  return r.json();
}

export interface KGSuggestion {
  node: KGNode;
  current_mastery: number;
  prerequisites: string[];
  blocked: boolean;
}

export async function getKGSuggestions(sessionId: string, threshold = 0.6, limit = 5): Promise<KGSuggestion[]> {
  const r = await apiFetch(
    `/api/v1/kg/${sessionId}/suggest?threshold=${threshold}&limit=${limit}`,
    { cache: "no-store" },
  );
  if (!r.ok) return [];
  return r.json();
}

// ── Credentials API (简化版：直接传入配置测试) ────────────────────

export interface TestConfigResult {
  ok: boolean;
  reason: string;
  preview?: string;
}

export async function testApiConfig(config: {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiFormat: "openai" | "anthropic";
}): Promise<TestConfigResult> {
  const r = await apiFetch("/api/v1/credentials/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      apiFormat: config.apiFormat,
    }),
  });
  if (!r.ok) {
    return { ok: false, reason: `HTTP ${r.status}` };
  }
  return r.json();
}

export interface FetchModelsResult {
  ok: boolean;
  reason: string;
  models: string[];
  count: number;
}

export async function fetchModels(config: {
  apiKey: string;
  baseUrl: string;
  apiFormat: "openai" | "anthropic";
}): Promise<FetchModelsResult> {
  const r = await apiFetch("/api/v1/credentials/fetch-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      apiFormat: config.apiFormat,
    }),
  });
  if (!r.ok) {
    return { ok: false, reason: `HTTP ${r.status}`, models: [], count: 0 };
  }
  return r.json();
}

export async function testTtsConfig(tts: {
  appid: string;
  apiKey: string;
  apiSecret: string;
}): Promise<TestConfigResult> {
  const r = await apiFetch("/api/v1/credentials/test-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tts),
  });
  if (!r.ok) {
    return { ok: false, reason: `HTTP ${r.status}` };
  }
  return r.json();
}

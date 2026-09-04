export type QuestionType = 'mcq' | 'theory';

export interface MCQQuestion {
  id: string;
  type: 'mcq';
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  sourceContext?: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface TheoryQuestion {
  id: string;
  type: 'theory';
  question: string;
  modelAnswer: string;
  theoryRubric: string[];
  maxPoints?: number;
  explanation: string;
  sourceContext?: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export type Question = MCQQuestion | TheoryQuestion;

export interface Quiz {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  documentNames: string[];
  totalQuestions: number;
  mcqCount: number;
  theoryCount: number;
  difficulty: string;
  topicsCovered: string[];
  questions: Question[];
  modelUsed?: string;
  /** Legacy field from before the API rework — old saved quizzes may still carry it. */
  documents?: Array<{ name: string; type?: string; size?: number; textContent?: string; dataUrl?: string }>;
  /** Server-side warnings (e.g. document truncation) surfaced after generation. */
  warnings?: string[];
}

export interface TheoryEvaluation {
  questionId: string;
  score: number; // e.g. 0 to 5 or percentage
  maxScore: number;
  percentage: number;
  feedback: string;
  keyPointsAddressed: string[];
  missingKeyPoints: string[];
  improvementTips: string[];
  modelUsed?: string;
}

export interface UserAnswer {
  questionId: string;
  selectedOptionIndex?: number; // for MCQ
  textAnswer?: string; // for Theory
  isCorrect?: boolean; // for MCQ
  flaggedForReview?: boolean;
  timeSpentSeconds?: number;
  theoryEvaluation?: TheoryEvaluation;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  quizTitle: string;
  timestamp: string;
  timeTakenSeconds: number;
  totalQuestions: number;
  mcqCorrect: number;
  mcqTotal: number;
  theoryEarnedPoints: number;
  theoryTotalPoints: number;
  overallPercentage: number;
  ratingGrade: 'Mastered' | 'Proficient' | 'Competent' | 'Needs Review';
  answers: Record<string, UserAnswer>;
  quiz: Quiz;
}

export type AppTheme = 'red-light' | 'black-red-dark' | 'editorial-light' | 'carbon-dark' | 'sapphire-navy';

export interface UserPreferences {
  hasCompletedWizard: boolean;
  defaultMcqCount: number;
  defaultTheoryCount: number;
  defaultDifficulty: string;
  autoSaveToVault: boolean;
  timerMinutesPerQuestion: number;
  preferredModel?: string; // full "provider:model" id, e.g. "google:gemini-2.5-flash"
  theme: AppTheme;
}

export interface UploadedFileSummary {
  id: string;
  name: string;
  size: number;
  type: string;
  base64?: string;
  textContent?: string;
}

export interface ModelInfo {
  id: string;
  provider: string;
  providerLabel: string;
  label: string;
  tier: "fast" | "balanced" | "premium";
  pricing: { input: number; output: number };
  freeTier: { rpm: number; rpd: number } | null;
  hasKey: boolean;
}

export interface ServerConfig {
  activeModel: string;
  providers: Record<string, boolean>;
}

export interface UsageBucket {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  failedRequests: number;
}

export interface UsageSummary {
  today: UsageBucket;
  month: UsageBucket;
  perModel: Array<UsageBucket & { model: string }>;
  freeTier: { model: string; requestsToday: number; rpd: number; warning: boolean } | null;
}

export interface UsageSummaryResponse {
  summary: UsageSummary;
}

export interface TutorChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface StoredQuestionRecord {
  id: string;
  documentNames: string[];
  docKey: string;
  question: string;
  type: 'mcq' | 'theory';
  options?: string[];
  correctAnswerIndex?: number;
  explanation?: string;
  modelAnswer?: string;
  theoryRubric?: string[];
  topic?: string;
  difficulty?: string;
  sourceContext?: string;
  createdAt: string;
  sourceQuizTitle?: string;
}

export interface QuestionBankStats {
  totalQuestions: number;
  totalDocuments: number;
  documentMap: Record<string, number>;
}


import { describe, it, expect } from "vitest";
import { quizSchema, evaluationSchema } from "../server/ai/schemas";

const validQuiz = {
  title: "Cell Biology Basics",
  summary: "Covers organelles and mitosis",
  topicsCovered: ["Organelles", "Mitosis"],
  questions: [
    {
      id: "q-1",
      type: "mcq",
      question: "Which organelle produces ATP?",
      options: ["Mitochondrion", "Ribosome", "Nucleus", "Lysosome"],
      correctAnswerIndex: 0,
      explanation: "Mitochondria carry out oxidative phosphorylation.",
      sourceContext: "Chapter 2, p. 31",
      modelAnswer: "",
      theoryRubric: [],
      topic: "Organelles",
      difficulty: "medium",
    },
    {
      id: "q-2",
      type: "theory",
      question: "Explain the stages of mitosis.",
      options: [],
      correctAnswerIndex: -1,
      explanation: "Prophase, metaphase, anaphase, telophase.",
      sourceContext: "Chapter 3",
      modelAnswer: "Mitosis proceeds through prophase...",
      theoryRubric: ["Names all four stages", "Describes chromosome behavior"],
      topic: "Mitosis",
      difficulty: "hard",
    },
  ],
};

describe("quizSchema", () => {
  it("accepts a well-formed quiz", () => {
    expect(quizSchema.parse(validQuiz).questions).toHaveLength(2);
  });

  it("rejects an unknown question type", () => {
    const bad = { ...validQuiz, questions: [{ ...validQuiz.questions[0], type: "essay" }] };
    expect(() => quizSchema.parse(bad)).toThrow();
  });

  it("rejects a quiz with no questions array", () => {
    const { questions, ...noQuestions } = validQuiz;
    expect(() => quizSchema.parse(noQuestions)).toThrow();
  });
});

describe("evaluationSchema", () => {
  it("accepts a well-formed evaluation", () => {
    const evaluation = evaluationSchema.parse({
      score: 4,
      maxScore: 5,
      percentage: 80,
      feedback: "Good structure, missed one rubric point.",
      keyPointsAddressed: ["Names stages"],
      missingKeyPoints: ["Chromosome behavior"],
      improvementTips: ["Review anaphase"],
    });
    expect(evaluation.score).toBe(4);
  });

  it("rejects a missing feedback field", () => {
    expect(() => evaluationSchema.parse({ score: 4, maxScore: 5, percentage: 80 })).toThrow();
  });
});

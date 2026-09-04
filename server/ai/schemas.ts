import { z } from "zod";

export const quizSchema = z.object({
  title: z.string().describe("Descriptive title for this quiz based on document content"),
  summary: z.string().describe("A concise overview of the concepts and domains tested in this quiz"),
  topicsCovered: z.array(z.string()).describe("Key topics/chapters covered in this quiz"),
  questions: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["mcq", "theory"]),
        question: z.string(),
        options: z.array(z.string()).describe("4 options for MCQ (empty array for theory)"),
        correctAnswerIndex: z.number().int().describe("0-3 index of correct option for MCQ (-1 for theory)"),
        explanation: z.string().describe("In-depth explanation of the correct answer"),
        sourceContext: z.string().describe("Relevant quote or page reference from the source document"),
        modelAnswer: z.string().describe("Exemplary answer for theory questions (empty for MCQ)"),
        theoryRubric: z.array(z.string()).describe("Key grading criteria for theory questions (empty for MCQ)"),
        topic: z.string(),
        difficulty: z.string(),
      })
    )
    .describe("Assessment questions"),
});

export const evaluationSchema = z.object({
  score: z.number().describe("Awarded score from 0 to maxScore"),
  maxScore: z.number(),
  percentage: z.number().describe("Percentage score 0 to 100"),
  feedback: z.string().describe("Constructive feedback and critique"),
  keyPointsAddressed: z.array(z.string()).describe("Rubric criteria or key concepts the student got right"),
  missingKeyPoints: z.array(z.string()).describe("Key points the student missed or explained incorrectly"),
  improvementTips: z.array(z.string()).describe("Concrete tips for revision"),
});

export type QuizResult = z.infer<typeof quizSchema>;
export type EvaluationResult = z.infer<typeof evaluationSchema>;

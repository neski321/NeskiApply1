/**
 * Interview prep generation: uses the selected AI provider and the elite 3-mode prompt.
 */

import { storage } from "./storage";
import { callAIWithFallback } from "./ai-service";

export const INTERVIEW_PREP_SYSTEM_PROMPT = `You are an elite interview preparation engine.

You operate in exactly 3 modes:

1) SCREENING_MODE
- Generate high-probability first-round questions (recruiter + hiring manager).
- Verify resume claims, communication, impact, and role fit.
- Include a mix of behavioral + light technical tailored to the role.
- Keep questions realistic and commonly asked.

2) TECHNICAL_DEEP_DIVE_MODE
- Generate challenging technical questions tailored to the role's stack.
- Include architecture/system design (when relevant), debugging, trade-offs, and practical scenarios.
- Ask at least 30% scenario-based questions ("what would you do if…").
- Provide concise "what a strong answer includes" bullets when asked.

3) PRESSURE_TEST_MODE
- Act as a skeptical senior interviewer.
- Ask probing follow-ups that expose gaps, inconsistencies, shallow knowledge, or weak decisions.
- Stress-test ownership, incident handling, prioritization, and edge cases.
- Keep it tough but fair and job-relevant.

Mode switching rule:
When the user provides: mode: <MODE_NAME>
You must respond only in that mode.

Global rules:
- Always tailor to the provided Job Description + Candidate Profile.
- Avoid generic questions.
- If information is missing, make reasonable assumptions based on role_type and stack.
- Output must be structured, scannable, and interview-realistic.

Answers:
- For each question, also provide a sample answer the candidate could use in the interview.
- Answers must sound natural and human: non-AI cadence, in first person, grounded in the candidate's resume and experience. No corporate fluff or generic phrasing.
- Keep answers concise but specific so the candidate can adapt them in their own words.

Format:
- Use plain text only. Do not use markdown or formatting symbols: no ##, no **, no __, no *, no #, no bullets like - or •. Use simple line breaks, numbers, and indentation only.`;

export const INTERVIEW_PREP_MODES = {
  screening: "SCREENING_MODE",
  technical_deep_dive: "TECHNICAL_DEEP_DIVE_MODE",
  pressure_test: "PRESSURE_TEST_MODE",
} as const;

export type InterviewPrepMode = keyof typeof INTERVIEW_PREP_MODES;

const DEFAULT_INTERVIEW_STAGE: Record<InterviewPrepMode, string> = {
  screening: "phone_screen",
  technical_deep_dive: "technical_round",
  pressure_test: "senior_round",
};

interface ExtractedContext {
  role_type: string;
  seniority: string;
  company_type: string;
  stack_focus: string;
  competencies_to_test: string;
}

const EXTRACT_CONTEXT_PROMPT = `Extract interview context from the job description and candidate profile. Return ONLY a valid JSON object with exactly these keys (no markdown, no explanation):
- role_type: e.g. backend, frontend, fullstack, data, devops
- seniority: e.g. junior, intermediate, senior, staff
- company_type: e.g. tech, finance, healthcare, startup
- stack_focus: comma-separated technologies/tools from the job (e.g. Java, Spring Boot, MongoDB, AWS)
- competencies_to_test: comma-separated areas to assess (e.g. API design, data modeling, performance, testing)

Be concise. Use only what is stated or clearly implied.`;

async function extractContextFromJobAndResume(
  jobDescription: string,
  candidateProfile: string,
  userId: string,
  providerOverride?: string
): Promise<ExtractedContext> {
  const extractResult = await callAIWithFallback(
    [
      { role: "system", content: EXTRACT_CONTEXT_PROMPT },
      {
        role: "user",
        content: `Job Description:\n${jobDescription.slice(0, 6000)}\n\nCandidate Profile:\n${candidateProfile.slice(0, 4000)}`,
      },
    ],
    "sonar-pro",
    userId,
    providerOverride
  );

  const raw = extractResult?.content?.trim() ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        role_type: String(parsed.role_type ?? "see job description").slice(0, 200),
        seniority: String(parsed.seniority ?? "intermediate").slice(0, 100),
        company_type: String(parsed.company_type ?? "see job description").slice(0, 200),
        stack_focus: String(parsed.stack_focus ?? "see job description").slice(0, 400),
        competencies_to_test: String(parsed.competencies_to_test ?? "see job description").slice(0, 400),
      };
    } catch {
      // fall through to defaults
    }
  }

  return {
    role_type: "see job description",
    seniority: "intermediate",
    company_type: "see job description",
    stack_focus: "see job description",
    competencies_to_test: "see job description",
  };
}

/** Strip markdown symbols from AI output so the saved content is plain text. */
function stripMarkdownSymbols(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, "")           // ## headings
    .replace(/\*\*([^*]+?)\*\*/g, "$1")    // **bold** (non-greedy)
    .replace(/\*\*(.+?)\*\*/gs, "$1")      // **bold** spanning newlines
    .replace(/\*([^*\n]+)\*/g, "$1")       // *italic*
    .replace(/__([^_]+?)__/g, "$1")        // __bold__
    .replace(/_([^_\n]+)_/g, "$1")         // _italic_
    .replace(/^[-*•]\s+/gm, "  ")         // bullet lines (keep indent)
    .replace(/\*\*/g, "")                 // stray **
    .replace(/^---+\s*$/gm, "")           // horizontal rules
    .replace(/^#+\s*$/gm, "")             // lone # lines
    .replace(/`([^`]+)`/g, "$1")          // inline `code`
    .replace(/\n{3,}/g, "\n\n")           // collapse excess newlines
    .trim();
}

function buildUserPrompt(
  modeName: string,
  interviewStage: string,
  extracted: ExtractedContext,
  jobDescription: string,
  candidateProfile: string
): string {
  return `mode: ${modeName}
interview_stage: ${interviewStage}

role_type: ${extracted.role_type}
seniority: ${extracted.seniority}
company_type: ${extracted.company_type}
stack_focus: ${extracted.stack_focus}
competencies_to_test: ${extracted.competencies_to_test}
question_count: 15
difficulty_mix: 40% medium / 60% hard
output_format: For each question give: (1) the question, (2) short "what they're testing" line, (3) a sample answer in the candidate's voice (natural, first-person, resume-based). Use plain text only—no markdown symbols like ## or **.

Job Description:
${jobDescription}

Candidate Profile (resume or bullet summary):
${candidateProfile}
`;
}

export async function generateInterviewPrep(
  userId: string,
  jobId: number,
  resumeId: number,
  resumeSource: "resume" | "interview_resume",
  mode: InterviewPrepMode
): Promise<{ prep: { id: number; content: string; mode: string; aiProvider: string | null; aiModel: string | null; createdAt: Date }; provider: string; model?: string }> {
  const job = await storage.getJob(jobId, userId);
  if (!job) throw new Error("Job not found");

  const candidateProfile =
    resumeSource === "resume"
      ? await storage.getResume(resumeId, userId)
      : await storage.getInterviewResume(resumeId, userId);
  if (!candidateProfile) throw new Error("Resume not found");

  const interviewPrepProviderSetting = await storage.getSetting("interview_prep_ai_provider", userId);
  const providerOverride = interviewPrepProviderSetting?.value || undefined;

  const jobDescription = job.description;
  const candidateText = (candidateProfile as { rawContent: string }).rawContent;

  const extracted = await extractContextFromJobAndResume(jobDescription, candidateText, userId, providerOverride);

  const modeName = INTERVIEW_PREP_MODES[mode];
  const interviewStage = DEFAULT_INTERVIEW_STAGE[mode];
  const userMessage = buildUserPrompt(modeName, interviewStage, extracted, jobDescription, candidateText);

  const result = await callAIWithFallback(
    [
      { role: "system", content: INTERVIEW_PREP_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    "sonar-pro",
    userId,
    providerOverride
  );

  if (!result || !result.content.trim()) {
    throw new Error("AI did not return interview prep content. Try again or another provider.");
  }

  const content = stripMarkdownSymbols(result.content.trim());

  const prep = await storage.createInterviewPrep(
    {
      userId,
      jobId,
      resumeId,
      resumeSource,
      mode,
      content,
      aiProvider: result.provider,
      aiModel: result.model ?? null,
    },
    userId
  );

  return {
    prep: {
      id: prep.id,
      content: prep.content,
      mode: prep.mode,
      aiProvider: prep.aiProvider,
      aiModel: prep.aiModel,
      createdAt: prep.createdAt,
    },
    provider: result.provider,
    model: result.model,
  };
}

const INTERVIEW_ANSWER_SYSTEM_PROMPT = `You are an elite interview answer writer.

ANSWER METHOD — STAR (Situation, Task, Action, Result):
Every behavioral or experience-based answer MUST follow the STAR framework naturally woven into the response (do NOT use the labels "Situation:", "Task:", etc. — just flow through them):
  - Situation: Briefly set the scene — which company/team, what was happening, why it mattered.
  - Task: What was the candidate responsible for or what needed to be solved.
  - Action: What the candidate specifically did — tools used, decisions made, collaboration.
  - Result: Concrete outcome — metrics, impact, what improved, what was learned.
For purely technical or opinion questions (e.g. "what is your preferred stack?"), still show depth of understanding by explaining trade-offs and referencing real experience, but a strict STAR arc is not required.

CRITICAL GROUNDING RULES (follow these strictly):
1. Every answer MUST be grounded in the Candidate Profile (resume) provided below. Use real projects, job titles, companies, technologies, and outcomes that appear in the resume.
2. Do NOT invent projects, metrics, or experiences that are not in the resume. If the resume says "improved performance by 30%", use that exact number.
3. Before writing each answer, identify the most relevant experience in the resume, then build the STAR narrative around it. Cite specific roles, companies, or projects by name.
4. Connect the answer to the Job Description: explain why the candidate's real experience makes them a fit for this specific role.
5. If the resume has no relevant experience for a question, say so honestly and pivot to the closest transferable skill. Never fabricate.
6. Show understanding: answers should demonstrate the candidate genuinely understands the WHY behind their actions, not just the WHAT. Explain reasoning, trade-offs considered, and lessons learned.
7. Use the candidate's voice in first person. Sound natural and conversational — no corporate fluff, no AI phrases like "I possess" or "I am adept at."
8. Keep answers 5-10 sentences — long enough to tell a complete STAR story, short enough to hold attention.

Format rules:
- Use plain text only. No markdown: no ##, no **, no __, no *, no #, no bullets like - or •.
- Number each item: 1), 2), ...
- For each item output exactly:
  Question: <original question>
  Answer: <candidate answer following STAR, grounded in resume>
  Key points: <short, comma-separated>
`;

function normalizeQuestions(input: string[] | string): string[] {
  const rawList = Array.isArray(input) ? input : input.split(/\r?\n/);
  return rawList
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q) => q.replace(/^\s*[\d]+[.)]\s+/, "").trim())
    .map((q) => q.replace(/^\s*[-*•]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

export async function answerInterviewQuestions(
  userId: string,
  jobId: number,
  resumeId: number,
  resumeSource: "resume" | "interview_resume",
  questions: string[] | string
): Promise<{ content: string; provider: string; model?: string; questionCount: number }> {
  const job = await storage.getJob(jobId, userId);
  if (!job) throw new Error("Job not found");

  const candidateProfile =
    resumeSource === "resume"
      ? await storage.getResume(resumeId, userId)
      : await storage.getInterviewResume(resumeId, userId);
  if (!candidateProfile) throw new Error("Resume not found");

  const questionList = normalizeQuestions(questions);
  if (questionList.length === 0) {
    throw new Error("No questions provided");
  }

  const interviewPrepProviderSetting = await storage.getSetting("interview_prep_ai_provider", userId);
  const providerOverride = interviewPrepProviderSetting?.value || undefined;

  const jobDescription = job.description;
  const candidateText = (candidateProfile as { rawContent: string }).rawContent;

  const extracted = await extractContextFromJobAndResume(jobDescription, candidateText, userId, providerOverride);

  const userMessage = `=== CANDIDATE PROFILE (resume) ===
${candidateText}

=== JOB DESCRIPTION ===
${jobDescription}

=== CONTEXT ===
role_type: ${extracted.role_type}
seniority: ${extracted.seniority}
company_type: ${extracted.company_type}
stack_focus: ${extracted.stack_focus}

=== QUESTIONS TO ANSWER ===
Read the resume and job description above carefully. For each question below, craft an answer that references specific experience, projects, and outcomes from the resume. Connect the answer to why this candidate fits this job.

${questionList.map((q, i) => `${i + 1}) ${q}`).join("\n")}
`;

  const result = await callAIWithFallback(
    [
      { role: "system", content: INTERVIEW_ANSWER_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    "sonar-pro",
    userId,
    providerOverride
  );

  if (!result || !result.content.trim()) {
    throw new Error("AI did not return answers. Try again or another provider.");
  }

  const content = stripMarkdownSymbols(result.content.trim());
  return { content, provider: result.provider, model: result.model, questionCount: questionList.length };
}

const SIMPLIFY_ANSWERS_SYSTEM_PROMPT = `You are a plain-language interview coach.

You will receive interview answers that are too technical or jargon-heavy.
Rewrite each answer so that someone with only basic experience in the field can understand and deliver it confidently.

Rules:
- Keep the first-person voice and natural tone.
- Replace heavy jargon with everyday language. When a technical term is essential, briefly explain it in parentheses.
- Shorten long-winded explanations. Aim for clear, punchy sentences.
- IMPORTANT: Keep all specific details from the original answers — real project names, company names, metrics, and outcomes must stay. Only simplify the language around them, do not remove or change factual content.
- Preserve the original structure (numbered items, Question / Answer / Key points).
- Use plain text only. No markdown symbols: no ##, no **, no __, no *, no #, no bullets like - or •.
`;

export async function simplifyInterviewAnswers(
  userId: string,
  answersContent: string
): Promise<{ content: string; provider: string; model?: string }> {
  if (!answersContent.trim()) throw new Error("No answers to simplify");

  const interviewPrepProviderSetting = await storage.getSetting("interview_prep_ai_provider", userId);
  const providerOverride = interviewPrepProviderSetting?.value || undefined;

  const result = await callAIWithFallback(
    [
      { role: "system", content: SIMPLIFY_ANSWERS_SYSTEM_PROMPT },
      { role: "user", content: `Simplify these interview answers:\n\n${answersContent}` },
    ],
    "sonar-pro",
    userId,
    providerOverride
  );

  if (!result || !result.content.trim()) {
    throw new Error("AI did not return simplified answers. Try again.");
  }

  const content = stripMarkdownSymbols(result.content.trim());
  return { content, provider: result.provider, model: result.model };
}

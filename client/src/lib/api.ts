import type { Resume, InsertResume, InterviewResume, InterviewPrep, Job, InsertJob, ATSAnalysis, Setting, ActivityLog, User } from "@shared/schema";

// ============ AUTHENTICATION API ============

export interface AuthResponse {
  authenticated: boolean;
  user: User | null;
}

export async function getAuthStatus(): Promise<AuthResponse> {
  const response = await fetch("/api/auth/me", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to check authentication");
  return response.json();
}

export async function login(username: string, password: string): Promise<{ success: boolean; message: string; user: User }> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to login");
  }
  return response.json();
}

export async function register(username: string, password: string): Promise<{ success: boolean; message: string; user: User; redirectToSettings?: boolean }> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to register");
  }
  return response.json();
}

export async function checkRequiredSettings(): Promise<{ configured: boolean; missing: string[]; hasPerplexity: boolean; hasGemini: boolean; hasDiscord: boolean }> {
  const response = await fetch("/api/settings/check-required", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to check required settings");
  return response.json();
}

export async function logout(): Promise<{ success: boolean; message: string }> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to logout");
  }
  return response.json();
}

// ============ RESUMES API ============

export async function getResumes(): Promise<Resume[]> {
  const response = await fetch("/api/resumes");
  if (!response.ok) throw new Error("Failed to fetch resumes");
  return response.json();
}

export async function getResume(id: number): Promise<Resume> {
  const response = await fetch(`/api/resumes/${id}`);
  if (!response.ok) throw new Error("Failed to fetch resume");
  return response.json();
}

export async function createResume(resume: InsertResume): Promise<Resume> {
  const response = await fetch("/api/resumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resume),
  });
  if (!response.ok) throw new Error("Failed to create resume");
  return response.json();
}

export async function updateResume(id: number, resume: Partial<InsertResume>): Promise<Resume> {
  const response = await fetch(`/api/resumes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resume),
  });
  if (!response.ok) throw new Error("Failed to update resume");
  return response.json();
}

export async function deleteResume(id: number): Promise<void> {
  const response = await fetch(`/api/resumes/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete resume");
}

// ============ INTERVIEW RESUMES API (saved when starting interview prep) ============

export async function getInterviewResumes(): Promise<InterviewResume[]> {
  const response = await fetch("/api/interview-resumes", { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch interview resumes");
  return response.json();
}

export async function uploadInterviewResumeFile(file: File, name: string): Promise<InterviewResume> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  const response = await fetch("/api/interview-resumes/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!response.ok) {
    let errorMessage = "Failed to upload resume";
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      try {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
      } catch {
        // ignore
      }
    }
    throw new Error(errorMessage);
  }
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    throw new Error("Server returned an unexpected response format");
  }
  return response.json();
}

// ============ INTERVIEW PREPS API ============

export type InterviewPrepMode = "screening" | "technical_deep_dive" | "pressure_test";

export async function getInterviewPreps(jobId: number): Promise<InterviewPrep[]> {
  const response = await fetch(`/api/interview-preps?jobId=${jobId}`, { credentials: "include" });
  if (!response.ok) throw new Error("Failed to fetch interview preps");
  return response.json();
}

export interface GenerateInterviewPrepResult {
  prep: { id: number; content: string; mode: string; aiProvider: string | null; aiModel: string | null; createdAt: string };
  provider: string;
  model?: string;
}

export async function generateInterviewPrep(
  jobId: number,
  resumeId: number,
  source: "resume" | "interview_resume",
  mode: InterviewPrepMode
): Promise<GenerateInterviewPrepResult> {
  const response = await fetch("/api/interview-preps/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ jobId, resumeId, source, mode }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate interview prep");
  }
  return response.json();
}

export interface AnswerInterviewQuestionsResult {
  content: string;
  provider: string;
  model?: string;
  questionCount: number;
}

export async function answerInterviewQuestions(
  jobId: number,
  resumeId: number,
  source: "resume" | "interview_resume",
  questionsText: string
): Promise<AnswerInterviewQuestionsResult> {
  const response = await fetch("/api/interview-preps/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ jobId, resumeId, source, questionsText }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Failed to answer interview questions");
  }
  return response.json();
}

export async function answerBehavioralQuestions(
  jobId: number,
  resumeId: number,
  source: "resume" | "interview_resume",
  questionsText: string
): Promise<AnswerInterviewQuestionsResult> {
  const response = await fetch("/api/interview-preps/answer-behavioral", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ jobId, resumeId, source, questionsText }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Failed to answer behavioral questions");
  }
  return response.json();
}

export interface SimplifyAnswersResult {
  content: string;
  provider: string;
  model?: string;
}

export async function simplifyInterviewAnswers(
  answersContent: string
): Promise<SimplifyAnswersResult> {
  const response = await fetch("/api/interview-preps/simplify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ answersContent }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Failed to simplify answers");
  }
  return response.json();
}

export async function uploadResumeFile(file: File, name: string): Promise<Resume> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  
  const response = await fetch("/api/resumes/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  
  if (!response.ok) {
    // Try to parse as JSON, but handle non-JSON responses (like HTML error pages)
    let errorMessage = "Failed to upload resume";
    const contentType = response.headers.get("content-type");
    
    if (contentType && contentType.includes("application/json")) {
      try {
    const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
      } catch (parseError) {
        // If JSON parsing fails, use status text
        errorMessage = `${response.status} ${response.statusText}`;
      }
    } else {
      // Non-JSON response (likely HTML error page)
      const text = await response.text();
      errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
      console.error("Non-JSON error response:", text.substring(0, 200));
    }
    
    throw new Error(errorMessage);
  }
  
  // Ensure response is JSON before parsing
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error("Unexpected non-JSON response:", text.substring(0, 200));
    throw new Error("Server returned an unexpected response format");
  }
  
  return response.json();
}

// ============ JOBS API ============

export async function getJobs(filters?: { status?: string; minMatchScore?: number; isApplied?: boolean; rejected?: boolean; gotInterview?: boolean }): Promise<Job[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.minMatchScore) params.append("minMatchScore", filters.minMatchScore.toString());
  if (filters?.isApplied !== undefined) params.append("isApplied", filters.isApplied.toString());
  if (filters?.rejected !== undefined) params.append("rejected", filters.rejected.toString());
  if (filters?.gotInterview !== undefined) params.append("gotInterview", filters.gotInterview.toString());
  
  const response = await fetch(`/api/jobs?${params}`);
  if (!response.ok) throw new Error("Failed to fetch jobs");
  return response.json();
}

export async function getInterviewJobs(): Promise<Job[]> {
  const response = await fetch("/api/jobs/interview", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to fetch interview jobs");
  return response.json();
}

export async function getJob(id: number): Promise<Job> {
  const response = await fetch(`/api/jobs/${id}`);
  if (!response.ok) throw new Error("Failed to fetch job");
  return response.json();
}

export async function createJob(job: InsertJob): Promise<Job> {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });
  if (!response.ok) throw new Error("Failed to create job");
  return response.json();
}

export async function updateJob(id: number, job: Partial<InsertJob>): Promise<Job> {
  const response = await fetch(`/api/jobs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });
  if (!response.ok) throw new Error("Failed to update job");
  return response.json();
}

export async function getDeletedJobs(reason?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (reason) params.append("reason", reason);
  const url = `/api/jobs/deleted${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch deleted jobs");
  return response.json();
}

export async function deleteJob(id: number, expired: boolean = false, reason?: string): Promise<void> {
  const params = new URLSearchParams();
  if (expired) params.append("expired", "true");
  if (reason) params.append("reason", reason);
  const url = `/api/jobs/${id}${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to delete job" }));
    throw new Error(error.error || "Failed to delete job");
  }
}

// ============ ATS ANALYSIS API ============

export async function analyzeJob(data: {
  jobTitle: string;
  jobCompany?: string;
  jobDescription: string;
  jobId?: number;
  aiProvider?: "perplexity" | "gemini" | "auto";
}): Promise<ATSAnalysis> {
  const response = await fetch("/api/ats/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to analyze job");
  }
  
  return response.json();
}

export async function getATSAnalyses(limit?: number): Promise<ATSAnalysis[]> {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());
  
  const response = await fetch(`/api/ats/analyses?${params}`);
  if (!response.ok) throw new Error("Failed to fetch analyses");
  return response.json();
}

export async function getATSAnalysis(id: number): Promise<ATSAnalysis> {
  const response = await fetch(`/api/ats/analyses/${id}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch analysis");
  return response.json();
}

export async function getATSAnalysisByJobId(jobId: number): Promise<ATSAnalysis> {
  const response = await fetch(`/api/ats/analyses/job/${jobId}`, {
    credentials: "include",
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Analysis not found for this job");
    }
    throw new Error("Failed to fetch analysis");
  }
  return response.json();
}

export async function getAllAnalysesByJobId(jobId: number): Promise<ATSAnalysis[]> {
  const response = await fetch(`/api/ats/analyses/job/${jobId}/all`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch analyses");
  }
  return response.json();
}

export async function updateATSAnalysis(id: number, data: Partial<ATSAnalysis>): Promise<ATSAnalysis> {
  const response = await fetch(`/api/ats/analyses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to update analysis" }));
    throw new Error(error.error || "Failed to update analysis");
  }
  return response.json();
}

export async function deleteATSAnalysis(id: number): Promise<void> {
  const response = await fetch(`/api/ats/analyses/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to delete analysis" }));
    throw new Error(error.error || "Failed to delete analysis");
  }
}

// ============ SETTINGS API ============

export async function getSettings(): Promise<Setting[]> {
  const response = await fetch("/api/settings", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch settings");
  return response.json();
}

export async function getSetting(key: string): Promise<Setting> {
  const response = await fetch(`/api/settings/${key}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch setting");
  return response.json();
}

export async function setSetting(key: string, value: string): Promise<Setting> {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ key, value }),
  });
  if (!response.ok) throw new Error("Failed to set setting");
  return response.json();
}

export async function setSettingsBatch(settingsMap: Record<string, string>): Promise<Setting[]> {
  const response = await fetch("/api/settings/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ settings: settingsMap }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to save settings" }));
    throw new Error(error.error || "Failed to save settings");
  }
  return response.json();
}

// ============ STATS API ============

export interface DashboardStats {
  linksViewed?: number;
  totalJobs: number;
  todayJobs: number;
  yesterdayJobs: number;
  appliedJobs: number;
  pendingJobs: number;
  rejectedJobs: number;
  interviewJobs: number;
  interviewRate: string;
  highMatchJobs: number;
  totalResumes: number;
  topMissingSkills: Array<{ skill: string; count: number }>;
}

export async function getStats(): Promise<DashboardStats> {
  const response = await fetch("/api/stats");
  if (!response.ok) throw new Error("Failed to fetch stats");
  return response.json();
}

// ============ JOB SCRAPING API ============

export async function syncJobs(options?: { skipApifyLimit?: boolean }): Promise<{ message: string; jobTitles: number; countryCode?: string; datePosted?: string; skipApifyLimit?: boolean }> {
  const response = await fetch("/api/jobs/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(options ?? {}),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to sync jobs");
  }
  return response.json();
}

export async function triggerCronJob(options?: { skipApifyLimit?: boolean }): Promise<{ success: boolean; message: string; results?: any; skipApifyLimit?: boolean }> {
  const response = await fetch("/api/jobs/trigger-cron", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(options ?? {}),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to trigger cron job");
  }
  return response.json();
}

export async function matchJobs(): Promise<{ message: string }> {
  const response = await fetch("/api/jobs/match", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to match jobs");
  }
  return response.json();
}

export async function matchZeroScoreJobs(): Promise<{ message: string }> {
  const response = await fetch("/api/jobs/match-zero-score", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to match zero-score jobs");
  }
  return response.json();
}

export async function retryMatchJob(jobId: number): Promise<{ success: boolean; message: string; job?: Job }> {
  const response = await fetch(`/api/jobs/${jobId}/match`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || "Failed to retry job matching");
  }
  return response.json();
}

export async function getUnscannedJobsCount(): Promise<{ count: number; jobs: Array<{ id: number; title: string; company: string; createdAt: Date }> }> {
  const response = await fetch("/api/jobs/unscanned-count", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to get unscanned jobs count");
  return response.json();
}

export async function getUntitledJobsCount(): Promise<{ count: number }> {
  const response = await fetch("/api/jobs/untitled-count", {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to get untitled jobs count" }));
    throw new Error(error.error || "Failed to get untitled jobs count");
  }
  return response.json();
}

export async function getZeroScoreJobsCount(): Promise<{ count: number; jobs: Array<{ id: number; title: string; company: string; createdAt: Date }> }> {
  const response = await fetch("/api/jobs/zero-score-count", {
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to get zero-score jobs count" }));
    throw new Error(error.error || "Failed to get zero-score jobs count");
  }
  return response.json();
}

// ============ ACTIVITY LOGS API ============

// Extended type for activity logs with user info (for admins)
export type ActivityLogWithUser = ActivityLog & {
  user?: { id: string; username: string };
};

export async function getActivityLogs(limit?: number, userId?: string): Promise<ActivityLogWithUser[]> {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());
  if (userId) params.append("userId", userId);
  
  const response = await fetch(`/api/activity?${params}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch activity logs");
  return response.json();
}

// ============ ADMIN API ============

export async function getAllUsers(): Promise<Array<Omit<User, "password">>> {
  const response = await fetch("/api/admin/users", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch users");
  return response.json();
}

// ============ API USAGE API ============

export interface ProviderUsage {
  dailyCount: number;
  dailyLimit: number;
  usagePercentage: number;
  minuteCount: number;
  minuteLimit: number;
}

export interface JSearchUsage {
  monthlyCount: number;
  monthlyLimit: number;
  usagePercentage: number;
  hourlyCount: number;
  hourlyLimit: number;
  resetTime: string | Date;
}

export interface N8nUsage {
  monthlyCount: number;
  monthlyLimit: number;
  usagePercentage: number;
  resetTime: string;
}

export interface APIUsage {
  dailyCount: number;
  dailyLimit: number;
  usagePercentage: number;
  resetTime: string;
  minuteCount: number;
  minuteLimit: number;
  providers: {
    perplexity: ProviderUsage;
    gemini: ProviderUsage;
    openrouter: ProviderUsage;
    jsearch: JSearchUsage;
    apify: ProviderUsage;
    n8n: N8nUsage;
  };
}

export async function getAPIUsage(): Promise<APIUsage> {
  const response = await fetch("/api/usage");
  if (!response.ok) throw new Error("Failed to fetch API usage");
  return response.json();
}

// ============ CRON API ============

export async function rescheduleCronJob(): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch("/api/cron/reschedule", {
    method: "POST",
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to reschedule cron job");
  }
  
  return response.json();
}

// ============ DISCORD API ============

export async function testReminder(): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch("/api/reminder/test", {
    method: "POST",
    credentials: "include",
  });
  
  // Check content type before parsing
  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  
  if (!response.ok) {
    let errorMessage = "Failed to test reminder";
    try {
      if (isJson) {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
      } else {
        // If not JSON, try to get text
        const text = await response.text();
        // If it's HTML, provide a generic error
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          errorMessage = `Server returned an error page (${response.status}). Please check your settings and try again.`;
        } else {
          errorMessage = text || errorMessage;
        }
      }
    } catch (parseError) {
      // If we can't parse the error, use status text
      errorMessage = `${response.status} ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  
  // Parse successful response
  if (isJson) {
    return await response.json();
  } else {
    // If response is not JSON, try to parse as text
    const text = await response.text();
    throw new Error(`Unexpected response format: ${text.substring(0, 100)}`);
  }
}

export async function testDiscordWebhook(): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch("/api/discord/test", {
    method: "POST",
    credentials: "include",
  });
  
  // Check content type before parsing
  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  
  if (!response.ok) {
    let errorMessage = "Failed to test Discord webhook";
    try {
      if (isJson) {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
      } else {
        // If not JSON, try to get text
        const text = await response.text();
        // If it's HTML, provide a generic error
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          errorMessage = `Server returned an error page (${response.status}). Please check your Discord webhook URL and try again.`;
        } else {
          errorMessage = text || errorMessage;
        }
      }
    } catch (parseError) {
      // If we can't parse the error, use status text
      errorMessage = `${response.status} ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  
  // Parse successful response
  if (isJson) {
    return response.json();
  } else {
    // If not JSON, return a success message
    const text = await response.text();
    return { 
      success: true, 
      message: text || "Discord webhook test completed" 
    };
  }
}

// ============ RESUME OPTIMIZER API ============

export interface OptimizedResume {
  professionalSummary: string;
  technicalSkills: string | string[]; // Can be formatted string or array for backward compatibility
  education: string;
  relevantExperience: Array<{
    title: string;
    company: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    bullets: string[];
  }>;
  changes: Array<{
    section: string;
    type: "summary_rewritten" | "bullets_reordered" | "content_restructured";
    description: string;
  }>;
}

export interface OptimizeResumeResponse {
  originalResume: Resume;
  optimizedResume: OptimizedResume;
  job: {
    id: number;
    title: string;
    company: string;
    url?: string | null;
  };
  atsAnalysis: {
    id: number;
    matchScore: number;
    missingKeywords: string[];
    suggestions: any;
  } | null;
  optimizedAnalysis: {
    originalScore: number;
    newScore: number;
    scoreImprovement: number;
    improved: boolean;
    analysis: any | null;
  } | null;
  savedOptimizedResume: {
    id: number;
    createdAt: string;
  } | null;
}

export interface SavedOptimizedResume {
  id: number;
  userId: string;
  originalResumeId: number;
  jobId: number;
  atsAnalysisId: number | null;
  optimizedAnalysisId: number | null;
  professionalSummary: string;
  technicalSkills: string[];
  education: string | null;
  relevantExperience: any;
  projects: any | null;
  changes: any;
  originalScore: number;
  newScore: number;
  scoreImprovement: number;
  improved: boolean;
  createdAt: string;
  originalResume?: { id: number; name: string } | null;
  job?: { id: number; title: string; company: string; url?: string | null } | null;
}

export async function optimizeResume(resumeId: number, jobId: number, atsAnalysisId?: number): Promise<OptimizeResumeResponse> {
  const response = await fetch(`/api/resumes/${resumeId}/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ jobId, ...(atsAnalysisId && { atsAnalysisId }) }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to optimize resume");
  }

  return response.json();
}

// Optimize resume for a job - automatically finds best resume from ATS analysis
export async function optimizeResumeForJob(jobId: number): Promise<OptimizeResumeResponse> {
  const response = await fetch(`/api/jobs/${jobId}/optimize-resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to optimize resume");
  }

  return response.json();
}

// ============ OPTIMIZED RESUMES API ============

export async function getOptimizedResumes(jobId?: number): Promise<SavedOptimizedResume[]> {
  const params = new URLSearchParams();
  // Only append jobId if it's a valid number
  if (jobId !== undefined && jobId !== null && !isNaN(jobId) && jobId > 0) {
    params.append("jobId", jobId.toString());
  }
  
  const url = params.toString() ? `/api/optimized-resumes?${params}` : `/api/optimized-resumes`;
  const response = await fetch(url, {
    credentials: "include",
  });
  
  if (!response.ok) throw new Error("Failed to fetch optimized resumes");
  return response.json();
}

export async function getOptimizedResume(id: number): Promise<SavedOptimizedResume> {
  const response = await fetch(`/api/optimized-resumes/${id}`, {
    credentials: "include",
  });
  
  if (!response.ok) throw new Error("Failed to fetch optimized resume");
  return response.json();
}

export async function deleteOptimizedResume(id: number): Promise<void> {
  const response = await fetch(`/api/optimized-resumes/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  
  if (!response.ok) throw new Error("Failed to delete optimized resume");
}

export async function downloadOptimizedResume(id: number, format: "pdf" | "docx" = "pdf"): Promise<void> {
  const response = await fetch(`/api/optimized-resumes/${id}/download?format=${format}`, {
    method: "GET",
    credentials: "include",
  });
  
  if (!response.ok) throw new Error("Failed to download optimized resume");
  
  // Get the filename from the Content-Disposition header
  const contentDisposition = response.headers.get("Content-Disposition");
  const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
  const defaultExtension = format === "docx" ? ".docx" : ".pdf";
  const filename = filenameMatch ? filenameMatch[1] : `optimized-resume-${Date.now()}${defaultExtension}`;
  
  // Create a blob from the response
  const blob = await response.blob();
  
  // Create a temporary URL and trigger download
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

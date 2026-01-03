import type { Resume, InsertResume, Job, InsertJob, ATSAnalysis, Setting, ActivityLog, User } from "@shared/schema";

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

export async function uploadResumeFile(file: File, name: string): Promise<Resume> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  
  const response = await fetch("/api/resumes/upload", {
    method: "POST",
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload resume");
  }
  
  return response.json();
}

// ============ JOBS API ============

export async function getJobs(filters?: { status?: string; minMatchScore?: number; isApplied?: boolean }): Promise<Job[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.minMatchScore) params.append("minMatchScore", filters.minMatchScore.toString());
  if (filters?.isApplied !== undefined) params.append("isApplied", filters.isApplied.toString());
  
  const response = await fetch(`/api/jobs?${params}`);
  if (!response.ok) throw new Error("Failed to fetch jobs");
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

export async function deleteJob(id: number): Promise<void> {
  const response = await fetch(`/api/jobs/${id}`, {
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

// ============ SETTINGS API ============

export async function getSettings(): Promise<Setting[]> {
  const response = await fetch("/api/settings");
  if (!response.ok) throw new Error("Failed to fetch settings");
  return response.json();
}

export async function getSetting(key: string): Promise<Setting> {
  const response = await fetch(`/api/settings/${key}`);
  if (!response.ok) throw new Error("Failed to fetch setting");
  return response.json();
}

export async function setSetting(key: string, value: string): Promise<Setting> {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!response.ok) throw new Error("Failed to set setting");
  return response.json();
}

// ============ STATS API ============

export interface DashboardStats {
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

export async function syncJobs(): Promise<{ message: string; jobTitles: number; locations: number }> {
  const response = await fetch("/api/jobs/sync", {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to sync jobs");
  }
  return response.json();
}

export async function triggerCronJob(): Promise<{ success: boolean; message: string; results?: any }> {
  const response = await fetch("/api/jobs/trigger-cron", {
    method: "POST",
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
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to match jobs");
  }
  return response.json();
}

// ============ ACTIVITY LOGS API ============

// Extended type for activity logs with user info (for admins)
export type ActivityLogWithUser = ActivityLog & {
  user?: { id: string; username: string };
};

export async function getActivityLogs(limit?: number): Promise<ActivityLogWithUser[]> {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());
  
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

export interface APIUsage {
  dailyCount: number;
  dailyLimit: number;
  usagePercentage: number;
  resetTime: string;
  minuteCount: number;
  minuteLimit: number;
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

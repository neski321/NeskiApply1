import type { Resume, InsertResume, Job, InsertJob, ATSAnalysis, Setting, ActivityLog } from "@shared/schema";

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

export async function getJobs(filters?: { status?: string; minMatchScore?: number }): Promise<Job[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.minMatchScore) params.append("minMatchScore", filters.minMatchScore.toString());
  
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
  });
  if (!response.ok) throw new Error("Failed to delete job");
}

// ============ ATS ANALYSIS API ============

export async function analyzeJob(data: {
  jobTitle: string;
  jobCompany?: string;
  jobDescription: string;
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
  const response = await fetch(`/api/ats/analyses/${id}`);
  if (!response.ok) throw new Error("Failed to fetch analysis");
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

export async function getActivityLogs(limit?: number): Promise<ActivityLog[]> {
  const params = new URLSearchParams();
  if (limit) params.append("limit", limit.toString());
  
  const response = await fetch(`/api/activity?${params}`);
  if (!response.ok) throw new Error("Failed to fetch activity logs");
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

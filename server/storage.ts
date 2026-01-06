import { 
  type User, 
  type InsertUser,
  type Resume,
  type InsertResume,
  type Job,
  type InsertJob,
  type ATSAnalysis,
  type InsertATSAnalysis,
  type Setting,
  type InsertSetting,
  type ActivityLog,
  type InsertActivityLog,
  type OptimizedResume,
  type InsertOptimizedResume,
  users,
  resumes,
  jobs,
  atsAnalyses,
  settings,
  activityLogs,
  optimizedResumes,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, or, isNull, asc, lt } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: "user" | "admin"): Promise<User | undefined>;

  // Resumes
  createResume(resume: InsertResume, userId: string): Promise<Resume>;
  getResumes(userId: string): Promise<Resume[]>;
  getResume(id: number, userId: string): Promise<Resume | undefined>;
  updateResume(id: number, resume: Partial<InsertResume>, userId: string): Promise<Resume | undefined>;
  deleteResume(id: number, userId: string): Promise<boolean>;

  // Jobs
  createJob(job: InsertJob, userId: string): Promise<Job>;
  getJobs(userId: string, filters?: { status?: string; minMatchScore?: number; isApplied?: boolean }): Promise<Job[]>;
  getJob(id: number, userId: string): Promise<Job | undefined>;
  updateJob(id: number, job: Partial<InsertJob>, userId: string): Promise<Job | undefined>;
  deleteJob(id: number, userId: string): Promise<boolean>;
  deleteOldUnappliedJobs(userId: string, daysOld: number): Promise<number>;
  upsertJobByExternalId(job: InsertJob, userId: string): Promise<{ job: Job; wasInserted: boolean }>;

  // ATS Analyses
  createATSAnalysis(analysis: InsertATSAnalysis, userId: string): Promise<ATSAnalysis>;
  getATSAnalyses(userId: string, limit?: number): Promise<ATSAnalysis[]>;
  getATSAnalysis(id: number, userId: string): Promise<ATSAnalysis | undefined>;
  getATSAnalysisByJobId(jobId: number, userId: string): Promise<ATSAnalysis | undefined>;
  getAllAnalysesByJobId(jobId: number, userId: string): Promise<ATSAnalysis[]>;
  deleteATSAnalysis(id: number, userId: string): Promise<boolean>;

  // Settings
  getSetting(key: string, userId: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string, userId: string): Promise<Setting>;
  getAllSettings(userId: string): Promise<Setting[]>;

  // Activity Logs
  createActivityLog(log: InsertActivityLog, userId: string): Promise<ActivityLog>;
  getActivityLogs(userId: string, limit?: number): Promise<ActivityLog[]>;

  // Optimized Resumes
  createOptimizedResume(resume: InsertOptimizedResume, userId: string): Promise<OptimizedResume>;
  getOptimizedResumes(userId: string, jobId?: number): Promise<OptimizedResume[]>;
  getOptimizedResume(id: number, userId: string): Promise<OptimizedResume | undefined>;
  deleteOptimizedResume(id: number, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.username);
  }

  async updateUserRole(userId: string, role: "user" | "admin"): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, userId))
      .returning();
    return updated || undefined;
  }

  // Resumes
  async createResume(resume: InsertResume, userId: string): Promise<Resume> {
    const [newResume] = await db.insert(resumes).values({ ...resume, userId }).returning();
    return newResume;
  }

  async getResumes(userId: string): Promise<Resume[]> {
    return await db.select().from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.updatedAt));
  }

  async getResume(id: number, userId: string): Promise<Resume | undefined> {
    const [resume] = await db.select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
    return resume || undefined;
  }

  async updateResume(id: number, resume: Partial<InsertResume>, userId: string): Promise<Resume | undefined> {
    const [updated] = await db
      .update(resumes)
      .set({ ...resume, updatedAt: new Date() })
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteResume(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(resumes).where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Jobs
  async createJob(job: InsertJob, userId: string): Promise<Job> {
    const [newJob] = await db.insert(jobs).values({ ...job, userId }).returning();
    return newJob;
  }

  async getJobs(userId: string, filters?: { status?: string; minMatchScore?: number; isApplied?: boolean }): Promise<Job[]> {
    const conditions = [eq(jobs.userId, userId)];
    
    if (filters?.status) {
      conditions.push(eq(jobs.status, filters.status));
    }
    if (filters?.minMatchScore) {
      conditions.push(sql`${jobs.matchScore} >= ${filters.minMatchScore}`);
    }
    if (filters?.isApplied !== undefined) {
      if (filters.isApplied === true) {
        // For applied: isApplied must be true
        conditions.push(eq(jobs.isApplied, true));
      } else {
        // For unapplied: isApplied is false OR null
        conditions.push(or(eq(jobs.isApplied, false), isNull(jobs.isApplied)));
      }
    }

    return await db.select().from(jobs).where(and(...conditions)).orderBy(desc(jobs.createdAt));
  }

  async getJob(id: number, userId: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.userId, userId)));
    return job || undefined;
  }

  async updateJob(id: number, job: Partial<InsertJob>, userId: string): Promise<Job | undefined> {
    const [updated] = await db
      .update(jobs)
      .set(job)
      .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteJob(id: number, userId: string): Promise<boolean> {
    // Delete the job - this will cascade delete ATS analyses via foreign key constraint
    // Note: We keep activity logs that reference this job for historical purposes
    const result = await db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deleteOldUnappliedJobs(userId: string, daysOld: number): Promise<number> {
    // Calculate the cutoff date (30 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    cutoffDate.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison
    
    // Delete jobs that:
    // 1. Belong to this user
    // 2. Were created more than `daysOld` days ago
    // 3. Have not been applied to (isApplied = false or null)
    const result = await db
      .delete(jobs)
      .where(
        and(
          eq(jobs.userId, userId),
          lt(jobs.createdAt, cutoffDate),
          or(
            eq(jobs.isApplied, false),
            isNull(jobs.isApplied)
          )
        )
      );
    
    return result.rowCount || 0;
  }

  /**
   * Normalize text for comparison (lowercase, trim, remove extra spaces)
   */
  private normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, " ");
  }

  async upsertJobByExternalId(job: InsertJob, userId: string): Promise<{ job: Job; wasInserted: boolean }> {
    // Helper to normalize title and company for comparison
    const normalizedTitle = this.normalizeText(job.title);
    const normalizedCompany = this.normalizeText(job.company);

    // Priority 1: If externalId is provided, use it for duplicate detection
    if (job.externalId) {
      const [existing] = await db.select().from(jobs).where(and(eq(jobs.externalId, job.externalId), eq(jobs.userId, userId)));
      
      if (existing) {
        // Preserve original postedDate and createdAt when updating
        const updateData = { ...job };
        if (existing.postedDate) {
          updateData.postedDate = existing.postedDate; // Keep original date
        }
        const [updated] = await db
          .update(jobs)
          .set(updateData)
          .where(and(eq(jobs.externalId, job.externalId), eq(jobs.userId, userId)))
          .returning();
        return { job: updated, wasInserted: false };
      }
    }

    // Priority 2: Check for duplicate by URL + title + company (if URL is provided)
    if (job.url) {
      const [existingByUrl] = await db.select().from(jobs).where(
        and(
          eq(jobs.url, job.url),
          eq(jobs.userId, userId),
          eq(jobs.title, job.title),
          eq(jobs.company, job.company)
        )
      );
      
      if (existingByUrl) {
        // Preserve original postedDate and createdAt when updating
        const updateData = { ...job };
        if (existingByUrl.postedDate) {
          updateData.postedDate = existingByUrl.postedDate; // Keep original date
        }
        const [updated] = await db
          .update(jobs)
          .set(updateData)
          .where(
            and(
              eq(jobs.url, job.url),
              eq(jobs.userId, userId),
              eq(jobs.title, job.title),
              eq(jobs.company, job.company)
            )
          )
          .returning();
        return { job: updated, wasInserted: false };
      }
    }

    // Priority 3: Check for duplicate by normalized title + company (catches same job with different IDs/URLs)
    // This prevents duplicates when the same job is scraped multiple times with different external IDs
    const allUserJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));
    const duplicate = allUserJobs.find(existing => {
      const existingNormalizedTitle = this.normalizeText(existing.title);
      const existingNormalizedCompany = this.normalizeText(existing.company);
      return existingNormalizedTitle === normalizedTitle && existingNormalizedCompany === normalizedCompany;
    });

    if (duplicate) {
      console.log(`[Duplicate Detection] Found duplicate job: "${job.title}" at "${job.company}" (existing ID: ${duplicate.id})`);
      // Preserve original postedDate, createdAt, and other original data when updating
      const updateData = { ...job };
      if (duplicate.postedDate) {
        updateData.postedDate = duplicate.postedDate; // Keep original date
      }
      // Don't update createdAt - keep the original creation time
      const [updated] = await db
        .update(jobs)
        .set(updateData)
        .where(and(eq(jobs.id, duplicate.id), eq(jobs.userId, userId)))
        .returning();
      return { job: updated, wasInserted: false };
    }

    // No duplicate found, create new job
    const newJob = await this.createJob(job, userId);
    return { job: newJob, wasInserted: true };
  }

  // ATS Analyses
  async createATSAnalysis(analysis: InsertATSAnalysis, userId: string): Promise<ATSAnalysis> {
    // Create the analysis - no limit on how many analyses per job
    // All analyses with the same jobId will be grouped together
    const [newAnalysis] = await db.insert(atsAnalyses).values({ ...analysis, userId }).returning();
    return newAnalysis;
  }

  async getATSAnalyses(userId: string, limit: number = 50): Promise<ATSAnalysis[]> {
    return await db.select().from(atsAnalyses).where(eq(atsAnalyses.userId, userId)).orderBy(desc(atsAnalyses.createdAt)).limit(limit);
  }

  async getATSAnalysis(id: number, userId: string): Promise<ATSAnalysis | undefined> {
    const [analysis] = await db.select().from(atsAnalyses).where(and(eq(atsAnalyses.id, id), eq(atsAnalyses.userId, userId)));
    return analysis || undefined;
  }

  async getATSAnalysisByJobId(jobId: number, userId: string): Promise<ATSAnalysis | undefined> {
    // Get the ORIGINAL analysis for this job
    // Optimized resume analyses should NOT have jobId set (they're linked via optimized_resumes.optimizedAnalysisId)
    // So we can safely get the most recent analysis with this jobId (which will be the original)
    const [analysis] = await db
      .select()
      .from(atsAnalyses)
      .where(and(eq(atsAnalyses.jobId, jobId), eq(atsAnalyses.userId, userId)))
      .orderBy(desc(atsAnalyses.createdAt)) // Get the most recent original analysis
      .limit(1);
    return analysis || undefined;
  }

  async getAllAnalysesByJobId(jobId: number, userId: string): Promise<ATSAnalysis[]> {
    return await db
      .select()
      .from(atsAnalyses)
      .where(and(eq(atsAnalyses.jobId, jobId), eq(atsAnalyses.userId, userId)))
      .orderBy(desc(atsAnalyses.createdAt));
  }

  async deleteATSAnalysis(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(atsAnalyses).where(and(eq(atsAnalyses.id, id), eq(atsAnalyses.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Settings
  async getSetting(key: string, userId: string): Promise<Setting | undefined> {
    // First, check database settings (takes precedence)
    const [setting] = await db.select().from(settings).where(and(eq(settings.key, key), eq(settings.userId, userId)));
    if (setting) {
      return setting;
    }

    // Fallback to environment variables
    // Map setting keys to environment variable names
    const envVarMap: Record<string, string> = {
      perplexity_api_key: "PERPLEXITY_API_KEY",
      gemini_api_key: "GEMINI_API_KEY",
      jsearch_api_key: "JSEARCH_API_KEY",
      discord_webhook: "DISCORD_WEBHOOK_URL",
    };

    const envVarName = envVarMap[key];
    if (envVarName && process.env[envVarName]) {
      // Return a Setting-like object with env var value
      // Using id: -1 as a sentinel value to indicate it's from env vars
      return {
        id: -1,
        userId,
        key,
        value: process.env[envVarName],
        updatedAt: new Date(),
      } as Setting;
    }

    return undefined;
  }

  async setSetting(key: string, value: string, userId: string): Promise<Setting> {
    // Check if setting exists in database (not from env vars)
    // We query directly to avoid getting env var fallback
    const [existing] = await db.select().from(settings).where(and(eq(settings.key, key), eq(settings.userId, userId)));
    
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(and(eq(settings.key, key), eq(settings.userId, userId)))
        .returning();
      return updated;
    }

    const [newSetting] = await db.insert(settings).values({ key, value, userId }).returning();
    return newSetting;
  }

  async getAllSettings(userId: string): Promise<Setting[]> {
    return await db.select().from(settings).where(eq(settings.userId, userId));
  }

  // Activity Logs
  async createActivityLog(log: InsertActivityLog, userId: string): Promise<ActivityLog> {
    const [newLog] = await db.insert(activityLogs).values({ ...log, userId }).returning();
    return newLog;
  }

  async getActivityLogs(userId: string, limit: number = 100): Promise<ActivityLog[]> {
    return await db.select().from(activityLogs).where(eq(activityLogs.userId, userId)).orderBy(desc(activityLogs.createdAt)).limit(limit);
  }

  async getAllActivityLogs(limit: number = 100): Promise<ActivityLog[]> {
    return await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit);
  }

  // Optimized Resumes
  async createOptimizedResume(resume: InsertOptimizedResume, userId: string): Promise<OptimizedResume> {
    const [newResume] = await db.insert(optimizedResumes).values({ ...resume, userId }).returning();
    return newResume;
  }

  async getOptimizedResumes(userId: string, jobId?: number): Promise<OptimizedResume[]> {
    const conditions = [eq(optimizedResumes.userId, userId)];
    if (jobId) {
      conditions.push(eq(optimizedResumes.jobId, jobId));
    }
    return await db
      .select()
      .from(optimizedResumes)
      .where(and(...conditions))
      .orderBy(desc(optimizedResumes.createdAt));
  }

  async getOptimizedResume(id: number, userId: string): Promise<OptimizedResume | undefined> {
    const [resume] = await db
      .select()
      .from(optimizedResumes)
      .where(and(eq(optimizedResumes.id, id), eq(optimizedResumes.userId, userId)));
    return resume || undefined;
  }

  async deleteOptimizedResume(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(optimizedResumes)
      .where(and(eq(optimizedResumes.id, id), eq(optimizedResumes.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }
}

export const storage = new DatabaseStorage();

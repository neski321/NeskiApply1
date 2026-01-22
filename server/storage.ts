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
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type DeletedJob,
  type InsertDeletedJob,
  users,
  resumes,
  jobs,
  atsAnalyses,
  settings,
  activityLogs,
  optimizedResumes,
  passwordResetTokens,
  deletedJobs,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, or, isNull, asc, lt, gt } from "drizzle-orm";

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
  deleteJob(id: number, userId: string, expired?: boolean): Promise<boolean>;
  deleteOldUnappliedJobs(userId: string, daysOld: number): Promise<number>;
  deleteOldDeletedJobs(userId: string, daysOld: number): Promise<number>;
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
  setSettingsBatch(settingsMap: Record<string, string>, userId: string): Promise<Setting[]>;

  // Activity Logs
  createActivityLog(log: InsertActivityLog, userId: string): Promise<ActivityLog>;
  getActivityLogs(userId: string, limit?: number): Promise<ActivityLog[]>;

  // Optimized Resumes
  createOptimizedResume(resume: InsertOptimizedResume, userId: string): Promise<OptimizedResume>;
  getOptimizedResumes(userId: string, jobId?: number): Promise<OptimizedResume[]>;
  getOptimizedResume(id: number, userId: string): Promise<OptimizedResume | undefined>;
  deleteOptimizedResume(id: number, userId: string): Promise<boolean>;

  // Password Reset Tokens
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenAsUsed(token: string): Promise<boolean>;
  updateUserPassword(userId: string, newPassword: string): Promise<User | undefined>;
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

  async deleteJob(id: number, userId: string, expired: boolean = false): Promise<boolean> {
    // Get job details before deleting to log in deleted_jobs
    const [job] = await db.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.userId, userId)));
    
    if (!job) {
      return false;
    }
    
    // Only log to deleted_jobs if NOT expired (expired jobs can be re-added)
    if (!expired) {
      // Log deleted job to prevent re-adding during scans/ingestion
      const normalizedTitle = this.normalizeText(job.title);
      const normalizedCompany = this.normalizeText(job.company);
      
      // Try to insert with isExpired, fallback to without if column doesn't exist
      try {
        await db.insert(deletedJobs).values({
          userId,
          externalId: job.externalId || null,
          url: job.url || null,
          title: normalizedTitle,
          company: normalizedCompany,
          reason: "manual",
          isExpired: false,
        });
      } catch (error: any) {
        // If is_expired column doesn't exist, try without it
        if (error?.code === '42703' || error?.message?.includes('does not exist')) {
          console.warn("[deleteJob] is_expired column not found. Inserting without it. Please run migration: migrations/add_is_expired_column.sql");
          await db.insert(deletedJobs).values({
            userId,
            externalId: job.externalId || null,
            url: job.url || null,
            title: normalizedTitle,
            company: normalizedCompany,
            reason: "manual",
          } as any).catch((fallbackError) => {
            // Log error but don't fail deletion if logging fails
            console.error("Failed to log deleted job:", fallbackError);
          });
        } else {
          // Some other error - log it but don't fail deletion
          console.error("Failed to log deleted job:", error);
        }
      }
    }
    
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
    
    // Get jobs that will be deleted to log them first
    const jobsToDelete = await db
      .select()
      .from(jobs)
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
    
    // Log deleted jobs to prevent re-adding during scans/ingestion
    if (jobsToDelete.length > 0) {
      const deletedJobEntries: InsertDeletedJob[] = jobsToDelete.map(job => ({
        userId,
        externalId: job.externalId || null,
        url: job.url || null,
        title: this.normalizeText(job.title),
        company: this.normalizeText(job.company),
        reason: "old_unapplied",
        isExpired: false, // Old unapplied jobs are not expired, so they shouldn't be re-added
      }));
      
      // Insert in batches to avoid issues with large arrays
      for (const deletedJob of deletedJobEntries) {
        try {
          await db.insert(deletedJobs).values(deletedJob);
        } catch (error: any) {
          // If is_expired column doesn't exist, try without it
          if (error?.code === '42703' || error?.message?.includes('does not exist')) {
            const { isExpired, ...deletedJobWithoutExpired } = deletedJob;
            await db.insert(deletedJobs).values(deletedJobWithoutExpired as any).catch((fallbackError) => {
              // Log error but don't fail deletion if logging fails
              console.error("Failed to log deleted job:", fallbackError);
            });
          } else {
            // Some other error - log it but don't fail deletion
            console.error("Failed to log deleted job:", error);
          }
        }
      }
    }
    
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

  async deleteOldDeletedJobs(userId: string, daysOld: number): Promise<number> {
    // Calculate the cutoff date (14 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    cutoffDate.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison
    
    // Delete deleted_jobs records that are older than the cutoff date
    const result = await db
      .delete(deletedJobs)
      .where(
        and(
          eq(deletedJobs.userId, userId),
          lt(deletedJobs.deletedAt, cutoffDate)
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

  /**
   * Check if a job was previously deleted (to prevent re-adding)
   */
  private async wasJobDeleted(job: InsertJob, userId: string): Promise<boolean> {
    const normalizedTitle = this.normalizeText(job.title);
    const normalizedCompany = this.normalizeText(job.company);
    
    // Check by externalId if available (only non-expired deletions)
    if (job.externalId) {
      const [deleted] = await db.select().from(deletedJobs).where(
        and(
          eq(deletedJobs.userId, userId),
          eq(deletedJobs.externalId, job.externalId),
          eq(deletedJobs.isExpired, false) // Only check non-expired deletions
        )
      );
      if (deleted) {
        return true;
      }
    }
    
    // Check by URL if available (only non-expired deletions)
    if (job.url) {
      const [deleted] = await db.select().from(deletedJobs).where(
        and(
          eq(deletedJobs.userId, userId),
          eq(deletedJobs.url, job.url),
          eq(deletedJobs.isExpired, false) // Only check non-expired deletions
        )
      );
      if (deleted) {
        return true;
      }
    }
    
    // Check by normalized title + company (only non-expired deletions)
    const [deleted] = await db.select().from(deletedJobs).where(
      and(
        eq(deletedJobs.userId, userId),
        eq(deletedJobs.title, normalizedTitle),
        eq(deletedJobs.company, normalizedCompany),
        eq(deletedJobs.isExpired, false) // Only check non-expired deletions
      )
    );
    
    return !!deleted;
  }

  async upsertJobByExternalId(job: InsertJob, userId: string): Promise<{ job: Job; wasInserted: boolean }> {
    // Helper to normalize title and company for comparison
    const normalizedTitle = this.normalizeText(job.title);
    const normalizedCompany = this.normalizeText(job.company);

    // Check if this job was previously deleted - if so, don't re-add it
    const wasDeleted = await this.wasJobDeleted(job, userId);
    if (wasDeleted) {
      console.log(`[Deleted Job Check] Skipping previously deleted job: "${job.title}" at "${job.company}"`);
      
      // Log to activity log that this job was skipped
      try {
        const { activityLogger } = await import("./logger");
        await activityLogger.info(
          `Skipped job "${job.title}" at ${job.company} - previously deleted`,
          { 
            title: job.title, 
            company: job.company, 
            externalId: job.externalId || null,
            url: job.url || null,
            reason: "previously_deleted"
          },
          userId
        );
      } catch (logError) {
        // Log error but don't fail the skip operation if logging fails
        console.error("Failed to log skipped job to activity log:", logError);
      }
      
      // Throw a special error that callers can catch and ignore (treat as skip)
      // This prevents re-adding deleted jobs during scans/ingestion
      const skipError = new Error("Job was previously deleted");
      (skipError as any).skip = true;
      throw skipError;
    }

    // Priority 1: If externalId is provided, use it for duplicate detection
    if (job.externalId) {
      const [existing] = await db.select().from(jobs).where(and(eq(jobs.externalId, job.externalId), eq(jobs.userId, userId)));
      
      if (existing) {
        // Preserve original postedDate, createdAt, isApplied, and appliedAt when updating
        const updateData = { ...job };
        if (existing.postedDate) {
          updateData.postedDate = existing.postedDate; // Keep original date
        }
        // Preserve applied status and date if job was already applied
        if (existing.isApplied) {
          updateData.isApplied = existing.isApplied;
          if (existing.appliedAt) {
            updateData.appliedAt = existing.appliedAt;
          }
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
        // Preserve original postedDate, createdAt, isApplied, and appliedAt when updating
        const updateData = { ...job };
        if (existingByUrl.postedDate) {
          updateData.postedDate = existingByUrl.postedDate; // Keep original date
        }
        // Preserve applied status and date if job was already applied
        if (existingByUrl.isApplied) {
          updateData.isApplied = existingByUrl.isApplied;
          if (existingByUrl.appliedAt) {
            updateData.appliedAt = existingByUrl.appliedAt;
          }
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
      // Preserve original postedDate, createdAt, isApplied, appliedAt, and other original data when updating
      const updateData = { ...job };
      if (duplicate.postedDate) {
        updateData.postedDate = duplicate.postedDate; // Keep original date
      }
      // Preserve applied status and date if job was already applied
      if (duplicate.isApplied) {
        updateData.isApplied = duplicate.isApplied;
        if (duplicate.appliedAt) {
          updateData.appliedAt = duplicate.appliedAt;
        }
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

  async setSettingsBatch(settingsMap: Record<string, string>, userId: string): Promise<Setting[]> {
    // Get all existing settings for this user to determine which need to be updated vs inserted
    const existingSettings = await db.select().from(settings).where(eq(settings.userId, userId));
    const existingKeys = new Set(existingSettings.map(s => s.key));
    
    const now = new Date();
    const updates: Promise<Setting>[] = [];
    const inserts: { key: string; value: string; userId: string }[] = [];
    
    // Separate settings into updates and inserts
    for (const [key, value] of Object.entries(settingsMap)) {
      if (existingKeys.has(key)) {
        // Update existing setting
        updates.push(
          db
            .update(settings)
            .set({ value: String(value), updatedAt: now })
            .where(and(eq(settings.key, key), eq(settings.userId, userId)))
            .returning()
            .then(([updated]) => updated!)
        );
      } else {
        // Insert new setting (updatedAt will be set automatically by defaultNow())
        inserts.push({
          key,
          value: String(value),
          userId,
        });
      }
    }
    
    // Execute updates and inserts
    const updatedSettings = await Promise.all(updates);
    
    let insertedSettings: Setting[] = [];
    if (inserts.length > 0) {
      insertedSettings = await db.insert(settings).values(inserts).returning();
    }
    
    // Return all settings (both updated and newly inserted)
    return [...updatedSettings, ...insertedSettings];
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

  // Password Reset Tokens
  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [result] = await db.insert(passwordResetTokens).values(token).returning();
    return result;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [result] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);
    return result;
  }

  async getPasswordResetTokenByCode(code: string): Promise<PasswordResetToken | undefined> {
    const [result] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.code, code))
      .limit(1);
    return result;
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<boolean> {
    const result = await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async updateUserPassword(userId: string, newPassword: string): Promise<User | undefined> {
    const [result] = await db
      .update(users)
      .set({ password: newPassword })
      .where(eq(users.id, userId))
      .returning();
    return result;
  }
}

export const storage = new DatabaseStorage();

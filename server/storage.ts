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
  users,
  resumes,
  jobs,
  atsAnalyses,
  settings,
  activityLogs,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Resumes
  createResume(resume: InsertResume): Promise<Resume>;
  getResumes(): Promise<Resume[]>;
  getResume(id: number): Promise<Resume | undefined>;
  updateResume(id: number, resume: Partial<InsertResume>): Promise<Resume | undefined>;
  deleteResume(id: number): Promise<boolean>;

  // Jobs
  createJob(job: InsertJob): Promise<Job>;
  getJobs(filters?: { status?: string; minMatchScore?: number }): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  updateJob(id: number, job: Partial<InsertJob>): Promise<Job | undefined>;
  deleteJob(id: number): Promise<boolean>;
  upsertJobByExternalId(job: InsertJob): Promise<Job>;

  // ATS Analyses
  createATSAnalysis(analysis: InsertATSAnalysis): Promise<ATSAnalysis>;
  getATSAnalyses(limit?: number): Promise<ATSAnalysis[]>;
  getATSAnalysis(id: number): Promise<ATSAnalysis | undefined>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;

  // Activity Logs
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(limit?: number): Promise<ActivityLog[]>;
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

  // Resumes
  async createResume(resume: InsertResume): Promise<Resume> {
    const [newResume] = await db.insert(resumes).values(resume).returning();
    return newResume;
  }

  async getResumes(): Promise<Resume[]> {
    return await db.select().from(resumes).orderBy(desc(resumes.updatedAt));
  }

  async getResume(id: number): Promise<Resume | undefined> {
    const [resume] = await db.select().from(resumes).where(eq(resumes.id, id));
    return resume || undefined;
  }

  async updateResume(id: number, resume: Partial<InsertResume>): Promise<Resume | undefined> {
    const [updated] = await db
      .update(resumes)
      .set({ ...resume, updatedAt: new Date() })
      .where(eq(resumes.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteResume(id: number): Promise<boolean> {
    const result = await db.delete(resumes).where(eq(resumes.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Jobs
  async createJob(job: InsertJob): Promise<Job> {
    const [newJob] = await db.insert(jobs).values(job).returning();
    return newJob;
  }

  async getJobs(filters?: { status?: string; minMatchScore?: number }): Promise<Job[]> {
    let query = db.select().from(jobs);
    
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(jobs.status, filters.status));
    }
    if (filters?.minMatchScore) {
      conditions.push(sql`${jobs.matchScore} >= ${filters.minMatchScore}`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return await query.orderBy(desc(jobs.createdAt));
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async updateJob(id: number, job: Partial<InsertJob>): Promise<Job | undefined> {
    const [updated] = await db
      .update(jobs)
      .set(job)
      .where(eq(jobs.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteJob(id: number): Promise<boolean> {
    const result = await db.delete(jobs).where(eq(jobs.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async upsertJobByExternalId(job: InsertJob): Promise<Job> {
    if (!job.externalId) {
      return this.createJob(job);
    }

    const [existing] = await db.select().from(jobs).where(eq(jobs.externalId, job.externalId));
    
    if (existing) {
      const [updated] = await db
        .update(jobs)
        .set(job)
        .where(eq(jobs.externalId, job.externalId))
        .returning();
      return updated;
    }

    return this.createJob(job);
  }

  // ATS Analyses
  async createATSAnalysis(analysis: InsertATSAnalysis): Promise<ATSAnalysis> {
    const [newAnalysis] = await db.insert(atsAnalyses).values(analysis).returning();
    return newAnalysis;
  }

  async getATSAnalyses(limit: number = 50): Promise<ATSAnalysis[]> {
    return await db.select().from(atsAnalyses).orderBy(desc(atsAnalyses.createdAt)).limit(limit);
  }

  async getATSAnalysis(id: number): Promise<ATSAnalysis | undefined> {
    const [analysis] = await db.select().from(atsAnalyses).where(eq(atsAnalyses.id, id));
    return analysis || undefined;
  }

  // Settings
  async getSetting(key: string): Promise<Setting | undefined> {
    // First, check database settings (takes precedence)
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    if (setting) {
      return setting;
    }

    // Fallback to environment variables
    // Map setting keys to environment variable names
    const envVarMap: Record<string, string> = {
      perplexity_api_key: "PERPLEXITY_API_KEY",
      gemini_api_key: "GEMINI_API_KEY",
      jsearch_api_key: "JSEARCH_API_KEY",
      linkedin_api_key: "LINKEDIN_API_KEY",
      discord_webhook: "DISCORD_WEBHOOK_URL",
    };

    const envVarName = envVarMap[key];
    if (envVarName && process.env[envVarName]) {
      // Return a Setting-like object with env var value
      // Using id: -1 as a sentinel value to indicate it's from env vars
      return {
        id: -1,
        key,
        value: process.env[envVarName],
        updatedAt: new Date(),
      } as Setting;
    }

    return undefined;
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    // Check if setting exists in database (not from env vars)
    // We query directly to avoid getting env var fallback
    const [existing] = await db.select().from(settings).where(eq(settings.key, key));
    
    if (existing) {
      const [updated] = await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    }

    const [newSetting] = await db.insert(settings).values({ key, value }).returning();
    return newSetting;
  }

  async getAllSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }

  // Activity Logs
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db.insert(activityLogs).values(log).returning();
    return newLog;
  }

  async getActivityLogs(limit: number = 100): Promise<ActivityLog[]> {
    return await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit);
  }
}

export const storage = new DatabaseStorage();

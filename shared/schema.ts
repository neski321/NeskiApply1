import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"), // "user" or "admin"
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  code: text("code"), // Short-lived code for secure exchange (optional, for enhanced security)
  ipAddress: text("ip_address"), // Store IP for validation
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Resumes table
export const resumes = pgTable("resumes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fileName: text("file_name").notNull(),
  skills: text("skills").array().notNull(),
  technicalSkillsSection: text("technical_skills_section"),
  experience: text("experience").notNull(),
  education: text("education"),
  rawContent: text("raw_content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertResumeSchema = createInsertSchema(resumes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertResume = z.infer<typeof insertResumeSchema>;
export type Resume = typeof resumes.$inferSelect;

// Jobs table
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  externalId: text("external_id"), // Remove unique constraint, will be unique per user
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  salary: text("salary"),
  description: text("description").notNull(),
  requirements: text("requirements").array(),
  postedDate: text("posted_date"),
  source: text("source").notNull(),
  url: text("url"),
  status: text("status").notNull().default("pending"),
  isApplied: boolean("is_applied").default(false),
  appliedAt: timestamp("applied_at"),
  gotInterview: boolean("got_interview").default(false),
  rejected: boolean("rejected").default(false),
  matchScore: integer("match_score"),
  matchedResumeId: integer("matched_resume_id"),
  matchReasoning: text("match_reasoning").array(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
});

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// ATS Analysis Results
export const atsAnalyses = pgTable("ats_analyses", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: integer("job_id").references(() => jobs.id, { onDelete: "cascade" }), // Link to job if analysis was done for a scraped job
  jobTitle: text("job_title").notNull(),
  jobCompany: text("job_company"),
  jobDescription: text("job_description").notNull(),
  bestResumeId: integer("best_resume_id").notNull(),
  matchScore: integer("match_score").notNull(),
  missingKeywords: text("missing_keywords").array().notNull(),
  suggestions: jsonb("suggestions").notNull(),
  resumeComparisons: jsonb("resume_comparisons").notNull(),
  aiProvider: text("ai_provider"), // Track which AI was used (perplexity, gemini, openrouter)
  aiModel: text("ai_model"), // Track specific model used (for OpenRouter)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertATSAnalysisSchema = createInsertSchema(atsAnalyses).omit({
  id: true,
  createdAt: true,
});

export type InsertATSAnalysis = z.infer<typeof insertATSAnalysisSchema>;
export type ATSAnalysis = typeof atsAnalyses.$inferSelect;

// Settings table
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Activity Logs table
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "success", "info", "warning", "error"
  message: text("message").notNull(),
  metadata: jsonb("metadata"), // Additional data (job ID, resume ID, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Optimized Resumes table
export const optimizedResumes = pgTable("optimized_resumes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  originalResumeId: integer("original_resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  atsAnalysisId: integer("ats_analysis_id").references(() => atsAnalyses.id, { onDelete: "set null" }),
  optimizedAnalysisId: integer("optimized_analysis_id").references(() => atsAnalyses.id, { onDelete: "set null" }),
  professionalSummary: text("professional_summary").notNull(),
  technicalSkills: text("technical_skills").notNull(), // Changed from array to text to preserve formatting
  education: text("education"),
  relevantExperience: jsonb("relevant_experience").notNull(),
  projects: jsonb("projects"),
  changes: jsonb("changes").notNull(),
  originalScore: integer("original_score").notNull(),
  newScore: integer("new_score").notNull(),
  scoreImprovement: integer("score_improvement").notNull(),
  improved: boolean("improved").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOptimizedResumeSchema = createInsertSchema(optimizedResumes).omit({
  id: true,
  createdAt: true,
});

export type InsertOptimizedResume = z.infer<typeof insertOptimizedResumeSchema>;
export type OptimizedResume = typeof optimizedResumes.$inferSelect;

// Deleted Jobs table - tracks deleted jobs to prevent re-adding during scans/ingestion
export const deletedJobs = pgTable("deleted_jobs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  externalId: text("external_id"), // Original external ID if available
  url: text("url"), // Job URL if available
  title: text("title").notNull(), // Normalized title for matching
  company: text("company").notNull(), // Normalized company for matching
  reason: text("reason"), // "manual" or "auto_cleanup" or "old_unapplied"
  isExpired: boolean("is_expired").default(false), // If true, job can be re-added during scans
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
});

export const insertDeletedJobSchema = createInsertSchema(deletedJobs).omit({
  id: true,
  deletedAt: true,
});

export type InsertDeletedJob = z.infer<typeof insertDeletedJobSchema>;
export type DeletedJob = typeof deletedJobs.$inferSelect;

// Session table (for express-session with connect-pg-simple)
// This table stores user sessions for authentication
// Table name must be "session" (singular) to match connect-pg-simple expectations
// Note: connect-pg-simple creates this with JSON type, but Drizzle only supports jsonb
// Both are compatible - the table is created/managed by session.ts, this is just to prevent drizzle-kit from dropping it
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(), // connect-pg-simple uses JSON in SQL, but jsonb is compatible
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

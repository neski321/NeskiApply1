#!/usr/bin/env npx tsx
/**
 * Standalone script to clean up old job listings and related data from the database.
 * 
 * Run: npm run db:cleanup
 * Options (via Env Vars):
 *   DAYS_OLD=15          - Age threshold in days (default: 15)
 *   ONLY_UNAPPLIED=0     - Deletes all jobs (applied & unapplied). Set 1 to delete only unapplied (default: 1)
 *   DRY_RUN=1            - Previews the cleanup without deleting any data (default: 0)
 *   USER_ID=some-uuid    - Cleans up data only for a specific user (default: all users)
 */

import "dotenv/config";
import { db } from "../server/db";
import { jobs, atsAnalyses, optimizedResumes, interviewPreps, deletedJobs, users } from "@shared/schema";
import { eq, lt, and, or, isNull, inArray } from "drizzle-orm";

const DAYS_OLD = process.env.DAYS_OLD ? parseInt(process.env.DAYS_OLD, 10) : 15;
const ONLY_UNAPPLIED = process.env.ONLY_UNAPPLIED !== "0"; // Default: true (1)
const DRY_RUN = process.env.DRY_RUN === "1";
const USER_ID = process.env.USER_ID || null;

/**
 * Normalize text helper
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

async function main() {
  console.log("=========================================");
  console.log("       JOB DATABASE CLEANUP TOOL         ");
  console.log("=========================================");
  console.log(`Configuration:`);
  console.log(`- Age Threshold:      ${DAYS_OLD} days`);
  console.log(`- Only Unapplied:     ${ONLY_UNAPPLIED}`);
  console.log(`- Dry Run:            ${DRY_RUN}`);
  console.log(`- User Filter:        ${USER_ID || "All Users"}`);
  console.log("=========================================\n");

  if (isNaN(DAYS_OLD) || DAYS_OLD < 0) {
    console.error("Error: Invalid DAYS_OLD specified.");
    process.exit(1);
  }

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS_OLD);
  cutoffDate.setHours(0, 0, 0, 0);

  // Build query conditions
  const conditions: any[] = [lt(jobs.createdAt, cutoffDate)];

  if (USER_ID) {
    conditions.push(eq(jobs.userId, USER_ID));
  }

  if (ONLY_UNAPPLIED) {
    conditions.push(or(eq(jobs.isApplied, false), isNull(jobs.isApplied)));
  }

  // 1. Fetch target jobs
  const targetJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      userId: jobs.userId,
      externalId: jobs.externalId,
      url: jobs.url,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(and(...conditions));

  if (targetJobs.length === 0) {
    console.log("No jobs found matching the cleanup criteria.");
    return;
  }

  const jobIds = targetJobs.map((j) => j.id);

  // 2. Fetch count of related records that will be deleted due to CASCADE
  const relatedAnalyses = await db
    .select({ id: atsAnalyses.id })
    .from(atsAnalyses)
    .where(inArray(atsAnalyses.jobId, jobIds));

  const relatedOptimized = await db
    .select({ id: optimizedResumes.id })
    .from(optimizedResumes)
    .where(inArray(optimizedResumes.jobId, jobIds));

  const relatedPreps = await db
    .select({ id: interviewPreps.id })
    .from(interviewPreps)
    .where(inArray(interviewPreps.jobId, jobIds));

  // Print Summary of target records
  console.log(`Found ${targetJobs.length} job(s) older than ${DAYS_OLD} days to delete:`);
  console.log(`- Associated ATS Analyses:    ${relatedAnalyses.length}`);
  console.log(`- Associated Opt. Resumes:   ${relatedOptimized.length}`);
  console.log(`- Associated Interview Preps: ${relatedPreps.length}`);
  console.log("");

  if (DRY_RUN) {
    console.log("Jobs that would be deleted (first 10 shown):");
    targetJobs.slice(0, 10).forEach((j) => {
      console.log(`  [ID: ${j.id}] "${j.title}" at ${j.company} (Created: ${j.createdAt.toISOString()})`);
    });
    if (targetJobs.length > 10) {
      console.log(`  ... and ${targetJobs.length - 10} more`);
    }
    console.log("\n[DRY RUN] No changes were made to the database.");
    return;
  }

  // 3. Execution Mode - Deleting
  console.log("Executing cleanup...");

  // Write deleted job records to tracking table to prevent re-scraping
  const deletedJobEntries = targetJobs.map((job) => ({
    userId: job.userId,
    externalId: job.externalId || null,
    url: job.url || null,
    title: normalizeText(job.title),
    company: normalizeText(job.company),
    reason: ONLY_UNAPPLIED ? "old_unapplied" : "auto_cleanup",
    isExpired: false,
  }));

  for (const deletedJob of deletedJobEntries) {
    try {
      await db.insert(deletedJobs).values(deletedJob);
    } catch (error: any) {
      if (error?.code === '42703' || error?.message?.includes('does not exist')) {
        const { isExpired, ...deletedJobWithoutExpired } = deletedJob;
        await db.insert(deletedJobs).values(deletedJobWithoutExpired as any).catch(() => {});
      }
    }
  }

  // Perform cascaded delete on jobs
  const result = await db
    .delete(jobs)
    .where(and(...conditions));

  const deletedCount = result.rowCount || 0;

  console.log(`\nCleanup complete!`);
  console.log(`Successfully deleted ${deletedCount} job listing(s) and all related cascaded records.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nUnexpected error during cleanup:", err);
    process.exit(1);
  });

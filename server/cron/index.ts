import cron, { ScheduledTask } from "node-cron";
import { storage } from "../storage";
import { scrapeJobs } from "../scraper/index";
import { activityLogger } from "../logger";

let cronJob: ScheduledTask | null = null;
let reminderCronJob: ScheduledTask | null = null;
// Track last reminder sent date per user to prevent duplicates
const lastReminderSent: Map<string, string> = new Map(); // userId -> date string (YYYY-MM-DD)

/**
 * Execute daily job scraping for a specific user
 */
export async function executeDailyScraping(userId: string): Promise<{
  success: boolean;
  message: string;
  results?: any[];
}> {
  try {
    // Get search parameters from settings
    const jobTitlesSetting = await storage.getSetting("job_titles", userId);
    const countryCodesSetting = await storage.getSetting("country_codes", userId);
    const datePostedSetting = await storage.getSetting("date_posted", userId);
    const excludedKeywordsSetting = await storage.getSetting("excluded_keywords", userId);
    const workFromHomeSetting = await storage.getSetting("work_from_home", userId);
    const employmentTypesSetting = await storage.getSetting("employment_types", userId);
    const jsearchLanguageSetting = await storage.getSetting("jsearch_language", userId);
    const jsearchJobRequirementsSetting = await storage.getSetting("jsearch_job_requirements", userId);
    const jsearchRadiusSetting = await storage.getSetting("jsearch_radius", userId);
    const jsearchExcludeJobPublishersSetting = await storage.getSetting("jsearch_exclude_job_publishers", userId);

    if (!jobTitlesSetting) {
      return {
        success: false,
        message: "Job titles must be configured in Settings",
      };
    }

    const jobTitles = jobTitlesSetting.value.split(",").map((t) => t.trim()).filter(Boolean);

    if (jobTitles.length === 0) {
      return {
        success: false,
        message: "At least one job title must be configured",
      };
    }

    // Parse country code (take first if multiple provided)
    let countryCode = "US"; // Default to US
    if (countryCodesSetting?.value) {
      const codes = countryCodesSetting.value.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
      if (codes.length > 0) {
        countryCode = codes[0];
      }
    }

    // Parse date_posted (default to "week" if not set)
    const datePosted = datePostedSetting?.value || "week";

    // Map date_posted to postedAtMaxAgeDays
    const datePostedToDays: Record<string, number> = {
      today: 1,
      "3days": 3,
      week: 7,
      month: 30,
      all: 365,
    };
    const postedAtMaxAgeDays = datePostedToDays[datePosted] || 7;

    const excludedKeywords = excludedKeywordsSetting?.value
      ? excludedKeywordsSetting.value.split(",").map((k) => k.trim()).filter(Boolean)
      : [];

    // Parse JSearch-specific parameters
    const workFromHome = workFromHomeSetting?.value === "true";
    const employmentTypes = employmentTypesSetting?.value || undefined;
    const language = jsearchLanguageSetting?.value || undefined;
    const jobRequirements = jsearchJobRequirementsSetting?.value || undefined;
    const radius = jsearchRadiusSetting?.value ? parseInt(jsearchRadiusSetting.value) : undefined;
    const excludeJobPublishers = jsearchExcludeJobPublishersSetting?.value || undefined;

    // Log the activity
    await activityLogger.info("Daily cron job scraping started", {
      jobTitles: jobTitles.length,
      countryCode,
      datePosted,
    }, userId);

    // Execute scraping
    const results = await scrapeJobs({
      jobTitles,
      countryCodes: [countryCode],
      excludedKeywords,
      postedAtMaxAgeDays,
      workFromHome,
      employmentTypes,
      language,
      jobRequirements,
      radius,
      excludeJobPublishers,
      userId,
    });

    const totalJobsFound = results.reduce((sum, r) => sum + r.jobsFound, 0);
    const totalJobsAdded = results.reduce((sum, r) => sum + r.jobsAdded, 0);

    await activityLogger.info(
      `Daily cron job completed: ${totalJobsAdded} jobs added from ${totalJobsFound} found`,
      { results },
      userId
    );

    return {
      success: true,
      message: `Scraped ${totalJobsAdded} jobs from ${totalJobsFound} found`,
      results,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cron] Error executing daily scraping:", error);
    await activityLogger.error(`Daily cron job failed: ${errorMessage}`, {}, userId);
    
    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * Setup daily job scraping cron job
 */
export async function setupDailyScraping(): Promise<void> {
  // Stop existing cron job if any
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }

  // Get all users
  const allUsers = await storage.getAllUsers();
  console.log(`[Cron] Setting up cron jobs for ${allUsers.length} users`);

  // For simplicity, we'll check every 15 minutes if it's time to run for any user
  // This approach is simpler than managing multiple cron schedules
  cronJob = cron.schedule("*/15 * * * *", async () => {
    try {
      const allUsers = await storage.getAllUsers();

      for (const user of allUsers) {
        try {
          // Check if user has cron enabled
          const cronEnabledSetting = await storage.getSetting("cron_enabled", user.id);
          if (!cronEnabledSetting || cronEnabledSetting.value !== "true") {
            continue;
          }

          // Get user's schedule settings
          const scheduleTimeSetting = await storage.getSetting("cron_schedule_time", user.id);
          const timezoneSetting = await storage.getSetting("cron_timezone", user.id);

          const scheduleTime = scheduleTimeSetting?.value || "09:00";
          const timezone = timezoneSetting?.value || "America/Toronto";

          // Check if it's time to run for this user
          if (shouldRunNow(scheduleTime, timezone)) {
            console.log(
              `[Cron] Running scheduled job for user ${user.id} (${user.username}) at ${scheduleTime} ${timezone}`
            );
            await executeDailyScraping(user.id);
          }
        } catch (error) {
          console.error(`[Cron] Error processing user ${user.id}:`, error);
          // Continue with other users
        }
      }
    } catch (error) {
      console.error("[Cron] Error in cron job:", error);
    }
  });

  console.log("[Cron] Daily scraping cron job scheduled (checks every 15 minutes)");
}

/**
 * Execute reminder check for a specific user
 */
export async function executeReminderCheck(userId: string, force: boolean = false): Promise<{
  success: boolean;
  message: string;
  sent?: boolean;
}> {
  try {
    // Check if reminders are enabled
    const reminderEnabled = await storage.getSetting("reminder_enabled", userId);
    if (!reminderEnabled || reminderEnabled.value !== "true") {
      return {
        success: true,
        message: "Reminders are disabled",
        sent: false,
      };
    }

    // Check if we already sent a reminder today (unless forced)
    if (!force) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const lastSent = lastReminderSent.get(userId);
      if (lastSent === today) {
        console.log(`[Cron] Reminder already sent today for user ${userId}, skipping`);
        return {
          success: true,
          message: "Reminder already sent today",
          sent: false,
        };
      }
    }

    // Get all unapplied jobs
    const allJobs = await storage.getJobs(userId, { isApplied: false });
    
    // Filter out rejected jobs
    const unappliedJobs = allJobs.filter(j => j.status !== "rejected");
    
    // Get reminder threshold (default: 70%)
    const reminderThresholdSetting = await storage.getSetting("reminder_match_threshold", userId);
    const reminderThreshold = reminderThresholdSetting ? parseInt(reminderThresholdSetting.value, 10) : 70;
    
    // Count high priority unapplied jobs
    const highPriorityJobs = unappliedJobs.filter(j => j.matchScore && j.matchScore >= reminderThreshold);
    
    // Only send reminder if there are unapplied jobs
    if (unappliedJobs.length === 0) {
      return {
        success: true,
        message: "No unapplied jobs to remind about",
        sent: false,
      };
    }

    // Send Discord reminder
    const { sendApplyReminder } = await import("../discord");
    const sent = await sendApplyReminder(userId, unappliedJobs.length, highPriorityJobs.length);
    
    if (sent) {
      // Track that we sent a reminder today
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      lastReminderSent.set(userId, today);
      
      await activityLogger.info(
        `Reminder sent: ${unappliedJobs.length} unapplied jobs (${highPriorityJobs.length} high priority)`,
        { unappliedJobs: unappliedJobs.length, highPriorityJobs: highPriorityJobs.length },
        userId
      );
    }

    return {
      success: true,
      message: `Reminder sent for ${unappliedJobs.length} unapplied jobs`,
      sent,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cron] Error executing reminder check:", error);
    await activityLogger.error(`Reminder check failed: ${errorMessage}`, {}, userId);
    
    return {
      success: false,
      message: errorMessage,
      sent: false,
    };
  }
}

/**
 * Setup reminder cron job
 */
export async function setupReminderCron(): Promise<void> {
  // Stop existing reminder cron job if any
  if (reminderCronJob) {
    reminderCronJob.stop();
    reminderCronJob = null;
  }

  // Get all users
  const allUsers = await storage.getAllUsers();
  console.log(`[Cron] Setting up reminder cron jobs for ${allUsers.length} users`);

  // Check every 15 minutes if it's time to send reminders
  reminderCronJob = cron.schedule("*/15 * * * *", async () => {
    try {
      const allUsers = await storage.getAllUsers();

      for (const user of allUsers) {
        try {
          // Check if reminders are enabled
          const reminderEnabled = await storage.getSetting("reminder_enabled", user.id);
          if (!reminderEnabled || reminderEnabled.value !== "true") {
            continue;
          }

          // Get user's reminder time settings
          const reminderTimeSetting = await storage.getSetting("reminder_time", user.id);
          const timezoneSetting = await storage.getSetting("cron_timezone", user.id);

          const reminderTime = reminderTimeSetting?.value || "16:00"; // Default 4pm
          const timezone = timezoneSetting?.value || "America/Toronto";

          // Check if it's time to send reminder for this user
          if (shouldRunNow(reminderTime, timezone, true)) {
            console.log(
              `[Cron] Sending reminder for user ${user.id} (${user.username}) at ${reminderTime} ${timezone}`
            );
            await executeReminderCheck(user.id, false);
          }
        } catch (error) {
          console.error(`[Cron] Error processing reminder for user ${user.id}:`, error);
          // Continue with other users
        }
      }
    } catch (error) {
      console.error("[Cron] Error in reminder cron job:", error);
    }
  });

  console.log("[Cron] Reminder cron job scheduled (checks every 15 minutes)");
}

/**
 * Reschedule reminder cron job (called when reminder settings change)
 */
export async function rescheduleReminderCron(): Promise<void> {
  console.log("[Cron] Rescheduling reminder cron job...");
  await setupReminderCron();
}

/**
 * Reschedule the cron job (called when cron settings change)
 */
export async function rescheduleDailyScraping(): Promise<void> {
  console.log("[Cron] Rescheduling daily scraping cron job...");
  await setupDailyScraping();
}

/**
 * Check if a cron job should run now based on schedule time and timezone
 * For reminders, we want to be more precise to avoid multiple sends
 */
function shouldRunNow(scheduleTime: string, timezone: string, isReminder: boolean = false): boolean {
  try {
    const [scheduleHour, scheduleMinute] = scheduleTime.split(":").map(Number);

    if (isNaN(scheduleHour) || isNaN(scheduleMinute)) {
      return false;
    }

    // Convert current time to user's timezone
    const now = new Date();
    const userTimeString = now.toLocaleString("en-US", {
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });

    const [currentHour, currentMinute] = userTimeString.split(":").map(Number);

    if (isReminder) {
      // For reminders, only trigger at the exact scheduled time (within 5 minutes tolerance)
      // This prevents multiple reminders in the same 15-minute window
      const timeDiff = Math.abs(
        currentHour * 60 + currentMinute - (scheduleHour * 60 + scheduleMinute)
      );
      return timeDiff <= 5; // Within 5 minutes of scheduled time (more precise)
    } else {
      // For scraping, use the original 15-minute window
      const timeDiff = Math.abs(
        currentHour * 60 + currentMinute - (scheduleHour * 60 + scheduleMinute)
      );
      return timeDiff <= 15; // Within 15 minutes of scheduled time
    }
  } catch (error) {
    console.error("[Cron] Error checking schedule time:", error);
    return false;
  }
}

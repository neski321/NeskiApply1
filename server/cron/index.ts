import cron, { ScheduledTask } from "node-cron";
import { storage } from "../storage";
import { scrapeJobs } from "../scraper/index";
import { activityLogger } from "../logger";

// Store the current cron task so we can stop and reschedule it
let currentCronTask: ScheduledTask | null = null;

/**
 * Execute the daily job scraping job manually
 * This is the same logic that runs in the cron job
 */
export async function executeDailyScraping(userId: string): Promise<{ success: boolean; message: string; results?: any }> {
  console.log(`Starting daily job scraping for user ${userId} (manual trigger)...`);
  await activityLogger.info("Daily job scraping started (manual trigger)", undefined, userId);
  
  try {
    // Get search parameters from settings (matching JSearch API format)
    const jobTitlesSetting = await storage.getSetting("job_titles", userId);
    const countryCodesSetting = await storage.getSetting("country_codes", userId);
    const datePostedSetting = await storage.getSetting("date_posted", userId);
    const workFromHomeSetting = await storage.getSetting("work_from_home", userId);
    const employmentTypesSetting = await storage.getSetting("employment_types", userId);
    const excludedKeywordsSetting = await storage.getSetting("excluded_keywords", userId);
    const linkedInTimePeriodSetting = await storage.getSetting("linkedin_time_period", userId);
    const linkedInLocationFilterSetting = await storage.getSetting("linkedin_location_filter", userId);
    const jobSearchProviderPreferenceSetting = await storage.getSetting("job_search_provider_preference", userId);
    
    if (!jobTitlesSetting) {
      const message = "Job titles not configured, skipping daily scrape";
      console.log(message);
      return { success: false, message };
    }
    
    const jobTitles = jobTitlesSetting.value.split(",").map(t => t.trim()).filter(Boolean);
    
    if (jobTitles.length === 0) {
      const message = "No job titles configured, skipping daily scrape";
      console.log(message);
      return { success: false, message };
    }
    
    // Parse country code (JSearch uses single country, take first if multiple provided)
    let countryCode = "US"; // Default to US
    if (countryCodesSetting?.value) {
      const codes = countryCodesSetting.value.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
      if (codes.length > 0) {
        countryCode = codes[0]; // Use first country code
      }
    }
    
    // Parse date_posted (default to "week" if not set)
    const datePosted = datePostedSetting?.value || "week";
    
    // Parse work_from_home (default to false)
    const workFromHome = workFromHomeSetting?.value === "true";
    
    // Parse employment_types (optional)
    const employmentTypes = employmentTypesSetting?.value || undefined;
    
    const excludedKeywords = excludedKeywordsSetting?.value
      ? excludedKeywordsSetting.value.split(",").map(k => k.trim()).filter(Boolean)
      : [];
    
    // LinkedIn settings
    const linkedInTimePeriod = (linkedInTimePeriodSetting?.value || "both") as "24h" | "7d" | "both";
    const linkedInLocationFilter = linkedInLocationFilterSetting?.value || undefined;
    
    // Job search provider preference
    const jobSearchProviderPreference = (jobSearchProviderPreferenceSetting?.value || "auto") as "auto" | "jsearch" | "linkedin";
    console.log(`[Cron] Job search provider preference from settings: "${jobSearchProviderPreference}"`);
    
    // Map date_posted to postedAtMaxAgeDays for compatibility with scrapeJobs interface
    const datePostedToDays: Record<string, number> = {
      "today": 1,
      "3days": 3,
      "week": 7,
      "month": 30,
      "all": 365,
    };
    const postedAtMaxAgeDays = datePostedToDays[datePosted] || 7;
    
    const results = await scrapeJobs({
      jobTitles,
      countryCodes: [countryCode], // Pass as array for compatibility
      excludedKeywords,
      postedAtMaxAgeDays,
      locationFilter: linkedInLocationFilter,
      linkedInTimePeriod,
      jobSearchProviderPreference,
      userId, // Pass userId to scraper
    });
    
    const totalFound = results.reduce((sum, r) => sum + r.jobsFound, 0);
    const totalAdded = results.reduce((sum, r) => sum + r.jobsAdded, 0);
    
    console.log(`Daily scraping complete: ${totalAdded} new jobs added from ${totalFound} found`);
    await activityLogger.success(
      `Daily scraping complete: ${totalAdded} new jobs added from ${totalFound} found`,
      { results },
      userId
    );
    
    return {
      success: true,
      message: `Scraping complete: ${totalAdded} new jobs added from ${totalFound} found`,
      results,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in daily job scraping:", error);
    await activityLogger.error(
      "Daily job scraping failed",
      { error: errorMessage },
      userId
    );
    return { success: false, message: errorMessage };
  }
}

/**
 * Convert time string (HH:MM) to cron expression
 * @param timeString Time in format "HH:MM" (24-hour format)
 * @returns Cron expression string
 */
function timeToCronExpression(timeString: string): string {
  const [hours, minutes] = timeString.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    console.warn(`Invalid time format: ${timeString}, defaulting to 9:00 AM`);
    return "0 9 * * *"; // Default to 9:00 AM
  }
  return `${minutes} ${hours} * * *`; // Cron format: minute hour day month day-of-week
}

/**
 * Check and execute cron jobs for all enabled users
 * This runs every hour and checks which users should have their jobs run
 */
async function checkAndRunUserCronJobs() {
  try {
    const allUsers = await storage.getAllUsers();
    const now = new Date();
    
    console.log(`[Cron] Checking cron jobs for ${allUsers.length} users at ${now.toISOString()}`);
    
    for (const user of allUsers) {
      try {
        // Check if user has cron enabled
        const cronEnabledSetting = await storage.getSetting("cron_enabled", user.id);
        if (!cronEnabledSetting || cronEnabledSetting.value !== "true") {
          continue; // Skip users who haven't enabled cron
        }
        
        // Get user's schedule settings
        const scheduleTimeSetting = await storage.getSetting("cron_schedule_time", user.id);
        const timezoneSetting = await storage.getSetting("cron_timezone", user.id);
        
        const scheduleTime = scheduleTimeSetting?.value || "09:00";
        const timezone = timezoneSetting?.value || "America/Toronto";
        
        // Check if it's time to run for this user
        if (shouldRunNow(scheduleTime, timezone, now)) {
          console.log(`[Cron] Running scheduled job for user ${user.id} (${user.username}) at ${scheduleTime} ${timezone}`);
          // Run in background (don't await) - this allows multiple users to run in parallel
          executeDailyScraping(user.id).catch(error => {
            console.error(`[Cron] Error running cron job for user ${user.id}:`, error);
          });
        } else {
          // Log when we check but it's not time yet (for debugging)
          const userTimeString = now.toLocaleString("en-US", { 
            timeZone: timezone,
            hour12: false,
            hour: "2-digit",
            minute: "2-digit"
          });
          // Only log occasionally to avoid spam
          if (Math.random() < 0.1) { // 10% chance to log
            console.log(`[Cron] Not time yet for user ${user.id} (${user.username}): current=${userTimeString}, scheduled=${scheduleTime} ${timezone}`);
          }
        }
      } catch (error) {
        console.error(`[Cron] Error checking cron for user ${user.id}:`, error);
        // Continue with other users
      }
    }
  } catch (error) {
    console.error("[Cron] Error checking user cron jobs:", error);
  }
}

/**
 * Check if a cron job should run now based on schedule time and timezone
 */
function shouldRunNow(scheduleTime: string, timezone: string, now: Date): boolean {
  try {
    const [scheduleHour, scheduleMinute] = scheduleTime.split(":").map(Number);
    
    if (isNaN(scheduleHour) || isNaN(scheduleMinute)) {
      return false;
    }
    
    // Convert current time to user's timezone
    const userTimeString = now.toLocaleString("en-US", { 
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit"
    });
    
    const [currentHour, currentMinute] = userTimeString.split(":").map(Number);
    
    // Run if it's the scheduled hour and minute (within a 5-minute window to account for cron frequency)
    // This allows the cron to run every 15 minutes and still catch scheduled times
    const timeDiff = Math.abs((currentHour * 60 + currentMinute) - (scheduleHour * 60 + scheduleMinute));
    return timeDiff <= 5; // Within 5 minutes of scheduled time
  } catch (error) {
    console.error(`[Cron] Error checking schedule time:`, error);
    return false;
  }
}

/**
 * Setup daily job scraping cron job
 * Runs every hour and checks which users should have their jobs executed
 */
export async function setupDailyScraping() {
  // Stop existing cron job if it exists
  if (currentCronTask) {
    currentCronTask.stop();
    currentCronTask = null;
  }

  // Run every 15 minutes to catch all scheduled times (including times like 9:30, 10:45, etc.)
  // This ensures we don't miss scheduled times that aren't on the hour
  const cronExpression = "*/15 * * * *"; // Every 15 minutes
  
  console.log(`[Cron] Setting up multi-user cron job system (runs every 15 minutes)`);
  
  // Schedule the cron job to run every 15 minutes
  currentCronTask = cron.schedule(cronExpression, async () => {
    console.log(`[Cron] Scheduled check triggered at ${new Date().toLocaleString()}`);
    await checkAndRunUserCronJobs();
  }, {
    scheduled: true,
    timezone: "UTC", // Use UTC for the cron schedule itself, we'll convert per-user
  });
  
  console.log(`[Cron] Multi-user cron job system active (checks every 15 minutes for enabled users)`);
  
  // Also run an initial check
  await checkAndRunUserCronJobs();
}

/**
 * Reschedule the cron job (call this when settings change)
 */
export async function rescheduleDailyScraping() {
  console.log("[Cron] Rescheduling daily job scraping...");
  await setupDailyScraping();
}


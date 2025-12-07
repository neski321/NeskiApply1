import cron from "node-cron";
import { storage } from "../storage";
import { scrapeJobs } from "../scraper/index";
import { activityLogger } from "../logger";

/**
 * Execute the daily job scraping job manually
 * This is the same logic that runs in the cron job
 */
export async function executeDailyScraping(): Promise<{ success: boolean; message: string; results?: any }> {
  console.log("Starting daily job scraping (manual trigger)...");
  await activityLogger.info("Daily job scraping started (manual trigger)");
  
  try {
    // Get search parameters from settings (matching JSearch API format)
    const jobTitlesSetting = await storage.getSetting("job_titles");
    const countryCodesSetting = await storage.getSetting("country_codes");
    const datePostedSetting = await storage.getSetting("date_posted");
    const workFromHomeSetting = await storage.getSetting("work_from_home");
    const employmentTypesSetting = await storage.getSetting("employment_types");
    const excludedKeywordsSetting = await storage.getSetting("excluded_keywords");
    const linkedInTimePeriodSetting = await storage.getSetting("linkedin_time_period");
    const linkedInLocationFilterSetting = await storage.getSetting("linkedin_location_filter");
    const jobSearchProviderPreferenceSetting = await storage.getSetting("job_search_provider_preference");
    
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
    });
    
    const totalFound = results.reduce((sum, r) => sum + r.jobsFound, 0);
    const totalAdded = results.reduce((sum, r) => sum + r.jobsAdded, 0);
    
    console.log(`Daily scraping complete: ${totalAdded} new jobs added from ${totalFound} found`);
    await activityLogger.success(
      `Daily scraping complete: ${totalAdded} new jobs added from ${totalFound} found`,
      { results }
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
      { error: errorMessage }
    );
    return { success: false, message: errorMessage };
  }
}

/**
 * Setup daily job scraping cron job
 * Runs every day at 9:00 AM
 */
export function setupDailyScraping() {
  cron.schedule("0 9 * * *", async () => {
    await executeDailyScraping();
  }, {
    scheduled: true,
    timezone: "America/Toronto", // Adjust to your timezone
  });
  
  console.log("Daily job scraping cron job scheduled (runs daily at 9:00 AM)");
}


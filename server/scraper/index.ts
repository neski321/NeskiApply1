import { storage } from "../storage";
import { scrapeJSearch } from "./jsearch";
import { scrapeApify } from "./apify";
import type { InsertJob } from "@shared/schema";

export interface ScrapeOptions {
  jobTitles: string[];
  countryCodes: string[];
  excludedKeywords?: string[];
  limit?: number;
  postedAtMaxAgeDays?: number;
  // JSearch API parameters
  workFromHome?: boolean;
  employmentTypes?: string;
  language?: string;
  jobRequirements?: string;
  radius?: number;
  excludeJobPublishers?: string;
  page?: number;
  numPages?: number;
  userId: string; // User ID for user-specific data
  /** When true, skip Apify 31/day limit (for manual Sync / Run Cron) */
  skipApifyLimit?: boolean;
}

export interface ScrapeResult {
  source: string;
  jobsFound: number;
  jobsAdded: number;
  errors: string[];
}

/**
 * Main job scraper - uses JSearch API (via RapidAPI)
 * Job scraping limit is configurable via settings (job_scraping_limit)
 */
export async function scrapeJobs(options: ScrapeOptions): Promise<ScrapeResult[]> {
  const {
    jobTitles,
    countryCodes,
    excludedKeywords = [],
    limit,
    postedAtMaxAgeDays = 7, // Default to 7 days (maps to "week" for JSearch)
    workFromHome,
    employmentTypes,
    language,
    jobRequirements,
    radius,
    excludeJobPublishers,
    page,
    numPages,
    userId,
    skipApifyLimit = false,
  } = options;
  
  // Get job scraping limit from settings, default to 10 if not provided
  const jobScrapingLimitSetting = await storage.getSetting("job_scraping_limit", userId);
  const defaultLimit = jobScrapingLimitSetting?.value ? parseInt(jobScrapingLimitSetting.value, 10) : 10;
  const effectiveLimit = limit !== undefined ? limit : defaultLimit;
  
  // Use effective limit (capped at 500 to stay within API limits)
  const jsearchLimit = Math.min(effectiveLimit, 500);
  
  console.log(`[Job Scraping Limit] Setting value: ${jobScrapingLimitSetting?.value || 'not set'}, Effective limit: ${jsearchLimit}`);

  const results: ScrapeResult[] = [];
  const allJobsToMatch: Array<{ id: number; title: string }> = [];

  // Get API keys and hosts from settings
  const jsearchApiKey = await storage.getSetting("jsearch_api_key", userId);
  const jsearchRapidApiHost = await storage.getSetting("jsearch_rapidapi_host", userId);
  
  // Get JSearch-specific parameters from settings (if not provided in options)
  const workFromHomeSetting = await storage.getSetting("work_from_home", userId);
  const employmentTypesSetting = await storage.getSetting("employment_types", userId);
  const languageSetting = await storage.getSetting("jsearch_language", userId);
  const jobRequirementsSetting = await storage.getSetting("jsearch_job_requirements", userId);
  const radiusSetting = await storage.getSetting("jsearch_radius", userId);
  const excludeJobPublishersSetting = await storage.getSetting("jsearch_exclude_job_publishers", userId);

  // Filter out excluded keywords
  const filterJob = (job: InsertJob): boolean => {
    if (excludedKeywords.length === 0) return true;
    
    const jobText = `${job.title} ${job.description} ${job.company}`.toLowerCase();
    return !excludedKeywords.some(keyword => 
      jobText.includes(keyword.toLowerCase())
    );
  };

  // Scrape from JSearch (via RapidAPI)
  // JSearch uses a single country code, so we'll use the first one
  const primaryCountryCode = countryCodes.length > 0 ? countryCodes[0] : "US";
  
  // Map postedAtMaxAgeDays to JSearch date_posted parameter
  const datePostedMap: Record<number, string> = {
    0: "today",
    1: "today",
    3: "3days",
    7: "week",
    30: "month",
  };
  const datePosted = datePostedMap[postedAtMaxAgeDays] || "week";
  
  // Scrape from JSearch
  if (jsearchApiKey?.value) {
    try {
      console.log(`Starting JSearch scrape (limited to ${jsearchLimit} jobs per day)...`);
      
      // Build JSearch options from parameters and settings
      const jsearchOptions: import("./jsearch").JSearchScrapeOptions = {
        limit: jsearchLimit,
        datePosted,
        workFromHome: workFromHome !== undefined ? workFromHome : (workFromHomeSetting?.value === "true"),
        employmentTypes: employmentTypes || employmentTypesSetting?.value,
        language: language || languageSetting?.value,
        jobRequirements: jobRequirements || jobRequirementsSetting?.value,
        radius: radius !== undefined ? radius : (radiusSetting?.value ? parseInt(radiusSetting.value) : undefined),
        excludeJobPublishers: excludeJobPublishers || excludeJobPublishersSetting?.value,
        page: page,
        numPages: numPages,
      };
      
      const jsearchJobs = await scrapeJSearch(
        jobTitles,
        primaryCountryCode,
        jsearchApiKey.value,
        jsearchOptions,
        jsearchRapidApiHost?.value // rapidApiHost
      );
      
      // Log JSearch API call with proper request count based on pages
      // JSearch pricing: 1 page = 1 request, 2-10 pages = 2x, 10+ pages = 3x
      if (jsearchJobs.length > 0) {
        const { logAPICall } = await import("../api-usage");
        
        // Calculate actual pages used (from the scrapeJSearch function)
        const actualNumPages = jsearchOptions.numPages || Math.ceil(jsearchLimit / 10);
        const finalNumPages = Math.min(actualNumPages, 50);
        
        // Calculate request count based on JSearch pricing rules
        let requestCount = 1; // Default: 1 page = 1 request
        if (finalNumPages > 1 && finalNumPages <= 10) {
          requestCount = 2; // 2-10 pages = 2x requests
        } else if (finalNumPages > 10) {
          requestCount = 3; // 10+ pages = 3x requests
        }
        
        await logAPICall("JSearch API", "jsearch", { 
          jobsReturned: jsearchJobs.length,
          pages: finalNumPages,
          requestCount: requestCount
        }, userId);
      }
      
      const filteredJobs = jsearchJobs.filter(filterJob);
      let jobsAdded = 0;
      
      for (const job of filteredJobs) {
        try {
          const { job: savedJob, wasInserted } = await storage.upsertJobByExternalId(job, userId);
          if (wasInserted && savedJob) {
            jobsAdded++;
            allJobsToMatch.push({ id: savedJob.id, title: savedJob.title });
          }
        } catch (error: any) {
          if (error?.skip && error?.message?.includes("previously deleted")) continue;
          console.error("Error saving JSearch job:", error);
        }
      }

      const { activityLogger } = await import("../logger");
      if (jobsAdded > 0) {
        await activityLogger.success(
          `JSearch job ingestion: ${jobsAdded} new jobs added`,
          { inserted: jobsAdded, source: "JSearch" },
          userId
        );
      }
      
      results.push({
        source: "JSearch",
        jobsFound: jsearchJobs.length,
        jobsAdded: jobsAdded,
        errors: [],
      });
    } catch (error) {
      results.push({
        source: "JSearch",
        jobsFound: 0,
        jobsAdded: 0,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
    }
  }

  // Scrape from Apify Indeed Scraper (if configured)
  const apifyApiToken = await storage.getSetting("apify_api_token", userId);
  const hasApifyToken = !!(apifyApiToken?.value?.trim());
  console.log(`[Apify] Token configured: ${hasApifyToken}, skipLimit: ${skipApifyLimit}`);

  if (hasApifyToken) {
    try {
      const apifyCountrySetting = await storage.getSetting("apify_country", userId);
      const apifyLocationSetting = await storage.getSetting("apify_location", userId);
      const apifyParseCompanyDetailsSetting = await storage.getSetting("apify_parse_company_details", userId);
      const apifySaveOnlyUniqueSetting = await storage.getSetting("apify_save_only_unique_items", userId);
      const apifyFollowRedirectsSetting = await storage.getSetting("apify_follow_apply_redirects", userId);
      const apifyUseCommonFiltersSetting = await storage.getSetting("apify_use_common_filters", userId);

      const apifyCountry = apifyCountrySetting?.value?.trim().toUpperCase().slice(0, 2)
        || primaryCountryCode;
      const apifyLocation = apifyLocationSetting?.value?.trim() || undefined;

      // Build up to 3 position+limit pairs (fallback to Job Search titles if empty)
      const rawTitles = jobTitles.join(", ").trim() || "web developer";
      const fallbackPositions = rawTitles.split(",").map((p) => p.trim()).filter(Boolean).slice(0, 3);

      const apifySlots: { position: string; limit: number }[] = [];
      for (let i = 1; i <= 3; i++) {
        const posVal = (await storage.getSetting(`apify_position_${i}`, userId))?.value?.trim()
          || fallbackPositions[i - 1]
          || "";
        const limitVal = (await storage.getSetting(`apify_max_items_${i}`, userId))?.value;
        const limit = limitVal ? Math.min(31, Math.max(0, parseInt(limitVal, 10))) : 0;
        if (posVal && limit > 0) {
          apifySlots.push({ position: posVal, limit });
        }
      }

      if (apifySlots.length === 0) {
        apifySlots.push({ position: fallbackPositions[0] || "web developer", limit: 31 });
      }

      // Enforce 31/day hard limit (unless skipApifyLimit for manual runs)
      const { getApifyDailyUsage, logAPICall } = await import("../api-usage");
      let apifyUsedToday = 0;
      try {
        apifyUsedToday = await getApifyDailyUsage(userId);
      } catch (usageErr) {
        console.warn("[Apify] Could not get daily usage, assuming 0:", usageErr);
      }
      const APIFY_DAILY_LIMIT = 31;
      const remaining = skipApifyLimit ? Infinity : Math.max(0, APIFY_DAILY_LIMIT - apifyUsedToday);

      if (remaining <= 0) {
        console.log(`[Apify] Daily limit reached (${apifyUsedToday}/${APIFY_DAILY_LIMIT}), skipping. Use Sync/Run Cron with confirmation to bypass.`);
        results.push({
          source: "Apify",
          jobsFound: 0,
          jobsAdded: 0,
          errors: ["Daily limit of 31 jobs reached. Resets at midnight."],
        });
      } else {
        if (skipApifyLimit) {
          console.log(`[Apify] Manual run: skipping 31/day limit (bypass requested)`);
        }
        const apifyOptions = {
          country: apifyCountry,
          location: apifyLocation,
          parseCompanyDetails: apifyParseCompanyDetailsSetting?.value === "true",
          saveOnlyUniqueItems: apifySaveOnlyUniqueSetting?.value !== "false",
          followApplyRedirects: apifyFollowRedirectsSetting?.value === "true",
        };

        const seenExternalIds = new Set<string>();
        const apifyJobs: import("@shared/schema").InsertJob[] = [];
        let totalRequested = 0;

        const apifyIntervalSetting = await storage.getSetting("apify_search_interval_seconds", userId);
        const rawInterval = apifyIntervalSetting?.value ? parseInt(apifyIntervalSetting.value, 10) : 60;
        const intervalSeconds = Number.isNaN(rawInterval) ? 60 : Math.max(0, Math.min(86400, rawInterval)); // 0–24h max
        const intervalMs = intervalSeconds * 1000;

        const slotSummary = apifySlots.map(s => `${s.position}:${s.limit}`).join("; ");
        console.log(`[Apify] Starting: interval=${intervalSeconds}s, slots=${apifySlots.length}, remaining=${remaining} [${slotSummary}]`);

        for (let slotIndex = 0; slotIndex < apifySlots.length; slotIndex++) {
          const { position, limit } = apifySlots[slotIndex];
          const cappedLimit = remaining === Infinity ? limit : Math.min(limit, remaining - totalRequested);
          if (cappedLimit <= 0) break;

          if (slotIndex > 0 && intervalMs > 0) {
            console.log(`[Apify] Waiting ${intervalSeconds}s before slot ${slotIndex + 1}/${apifySlots.length}...`);
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
            console.log(`[Apify] Wait complete. Starting scrape for "${position}"`);
          }

          console.log(`[Apify] Starting scrape: position="${position}", limit=${cappedLimit}, country=${apifyCountry}`);
          const jobs = await scrapeApify(apifyApiToken.value, {
            position,
            maxItemsPerSearch: cappedLimit,
            ...apifyOptions,
          });
          totalRequested += cappedLimit;

          for (const job of jobs) {
            const key = job.externalId || `${job.title}|${job.company}`;
            if (!seenExternalIds.has(key)) {
              seenExternalIds.add(key);
              apifyJobs.push(job);
            }
          }
        }

        if (totalRequested > 0) {
          await logAPICall("Apify LinkedIn Jobs Scraper", "apify", { jobsRequested: totalRequested }, userId);
        }

        const apifyUseCommonFilters = apifyUseCommonFiltersSetting?.value !== "false";
        const filteredApifyJobs = apifyUseCommonFilters ? apifyJobs.filter(filterJob) : apifyJobs;
        let apifyJobsAdded = 0;

        for (const job of filteredApifyJobs) {
          try {
            const { job: savedJob, wasInserted } = await storage.upsertJobByExternalId(job, userId);
            if (wasInserted && savedJob) {
              apifyJobsAdded++;
              allJobsToMatch.push({ id: savedJob.id, title: savedJob.title });
            }
          } catch (error: any) {
            if (error?.skip && error?.message?.includes("previously deleted")) continue;
            console.error("Error saving Apify job:", error);
          }
        }

        const { activityLogger } = await import("../logger");
        if (apifyJobsAdded > 0) {
          await activityLogger.success(
            `Apify job ingestion: ${apifyJobsAdded} new jobs added`,
            { inserted: apifyJobsAdded, source: "Apify" },
            userId
          );
        }

        results.push({
          source: "Apify",
          jobsFound: apifyJobs.length,
          jobsAdded: apifyJobsAdded,
          errors: [],
        });
      }
    } catch (error) {
      console.error("[Apify] Error:", error);
      results.push({
        source: "Apify",
        jobsFound: 0,
        jobsAdded: 0,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
    }
  } else {
    console.log("[Apify] Skipped: no API token configured");
  }

  // Run sequential background matching for all scraped jobs (JSearch + Apify)
  // Single queue respects Gemini's 2 req/min limit with 30s delay between requests
  if (allJobsToMatch.length > 0) {
    const { runBackgroundMatching } = await import("../ingestion");
    runBackgroundMatching(allJobsToMatch, userId, "Cron");
  }

  return results;
}

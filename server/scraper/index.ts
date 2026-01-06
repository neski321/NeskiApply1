import { storage } from "../storage";
import { scrapeJSearch } from "./jsearch";
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
  } = options;
  
  // Get job scraping limit from settings, default to 10 if not provided
  const jobScrapingLimitSetting = await storage.getSetting("job_scraping_limit", userId);
  const defaultLimit = jobScrapingLimitSetting?.value ? parseInt(jobScrapingLimitSetting.value, 10) : 10;
  const effectiveLimit = limit !== undefined ? limit : defaultLimit;
  
  // Use effective limit (capped at 500 to stay within API limits)
  const jsearchLimit = Math.min(effectiveLimit, 500);
  
  console.log(`[Job Scraping Limit] Setting value: ${jobScrapingLimitSetting?.value || 'not set'}, Effective limit: ${jsearchLimit}`);

  const results: ScrapeResult[] = [];
  
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
          if (wasInserted) {
            jobsAdded++;
            
            // Auto-match the job against resumes (in background) - only for new jobs
            // Use async/await pattern to ensure errors are properly caught and logged
            import("../matcher/job-matcher").then(async ({ matchAndUpdateJob }) => {
              try {
                const success = await matchAndUpdateJob(savedJob.id, userId);
                if (!success) {
                  console.warn(`[JSearch] Auto-matching failed for job ${savedJob.id} (${savedJob.title}) - may need manual ATS analysis`);
                } else {
                  console.log(`[JSearch] Successfully auto-matched job ${savedJob.id} (${savedJob.title})`);
                }
              } catch (err) {
                console.error(`[JSearch] Error auto-matching job ${savedJob.id} (${savedJob.title}):`, err);
                // Log to activity log for visibility
                const { activityLogger } = await import("../logger");
                await activityLogger.error(
                  `Failed to auto-match job "${savedJob.title}" from JSearch`,
                  { jobId: savedJob.id, error: err instanceof Error ? err.message : String(err) },
                  userId
                );
              }
            });
          }
          // If wasInserted is false, it means it was a duplicate/update, so we skip it
        } catch (error) {
          console.error("Error saving JSearch job:", error);
        }
      }
      
      const { activityLogger } = await import("../logger");
      if (jobsAdded > 0) {
        await activityLogger.info(`JSearch scraper: ${jobsAdded} jobs added`, { source: "JSearch", jobsAdded }, userId);
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

  return results;
}

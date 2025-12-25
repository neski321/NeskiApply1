import { storage } from "../storage";
import { scrapeJSearch } from "./jsearch";
import { scrapeAdzuna } from "./adzuna";
import type { InsertJob } from "@shared/schema";

export type JobSearchProviderPreference = "auto" | "jsearch" | "adzuna";

export interface ScrapeOptions {
  jobTitles: string[];
  countryCodes: string[];
  excludedKeywords?: string[];
  limit?: number;
  postedAtMaxAgeDays?: number;
  jobSearchProviderPreference?: JobSearchProviderPreference; // "auto", "jsearch", or "adzuna"
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
 * JSearch: Limited to 5 jobs per day to manage API credits efficiently
 */
export async function scrapeJobs(options: ScrapeOptions): Promise<ScrapeResult[]> {
  const {
    jobTitles,
    countryCodes,
    excludedKeywords = [],
    limit = 5, // Default limit (applies to JSearch only)
    postedAtMaxAgeDays = 7, // Default to 7 days (maps to "week" for JSearch)
    jobSearchProviderPreference = "auto", // Default to auto (use all providers)
    userId,
  } = options;
  
  // Enforce maximum of 5 jobs per day for JSearch only (to manage API credits)
  const maxJobsPerDayJSearch = 5;
  const jsearchLimit = Math.min(limit, maxJobsPerDayJSearch);

  const results: ScrapeResult[] = [];
  
  // Get API keys and hosts from settings
  const jsearchApiKey = await storage.getSetting("jsearch_api_key", userId);
  const jsearchRapidApiHost = await storage.getSetting("jsearch_rapidapi_host", userId);
  const adzunaAppId = await storage.getSetting("adzuna_app_id", userId);
  const adzunaAppKey = await storage.getSetting("adzuna_app_key", userId);
  
  // Get Adzuna-specific search parameters
  const adzunaMaxDaysOld = await storage.getSetting("adzuna_max_days_old", userId);
  const adzunaSalaryMin = await storage.getSetting("adzuna_salary_min", userId);
  const adzunaSalaryMax = await storage.getSetting("adzuna_salary_max", userId);
  const adzunaFullTime = await storage.getSetting("adzuna_full_time", userId);
  const adzunaPartTime = await storage.getSetting("adzuna_part_time", userId);
  const adzunaContract = await storage.getSetting("adzuna_contract", userId);
  const adzunaPermanent = await storage.getSetting("adzuna_permanent", userId);
  const adzunaDistance = await storage.getSetting("adzuna_distance", userId);
  const adzunaWhatAnd = await storage.getSetting("adzuna_what_and", userId);
  const adzunaWhatPhrase = await storage.getSetting("adzuna_what_phrase", userId);
  const adzunaWhatExclude = await storage.getSetting("adzuna_what_exclude", userId);
  const adzunaTitleOnly = await storage.getSetting("adzuna_title_only", userId);

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
  
  // Log the provider preference for debugging
  console.log(`[Scraper] Job search provider preference: "${jobSearchProviderPreference}"`);
  
  // Scrape from JSearch (ONLY if preference is "auto" or "jsearch", NOT if "adzuna")
  const shouldUseJSearch = (jobSearchProviderPreference === "auto" || jobSearchProviderPreference === "jsearch") 
    && jobSearchProviderPreference !== "adzuna";
  console.log(`[Scraper] Should use JSearch: ${shouldUseJSearch} (preference: "${jobSearchProviderPreference}")`);
  
  if (shouldUseJSearch && jsearchApiKey?.value) {
    try {
      console.log(`Starting JSearch scrape (limited to ${jsearchLimit} jobs per day)...`);
      const jsearchJobs = await scrapeJSearch(
        jobTitles,
        primaryCountryCode,
        jsearchApiKey.value,
        jsearchLimit, // Enforced limit: 5 jobs per day
        datePosted,
        undefined, // workFromHome
        undefined, // employmentTypes
        jsearchRapidApiHost?.value // rapidApiHost
      );
      
      const filteredJobs = jsearchJobs.filter(filterJob);
      let jobsAdded = 0;
      
      for (const job of filteredJobs) {
        try {
          const savedJob = await storage.upsertJobByExternalId(job, userId);
          if (savedJob) {
            jobsAdded++;
            
            // Auto-match the job against resumes (in background)
            import("../matcher/job-matcher").then(({ matchAndUpdateJob }) => {
              matchAndUpdateJob(savedJob.id, userId).catch(err => 
                console.error(`Error auto-matching job ${savedJob.id}:`, err)
              );
            });
          }
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

  // Scrape from Adzuna (ONLY if preference is "auto" or "adzuna", NOT if "jsearch")
  const shouldUseAdzuna = (jobSearchProviderPreference === "auto" || jobSearchProviderPreference === "adzuna") 
    && jobSearchProviderPreference !== "jsearch";
  console.log(`[Scraper] Should use Adzuna: ${shouldUseAdzuna} (preference: "${jobSearchProviderPreference}")`);
  
  if (shouldUseAdzuna && adzunaAppId?.value && adzunaAppKey?.value) {
    try {
      console.log(`Starting Adzuna scrape...`);
      
      // Build Adzuna options from settings
      const adzunaOptions: import("./adzuna").AdzunaScrapeOptions = {};
      
      if (adzunaMaxDaysOld?.value) {
        const maxDays = parseInt(adzunaMaxDaysOld.value);
        if (!isNaN(maxDays)) {
          adzunaOptions.maxDaysOld = maxDays;
        }
      } else {
        // Fallback to postedAtMaxAgeDays if maxDaysOld not set
        adzunaOptions.maxDaysOld = postedAtMaxAgeDays;
      }
      
      if (adzunaSalaryMin?.value) {
        const salaryMin = parseInt(adzunaSalaryMin.value);
        if (!isNaN(salaryMin)) {
          adzunaOptions.salaryMin = salaryMin;
        }
      }
      
      if (adzunaSalaryMax?.value) {
        const salaryMax = parseInt(adzunaSalaryMax.value);
        if (!isNaN(salaryMax)) {
          adzunaOptions.salaryMax = salaryMax;
        }
      }
      
      if (adzunaFullTime?.value === "true") {
        adzunaOptions.fullTime = true;
      }
      
      if (adzunaPartTime?.value === "true") {
        adzunaOptions.partTime = true;
      }
      
      if (adzunaContract?.value === "true") {
        adzunaOptions.contract = true;
      }
      
      if (adzunaPermanent?.value === "true") {
        adzunaOptions.permanent = true;
      }
      
      if (adzunaDistance?.value) {
        const distance = parseInt(adzunaDistance.value);
        if (!isNaN(distance)) {
          adzunaOptions.distance = distance;
        }
      }
      
      if (adzunaWhatAnd?.value) {
        adzunaOptions.whatAnd = adzunaWhatAnd.value;
      }
      
      if (adzunaWhatPhrase?.value) {
        adzunaOptions.whatPhrase = adzunaWhatPhrase.value;
      }
      
      if (adzunaWhatExclude?.value) {
        adzunaOptions.whatExclude = adzunaWhatExclude.value;
      }
      
      if (adzunaTitleOnly?.value) {
        adzunaOptions.titleOnly = adzunaTitleOnly.value;
      }
      
      const adzunaJobs = await scrapeAdzuna(
        jobTitles,
        primaryCountryCode,
        adzunaAppId.value,
        adzunaAppKey.value,
        limit, // Use the provided limit
        undefined, // location (optional)
        adzunaOptions
      );
      
      const filteredJobs = adzunaJobs.filter(filterJob);
      let jobsAdded = 0;
      
      for (const job of filteredJobs) {
        try {
          const savedJob = await storage.upsertJobByExternalId(job, userId);
          if (savedJob) {
            jobsAdded++;
            
            // Auto-match the job against resumes (in background)
            import("../matcher/job-matcher").then(({ matchAndUpdateJob }) => {
              matchAndUpdateJob(savedJob.id, userId).catch(err => 
                console.error(`Error auto-matching job ${savedJob.id}:`, err)
              );
            });
          }
        } catch (error) {
          console.error("Error saving Adzuna job:", error);
        }
      }
      
      const { activityLogger } = await import("../logger");
      if (jobsAdded > 0) {
        await activityLogger.info(`Adzuna scraper: ${jobsAdded} jobs added`, { source: "Adzuna", jobsAdded }, userId);
      }
      
      results.push({
        source: "Adzuna",
        jobsFound: adzunaJobs.length,
        jobsAdded: jobsAdded,
        errors: [],
      });
      
      console.log(`Adzuna scrape complete: ${jobsAdded} jobs added`);
    } catch (error) {
      console.error("Error scraping Adzuna:", error);
      results.push({
        source: "Adzuna",
        jobsFound: 0,
        jobsAdded: 0,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
    }
  } else {
    console.log(`Skipping Adzuna (preference: "${jobSearchProviderPreference}", credentials: ${adzunaAppId?.value && adzunaAppKey?.value ? "provided" : "missing"})`);
  }

  return results;
}

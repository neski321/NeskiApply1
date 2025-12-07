import { storage } from "../storage";
import { scrapeJSearch } from "./jsearch";
import { scrapeLinkedIn, type LinkedInTimePeriod } from "./linkedin";
import type { InsertJob } from "@shared/schema";

export type JobSearchProviderPreference = "auto" | "jsearch" | "linkedin";

export interface ScrapeOptions {
  jobTitles: string[];
  countryCodes: string[];
  excludedKeywords?: string[];
  limit?: number;
  postedAtMaxAgeDays?: number;
  locationFilter?: string; // For LinkedIn: full location names like "United States", "New York"
  linkedInTimePeriod?: LinkedInTimePeriod; // "24h", "7d", or "both"
  jobSearchProviderPreference?: JobSearchProviderPreference; // "auto" (both), "jsearch", or "linkedin"
}

export interface ScrapeResult {
  source: string;
  jobsFound: number;
  jobsAdded: number;
  errors: string[];
}

/**
 * Main job scraper - uses JSearch and ActiveJobsDB APIs (via RapidAPI)
 * JSearch: Limited to 5 jobs per day to manage API credits efficiently
 * ActiveJobsDB: Returns 7 results per search from 24h and 7d endpoints
 */
export async function scrapeJobs(options: ScrapeOptions): Promise<ScrapeResult[]> {
  const {
    jobTitles,
    countryCodes,
    excludedKeywords = [],
    limit = 5, // Default limit (applies to JSearch only)
    postedAtMaxAgeDays = 7, // Default to 7 days (maps to "week" for JSearch)
    locationFilter,
    linkedInTimePeriod = "both", // Default to both 24h and 7d
    jobSearchProviderPreference = "auto", // Default to both providers
  } = options;
  
  // Enforce maximum of 5 jobs per day for JSearch only (to manage API credits)
  const maxJobsPerDayJSearch = 5;
  const jsearchLimit = Math.min(limit, maxJobsPerDayJSearch);
  
  // LinkedIn: 7 results per search (as per API requirements)
  const linkedInLimit = 7;

  const results: ScrapeResult[] = [];
  
  // Get API keys and hosts from settings
  const jsearchApiKey = await storage.getSetting("jsearch_api_key");
  const linkedInApiKey = await storage.getSetting("linkedin_api_key");
  const jsearchRapidApiHost = await storage.getSetting("jsearch_rapidapi_host");
  const linkedInRapidApiHost = await storage.getSetting("linkedin_rapidapi_host");

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
  
  // Scrape from JSearch (ONLY if preference is "auto" or "jsearch", NOT if "linkedin")
  const shouldUseJSearch = (jobSearchProviderPreference === "auto" || jobSearchProviderPreference === "jsearch") && jobSearchProviderPreference !== "linkedin";
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
          const savedJob = await storage.upsertJobByExternalId(job);
          if (savedJob) {
            jobsAdded++;
            
            // Auto-match the job against resumes (in background)
            import("../matcher/job-matcher").then(({ matchAndUpdateJob }) => {
              matchAndUpdateJob(savedJob.id).catch(err => 
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
        await activityLogger.info(`JSearch scraper: ${jobsAdded} jobs added`, { source: "JSearch", jobsAdded });
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

  // Scrape from LinkedIn (ONLY if preference is "auto" or "linkedin", NOT if "jsearch")
  // TEMPORARILY DISABLED: ActiveJobsDB API is not working
  const activeJobsDBEnabled = false; // Set to true when ActiveJobsDB is fixed
  const shouldUseLinkedIn = activeJobsDBEnabled && (jobSearchProviderPreference === "auto" || jobSearchProviderPreference === "linkedin") && jobSearchProviderPreference !== "jsearch";
  console.log(`[Scraper] Should use LinkedIn (ActiveJobsDB): ${shouldUseLinkedIn} (preference: "${jobSearchProviderPreference}", enabled: ${activeJobsDBEnabled})`);
  
  if (shouldUseLinkedIn && linkedInApiKey?.value) {
    try {
      console.log(`Starting ActiveJobsDB scrape (${linkedInTimePeriod})...`);
      
      // Convert country codes to location names for LinkedIn
      // LinkedIn prefers full names like "United States" instead of "US"
      const countryCodeToName: Record<string, string> = {
        "US": "United States",
        "CA": "Canada",
        "GB": "United Kingdom",
        "AU": "Australia",
        "DE": "Germany",
        "FR": "France",
        "ES": "Spain",
        "IT": "Italy",
        "NL": "Netherlands",
        "BE": "Belgium",
        "CH": "Switzerland",
        "SE": "Sweden",
        "NO": "Norway",
        "DK": "Denmark",
        "FI": "Finland",
        "PL": "Poland",
        "PT": "Portugal",
        "IE": "Ireland",
        "AT": "Austria",
        "JP": "Japan",
        "KR": "South Korea",
        "SG": "Singapore",
        "IN": "India",
        "CN": "China",
        "BR": "Brazil",
        "MX": "Mexico",
        "AR": "Argentina",
        "CL": "Chile",
        "ZA": "South Africa",
        "NZ": "New Zealand",
      };
      
      // Use provided locationFilter or convert country codes
      const linkedInLocation = locationFilter || 
        (countryCodes.length > 0 
          ? countryCodeToName[countryCodes[0].toUpperCase()] || countryCodes[0]
          : undefined);
      
      const linkedInJobs = await scrapeLinkedIn(
        jobTitles,
        linkedInLocation,
        linkedInApiKey.value,
        linkedInLimit, // No hard limit for LinkedIn
        linkedInTimePeriod,
        undefined, // titleFilter
        undefined, // descriptionFilter
        undefined, // typeFilter
        undefined, // remote
        undefined, // seniorityFilter
        undefined, // industryFilter
        linkedInRapidApiHost?.value // rapidApiHost
      );
      
      const filteredJobs = linkedInJobs.filter(filterJob);
      let jobsAdded = 0;
      
      for (const job of filteredJobs) {
        try {
          const savedJob = await storage.upsertJobByExternalId(job);
          if (savedJob) {
            jobsAdded++;
            
            // Auto-match the job against resumes (in background)
            import("../matcher/job-matcher").then(({ matchAndUpdateJob }) => {
              matchAndUpdateJob(savedJob.id).catch(err => 
                console.error(`Error auto-matching job ${savedJob.id}:`, err)
              );
            });
          }
        } catch (error) {
          console.error("Error saving LinkedIn job:", error);
        }
      }
      
      const { activityLogger } = await import("../logger");
      if (jobsAdded > 0) {
        await activityLogger.info(`ActiveJobsDB scraper: ${jobsAdded} jobs added`, { 
          source: "ActiveJobsDB", 
          timePeriod: linkedInTimePeriod,
          jobsAdded 
        });
      }
      
      results.push({
        source: "ActiveJobsDB",
        jobsFound: linkedInJobs.length,
        jobsAdded: jobsAdded,
        errors: [],
      });
    } catch (error) {
      results.push({
        source: "ActiveJobsDB",
        jobsFound: 0,
        jobsAdded: 0,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
    }
  }

  return results;
}


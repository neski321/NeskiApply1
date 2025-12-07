import { fetchWithRetry, parseSalary, extractTags } from "./utils";
import type { InsertJob } from "@shared/schema";

/**
 * TheirStack API Job Response Structure
 */
interface TheirStackJobResponse {
  id: number;
  job_title: string;
  description: string | null;
  url: string | null;
  final_url: string | null;
  date_posted: string; // ISO date format: "2021-01-01"
  company_object?: {
    name: string;
    domain?: string | null;
  };
  company?: string; // Deprecated but may still be present
  locations?: Array<{
    country_code: string;
    name: string;
    state_code?: string | null;
  }>;
  salary_string?: string | null;
  discovered_at?: string;
}

interface TheirStackSearchResponse {
  metadata: {
    total_results?: number | null;
  };
  data: TheirStackJobResponse[];
}

/**
 * Scrape jobs from TheirStack API
 * API Documentation: https://api.theirstack.com/
 * 
 * Endpoint: POST /v1/jobs/search
 * Authentication: Bearer token in Authorization header
 * 
 * Required: At least one of:
 * - posted_at_max_age_days
 * - posted_at_gte / posted_at_lte
 * - company_domain_or
 * - company_name_or
 */
export async function scrapeTheirStack(
  jobTitles: string[],
  countryCodes: string[],
  apiKey?: string,
  limit: number = 5,
  postedAtMaxAgeDays: number = 7
): Promise<InsertJob[]> {
  const jobs: InsertJob[] = [];
  
  if (!apiKey) {
    console.log("TheirStack API key not provided, skipping TheirStack scraper");
    return jobs;
  }

  try {
    // Normalize country codes (uppercase, remove duplicates)
    const normalizedCountryCodes = countryCodes
      .map(code => code.trim().toUpperCase())
      .filter(code => code.length === 2)
      .filter((code, index, arr) => arr.indexOf(code) === index); // Remove duplicates
    
    // If no valid country codes found, default to CA (Canada)
    if (normalizedCountryCodes.length === 0) {
      normalizedCountryCodes.push("CA");
      console.log("No valid country codes provided, defaulting to CA");
    }
    
    // Build request body according to API documentation
    const requestBody = {
      page: 0,
      limit: Math.min(limit, 25), // API max is 500, but we limit to 25 for credit management
      job_title_or: jobTitles.length > 0 ? jobTitles : ["Software Developer"],
      job_country_code_or: normalizedCountryCodes,
      posted_at_max_age_days: postedAtMaxAgeDays, // Required filter: jobs posted in last N days
      include_total_results: false, // Faster response
    };
    
    const url = "https://api.theirstack.com/v1/jobs/search";
    
    console.log(`Calling TheirStack API: ${jobTitles.length} titles, ${normalizedCountryCodes.length} countries (${normalizedCountryCodes.join(", ")}), limit: ${requestBody.limit}, max_age_days: ${postedAtMaxAgeDays}`);
    
    try {
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        data: requestBody, // axios uses 'data' for POST body
      }) as TheirStackSearchResponse;
      
      // Handle response structure: { metadata: {...}, data: [...] }
      const jobList = response?.data || [];
      
      if (Array.isArray(jobList)) {
        for (const job of jobList.slice(0, limit)) {
          if (jobs.length >= limit) break;
          
          // Extract company name (prefer company_object.name, fallback to deprecated company field)
          const companyName = job.company_object?.name || job.company || "Unknown";
          
          // Extract location (use first location from locations array, or fallback)
          let jobLocation = "Unknown";
          if (job.locations && job.locations.length > 0) {
            const loc = job.locations[0];
            const parts: string[] = [];
            if (loc.name) parts.push(loc.name);
            if (loc.state_code) parts.push(loc.state_code);
            if (loc.country_code) parts.push(loc.country_code);
            jobLocation = parts.join(", ") || "Unknown";
          }
          
          // Extract description (API returns markdown format)
          // Keep markdown as-is since it's already readable text
          const description = job.description || "";
          
          // Extract tags from description
          const tags = extractTags(description || job.job_title || "");
          
          // Use final_url if available, otherwise url
          const jobUrl = job.final_url || job.url || "";
          
          // Format posted date
          let postedDate = new Date().toLocaleDateString();
          if (job.date_posted) {
            try {
              const date = new Date(job.date_posted);
              if (!isNaN(date.getTime())) {
                postedDate = date.toLocaleDateString();
              }
            } catch (e) {
              // Keep default
            }
          }
          
          jobs.push({
            externalId: `theirstack_${job.id}`,
            title: job.job_title || "Untitled Job",
            company: companyName,
            location: jobLocation,
            salary: job.salary_string || undefined,
            description: description || job.job_title || "",
            requirements: [],
            postedDate: postedDate,
            source: "TheirStack",
            url: jobUrl,
            status: "pending",
            tags: tags.length > 0 ? tags : undefined,
          });
        }
      }
      
      console.log(`TheirStack API returned ${jobList.length} jobs, processed ${jobs.length}`);
    } catch (error) {
      console.error(`Error scraping TheirStack:`, error);
      throw error;
    }
  } catch (error) {
    console.error("Error in TheirStack scraper:", error);
  }

  return jobs.slice(0, limit); // Ensure we never exceed the limit
}

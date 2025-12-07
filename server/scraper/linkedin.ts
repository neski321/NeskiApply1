import { parseSalary, extractTags } from "./utils";
import type { InsertJob } from "@shared/schema";

/**
 * ActiveJobsDB API Response Structure
 * Based on RapidAPI ActiveJobsDB endpoints
 */
interface LinkedInJob {
  job_id?: string;
  job_title?: string;
  company_name?: string;
  company_url?: string;
  location?: string;
  job_description?: string;
  job_url?: string;
  posted_at?: string;
  posted_at_timestamp?: number;
  salary_raw?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;
  job_type?: string;
  remote?: boolean;
  employment_type?: string;
  seniority_level?: string;
  industry?: string;
  company_size?: string;
  company_description?: string;
  required_skills?: string[];
  required_experience?: string;
  required_education?: string;
}

interface LinkedInResponse {
  data?: LinkedInJob[];
  results?: LinkedInJob[];
  jobs?: LinkedInJob[];
  total_results?: number;
  total?: number;
  count?: number;
  [key: string]: any;
}

// Note: Interface names kept as "LinkedIn" for backward compatibility
// but the scraper now uses ActiveJobsDB API

export type LinkedInTimePeriod = "24h" | "7d" | "both";

/**
 * Scrape jobs from ActiveJobsDB API (via RapidAPI)
 * Supports both 24-hour and 7-day endpoints
 * 
 * Endpoints:
 * - GET https://active-jobs-db.p.rapidapi.com/active-ats-24h
 * - GET https://active-jobs-db.p.rapidapi.com/active-ats-7d
 * 
 * Authentication: X-RapidAPI-Key and X-RapidAPI-Host headers
 * 
 * API Documentation: https://rapidapi.com/fantastic-jobs-fantastic-jobs-default/api/active-jobs-db
 */
export async function scrapeLinkedIn(
  jobTitles: string[],
  locationFilter?: string,
  apiKey?: string,
  limit: number = 7,
  timePeriod: LinkedInTimePeriod = "both",
  titleFilter?: string,
  descriptionFilter?: string,
  typeFilter?: string,
  remote?: boolean,
  seniorityFilter?: string,
  industryFilter?: string,
  rapidApiHost?: string
): Promise<InsertJob[]> {
  const jobs: InsertJob[] = [];
  
  if (!apiKey) {
    console.log("ActiveJobsDB API key not provided, skipping ActiveJobsDB scraper");
    return jobs;
  }

  // Use provided host or default to the correct API host
  const host = rapidApiHost || "active-jobs-db.p.rapidapi.com";
  
  // Build common query parameters
  // Matching the working example: title_filter should NOT be quoted
  // Example: title_filter=IT%20* (not "IT *")
  const buildParams = (title: string) => {
    const params = new URLSearchParams();
    
    // Limit: API minimum is 10, but user wants 7 results per search
    // We'll request 10 (API minimum) and slice to 7 later
    const apiLimit = Math.min(Math.max(limit, 10), 100); // API requires 10-100
    params.append("limit", apiLimit.toString());
    params.append("offset", "0");
    
    // Title filter: DO NOT quote - match working example format
    // Working example: title_filter=IT%20* (unquoted, URL encoded)
    // URLSearchParams will automatically encode spaces and special chars
    params.append("title_filter", title);
    
    // Location filter: Use provided locationFilter (unquoted, as in working example)
    if (locationFilter) {
      params.append("location_filter", locationFilter);
    }
    
    // Description filter (use with caution on 7d endpoint - can cause timeouts)
    if (descriptionFilter) {
      params.append("description_filter", descriptionFilter);
    }
    
    // Type filter (employment type) - comma delimited, no spaces
    if (typeFilter) {
      params.append("type_filter", typeFilter);
    }
    
    // Remote filter (boolean as string)
    if (remote !== undefined) {
      params.append("remote", remote ? "true" : "false");
    }
    
    // Seniority filter - comma delimited, no spaces
    if (seniorityFilter) {
      params.append("seniority_filter", seniorityFilter);
    }
    
    // Industry filter - comma delimited, no spaces
    if (industryFilter) {
      params.append("industry_filter", industryFilter);
    }
    
    // Include full description (required for job descriptions)
    params.append("description_type", "text");
    
    return params;
  };

  try {
    // Scrape from 24h endpoint if requested
    if (timePeriod === "24h" || timePeriod === "both") {
      try {
        console.log(`Scraping LinkedIn 24h jobs (limit: ${limit} per search)...`);
        
        for (const title of jobTitles) {
          const params = buildParams(title);
          // API minimum is 10, but we'll slice to 7 results per search
          params.set("limit", "10"); // Use API minimum
          
          const url = `https://${host}/active-ats-24h?${params.toString()}`;
          
          console.log(`[ActiveJobsDB 24h] Fetching: ${url}`);
          console.log(`[ActiveJobsDB 24h] Headers:`, { "x-rapidapi-key": apiKey ? `${apiKey.substring(0, 10)}...` : "missing", "x-rapidapi-host": host });
          
          // Use native fetch to match the working example exactly
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "x-rapidapi-key": apiKey,
              "x-rapidapi-host": host,
            },
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ActiveJobsDB 24h] HTTP error! status: ${response.status}`, errorText);
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText.substring(0, 200)}`);
          }
          
          const result = await response.text();
          console.log(`[ActiveJobsDB 24h] Raw response length: ${result.length} chars`);
          console.log(`[ActiveJobsDB 24h] Raw response preview (first 1000 chars):`, result.substring(0, 1000));
          
          let parsedResponse: LinkedInResponse;
          try {
            parsedResponse = JSON.parse(result) as LinkedInResponse;
            console.log(`[ActiveJobsDB 24h] Parsed response keys:`, Object.keys(parsedResponse));
            console.log(`[ActiveJobsDB 24h] Full parsed response structure:`, JSON.stringify(parsedResponse, null, 2).substring(0, 2000));
          } catch (parseError) {
            console.error(`[ActiveJobsDB 24h] JSON parse error:`, parseError);
            console.error(`[ActiveJobsDB 24h] Response preview:`, result.substring(0, 500));
            throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
          }
          
          // Check multiple possible response structures
          const jobList = parsedResponse?.data || parsedResponse?.results || parsedResponse?.jobs || (Array.isArray(parsedResponse) ? parsedResponse : []);
          console.log(`[ActiveJobsDB 24h] Parsed response - data array length: ${jobList.length}, total_results: ${parsedResponse?.total_results || "N/A"}`);
          console.log(`[ActiveJobsDB 24h] Response structure check - data: ${parsedResponse?.data?.length || 0}, results: ${parsedResponse?.results?.length || 0}, jobs: ${parsedResponse?.jobs?.length || 0}, isArray: ${Array.isArray(parsedResponse)}`);
          
          if (Array.isArray(jobList)) {
            console.log(`[ActiveJobsDB 24h] Received ${jobList.length} jobs for "${title}"`);
            // Return 7 results per search (API minimum is 10, so we slice to 7)
            const jobsToAdd = jobList.slice(0, limit);
            for (const job of jobsToAdd) {
              const processedJob = processLinkedInJob(job, "ActiveJobsDB-24h");
              if (processedJob) {
                jobs.push(processedJob);
              }
            }
          }
        }
        
        console.log(`ActiveJobsDB 24h: Found ${jobs.length} total jobs`);
      } catch (error) {
        console.error("Error scraping ActiveJobsDB 24h:", error);
      }
    }
    
    // Scrape from 7d endpoint if requested
    if (timePeriod === "7d" || timePeriod === "both") {
      try {
        console.log(`Scraping ActiveJobsDB 7d jobs (limit: ${limit} per search)...`);
        
        for (const title of jobTitles) {
          const params = buildParams(title);
          // API minimum is 10, but we'll slice to 7 results per search
          params.set("limit", "10"); // Use API minimum
          
          const url = `https://${host}/active-ats-7d?${params.toString()}`;
          
          console.log(`[ActiveJobsDB 7d] Fetching: ${url}`);
          console.log(`[ActiveJobsDB 7d] Headers:`, { "x-rapidapi-key": apiKey ? `${apiKey.substring(0, 10)}...` : "missing", "x-rapidapi-host": host });
          
          // Use native fetch to match the working example exactly
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "x-rapidapi-key": apiKey,
              "x-rapidapi-host": host,
            },
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ActiveJobsDB 7d] HTTP error! status: ${response.status}`, errorText);
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText.substring(0, 200)}`);
          }
          
          const result = await response.text();
          console.log(`[ActiveJobsDB 7d] Raw response length: ${result.length} chars`);
          console.log(`[ActiveJobsDB 7d] Raw response preview (first 1000 chars):`, result.substring(0, 1000));
          
          let parsedResponse: LinkedInResponse;
          try {
            parsedResponse = JSON.parse(result) as LinkedInResponse;
            console.log(`[ActiveJobsDB 7d] Parsed response keys:`, Object.keys(parsedResponse));
            console.log(`[ActiveJobsDB 7d] Full parsed response structure:`, JSON.stringify(parsedResponse, null, 2).substring(0, 2000));
          } catch (parseError) {
            console.error(`[ActiveJobsDB 7d] JSON parse error:`, parseError);
            console.error(`[ActiveJobsDB 7d] Response preview:`, result.substring(0, 500));
            throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
          }
          
          // Check multiple possible response structures
          const jobList = parsedResponse?.data || parsedResponse?.results || parsedResponse?.jobs || (Array.isArray(parsedResponse) ? parsedResponse : []);
          console.log(`[ActiveJobsDB 7d] Parsed response - data array length: ${jobList.length}, total_results: ${parsedResponse?.total_results || "N/A"}`);
          console.log(`[ActiveJobsDB 7d] Response structure check - data: ${parsedResponse?.data?.length || 0}, results: ${parsedResponse?.results?.length || 0}, jobs: ${parsedResponse?.jobs?.length || 0}, isArray: ${Array.isArray(parsedResponse)}`);
          
          if (Array.isArray(jobList)) {
            console.log(`[ActiveJobsDB 7d] Received ${jobList.length} jobs for "${title}"`);
            // Return 7 results per search (API minimum is 10, so we slice to 7)
            const jobsToAdd = jobList.slice(0, limit);
            for (const job of jobsToAdd) {
              const processedJob = processLinkedInJob(job, "ActiveJobsDB-7d");
              if (processedJob) {
                jobs.push(processedJob);
              }
            }
          }
        }
        
        console.log(`ActiveJobsDB 7d: Found ${jobs.length} total jobs`);
      } catch (error) {
        console.error("Error scraping ActiveJobsDB 7d:", error);
      }
    }
  } catch (error) {
    console.error("Error in ActiveJobsDB scraper:", error);
  }

  // Return all jobs (limit is applied per search, but we collect all results)
  return jobs;
}

/**
 * Process an ActiveJobsDB job response into InsertJob format
 */
function processLinkedInJob(job: LinkedInJob, source: string): InsertJob | null {
  if (!job.job_title || !job.company_name) {
    return null;
  }
  
  // Extract location
  const location = job.location || "Unknown";
  
  // Extract description
  const description = job.job_description || "";
  
  // Extract tags
  const tags = extractTags(description);
  if (job.required_skills && Array.isArray(job.required_skills)) {
    job.required_skills.forEach(skill => {
      if (!tags.includes(skill)) {
        tags.push(skill);
      }
    });
  }
  
  // Extract URL
  const jobUrl = job.job_url || "";
  
  // Format salary
  let salary: string | undefined = undefined;
  if (job.salary_min && job.salary_max && job.salary_currency) {
    const currency = job.salary_currency;
    const period = job.salary_period || "year";
    salary = `${currency} ${job.salary_min} - ${currency} ${job.salary_max} per ${period}`;
  } else if (job.salary_raw) {
    salary = job.salary_raw;
  } else if (description) {
    salary = parseSalary(description) || undefined;
  }
  
  // Format posted date
  let postedDate = new Date().toLocaleDateString();
  if (job.posted_at) {
    try {
      const date = new Date(job.posted_at);
      if (!isNaN(date.getTime())) {
        postedDate = date.toLocaleDateString();
      }
    } catch (e) {
      // Keep default
    }
  } else if (job.posted_at_timestamp) {
    try {
      const date = new Date(job.posted_at_timestamp * 1000);
      if (!isNaN(date.getTime())) {
        postedDate = date.toLocaleDateString();
      }
    } catch (e) {
      // Keep default
    }
  }
  
  // Generate external ID
  const externalId = job.job_id 
    ? `activejobsdb_${job.job_id}` 
    : `activejobsdb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    externalId,
    title: job.job_title,
    company: job.company_name,
    location: location,
    salary: salary,
    description: description || job.job_title || "",
    requirements: [],
    postedDate: postedDate,
    source: source, // "ActiveJobsDB-24h" or "ActiveJobsDB-7d"
    url: jobUrl,
    status: "pending",
    tags: tags.length > 0 ? tags : undefined,
  };
}


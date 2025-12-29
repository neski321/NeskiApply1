import { fetchWithRetry, parseSalary, extractTags } from "./utils";
import type { InsertJob } from "@shared/schema";

/**
 * JSearch API Job Response Structure
 * Based on RapidAPI JSearch endpoint
 */
interface JSearchJobResponse {
  employer_name?: string;
  employer_logo?: string | null;
  employer_website?: string | null;
  job_publisher?: string;
  job_id?: string;
  job_employment_type?: string;
  job_title?: string;
  job_apply_link?: string;
  job_apply_is_direct?: boolean;
  job_description?: string;
  job_is_remote?: boolean;
  job_posted_at_datetime_utc?: string;
  job_posted_at_timestamp?: number;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_latitude?: number;
  job_longitude?: number;
  job_benefits?: string[] | null;
  job_google_link?: string;
  job_offer_expiration_datetime_utc?: string | null;
  job_offer_expiration_timestamp?: number | null;
  job_required_experience?: {
    no_experience_required?: boolean;
    required_experience_in_months?: number | null;
    experience_mentioned?: boolean;
    experience_preferred?: boolean;
  } | null;
  job_required_skills?: string[] | null;
  job_required_education?: {
    postgraduate_degree?: boolean;
    professional_certification?: boolean;
    high_school?: boolean;
    associates_degree?: boolean;
    bachelors_degree?: boolean;
    degree_mentioned?: boolean;
    degree_preferred?: boolean;
    professional_certification_mentioned?: boolean;
  } | null;
  job_experience_in_place_of_education?: boolean;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
    Benefits?: string[];
  } | null;
  job_job_title?: string | null;
  job_posting_language?: string;
}

interface JSearchSearchResponse {
  status: string;
  request_id?: string;
  parameters: {
    query: string;
    page: number;
    num_pages: number;
    date_posted?: string;
    remote_jobs_only?: boolean;
    employment_types?: string;
    job_requirements?: string;
    [key: string]: any;
  };
  data: JSearchJobResponse[];
}

/**
 * Scrape jobs from JSearch API (via RapidAPI)
 * API Documentation: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 * 
 * Endpoint: GET https://jsearch.p.rapidapi.com/search
 * Authentication: X-RapidAPI-Key and X-RapidAPI-Host headers
 */
export interface JSearchScrapeOptions {
  limit?: number;
  datePosted?: string;
  workFromHome?: boolean;
  employmentTypes?: string;
  language?: string;
  jobRequirements?: string;
  radius?: number;
  excludeJobPublishers?: string;
  page?: number;
  numPages?: number;
}

export async function scrapeJSearch(
  jobTitles: string[],
  countryCode: string,
  apiKey?: string,
  options?: JSearchScrapeOptions,
  rapidApiHost?: string
): Promise<InsertJob[]> {
  const {
    limit = 5,
    datePosted = "week",
    workFromHome,
    employmentTypes,
    language,
    jobRequirements,
    radius,
    excludeJobPublishers,
    page = 1,
    numPages,
  } = options || {};
  const jobs: InsertJob[] = [];
  
  if (!apiKey) {
    console.log("JSearch API key not provided, skipping JSearch scraper");
    return jobs;
  }

  // Use provided host or default
  const host = rapidApiHost || "jsearch.p.rapidapi.com";

  try {
    // Normalize country code (uppercase, validate 2-letter format)
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    if (normalizedCountryCode.length !== 2) {
      console.log(`Invalid country code: ${countryCode}, defaulting to US`);
      countryCode = "US";
    }
    
    // Build query string from job titles and country
    // JSearch expects a free-form query like "software developer jobs in canada"
    const queryParts: string[] = [];
    
    // Add job titles to query
    if (jobTitles.length > 0) {
      queryParts.push(jobTitles.join(" or "));
    } else {
      queryParts.push("software developer");
    }
    
    // Add location context (country name from code)
    const countryNames: Record<string, string> = {
      "CA": "canada",
      "US": "united states",
      "GB": "united kingdom",
      "AU": "australia",
      "DE": "germany",
      "FR": "france",
      "ES": "spain",
      "IT": "italy",
      "NL": "netherlands",
      "BE": "belgium",
      "CH": "switzerland",
      "SE": "sweden",
      "NO": "norway",
      "DK": "denmark",
      "FI": "finland",
      "PL": "poland",
      "PT": "portugal",
      "IE": "ireland",
      "AT": "austria",
      "JP": "japan",
      "KR": "south korea",
      "SG": "singapore",
      "IN": "india",
      "CN": "china",
      "BR": "brazil",
      "MX": "mexico",
      "AR": "argentina",
      "CL": "chile",
      "ZA": "south africa",
      "NZ": "new zealand",
    };
    
    const countryName = countryNames[normalizedCountryCode] || normalizedCountryCode.toLowerCase();
    queryParts.push(`in ${countryName}`);
    
    const query = queryParts.join(" ");
    
    // Calculate number of pages needed (10 results per page) if not specified
    const actualNumPages = numPages || Math.ceil(limit / 10);
    const finalNumPages = Math.min(actualNumPages, 50); // Limit to 50 pages max (500 jobs)
    
    // Build query parameters
    const params = new URLSearchParams({
      query: query,
      page: page.toString(),
      num_pages: finalNumPages.toString(),
      country: normalizedCountryCode,
      date_posted: datePosted, // all, today, 3days, week, month
    });
    
    // Add optional parameters
    if (language) {
      params.append("language", language);
    }
    
    if (workFromHome !== undefined) {
      params.append("work_from_home", workFromHome ? "true" : "false");
    }
    
    if (employmentTypes) {
      params.append("employment_types", employmentTypes);
    }
    
    if (jobRequirements) {
      params.append("job_requirements", jobRequirements);
    }
    
    if (radius !== undefined) {
      params.append("radius", radius.toString());
    }
    
    if (excludeJobPublishers) {
      params.append("exclude_job_publishers", excludeJobPublishers);
    }
    
    const url = `https://${host}/search?${params.toString()}`;
    
    console.log(`Calling JSearch API: query="${query}", country=${normalizedCountryCode}, limit=${limit}, date_posted=${datePosted}, host=${host}`);
    
    try {
      const response = await fetchWithRetry(url, {
        method: "GET",
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": host,
        },
      }) as JSearchSearchResponse;
      
      // Handle response structure: { status, parameters, data: [...] }
      const jobList = response?.data || [];
      
      if (Array.isArray(jobList)) {
        for (const job of jobList) {
          if (jobs.length >= limit) break;
          
          // Extract company name
          const companyName = job.employer_name || "Unknown";
          
          // Extract location
          const locationParts: string[] = [];
          if (job.job_city) locationParts.push(job.job_city);
          if (job.job_state) locationParts.push(job.job_state);
          if (job.job_country) locationParts.push(job.job_country);
          const jobLocation = locationParts.length > 0 
            ? locationParts.join(", ") 
            : (job.job_is_remote ? "Remote" : "Unknown");
          
          // Extract description
          const description = job.job_description || "";
          
          // Extract tags from description and required skills
          const tags = extractTags(description || job.job_title || "");
          if (job.job_required_skills && Array.isArray(job.job_required_skills)) {
            job.job_required_skills.forEach(skill => {
              if (!tags.includes(skill)) {
                tags.push(skill);
              }
            });
          }
          
          // Extract URL (prefer apply link, fallback to Google link)
          const jobUrl = job.job_apply_link || job.job_google_link || "";
          
          // Format salary
          let salary: string | undefined = undefined;
          if (job.job_min_salary && job.job_max_salary && job.job_salary_currency) {
            const currency = job.job_salary_currency;
            const period = job.job_salary_period || "year";
            salary = `${currency} ${job.job_min_salary} - ${currency} ${job.job_max_salary} per ${period}`;
          } else if (job.job_min_salary && job.job_salary_currency) {
            const currency = job.job_salary_currency;
            const period = job.job_salary_period || "year";
            salary = `${currency} ${job.job_min_salary}+ per ${period}`;
          }
          
          // Format posted date
          let postedDate = new Date().toLocaleDateString();
          if (job.job_posted_at_datetime_utc) {
            try {
              const date = new Date(job.job_posted_at_datetime_utc);
              if (!isNaN(date.getTime())) {
                postedDate = date.toLocaleDateString();
              }
            } catch (e) {
              // Keep default
            }
          } else if (job.job_posted_at_timestamp) {
            try {
              const date = new Date(job.job_posted_at_timestamp * 1000);
              if (!isNaN(date.getTime())) {
                postedDate = date.toLocaleDateString();
              }
            } catch (e) {
              // Keep default
            }
          }
          
          jobs.push({
            externalId: job.job_id ? `jsearch_${job.job_id}` : `jsearch_${Date.now()}_${jobs.length}`,
            title: job.job_title || "Untitled Job",
            company: companyName,
            location: jobLocation,
            salary: salary,
            description: description || job.job_title || "",
            requirements: [],
            postedDate: postedDate,
            source: job.job_publisher || "JSearch",
            url: jobUrl,
            status: "pending",
            tags: tags.length > 0 ? tags : undefined,
          });
        }
      }
      
      console.log(`JSearch API returned ${jobList.length} jobs, processed ${jobs.length}`);
    } catch (error) {
      console.error(`Error scraping JSearch:`, error);
      throw error;
    }
  } catch (error) {
    console.error("Error in JSearch scraper:", error);
  }

  return jobs.slice(0, limit); // Ensure we never exceed the limit
}


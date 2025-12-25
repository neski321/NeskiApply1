import { parseSalary, extractTags } from "./utils";
import type { InsertJob } from "@shared/schema";

/**
 * Adzuna API Job Response Structure
 * Based on Adzuna API documentation: https://developer.adzuna.com/
 */
interface AdzunaJob {
  id?: string;
  title?: string;
  company?: {
    display_name?: string;
  };
  location?: {
    display_name?: string;
    area?: string[];
  };
  description?: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  created?: string;
  redirect_url?: string;
  category?: {
    label?: string;
    tag?: string;
  };
  contract_type?: string;
  contract_time?: string;
}

interface AdzunaResponse {
  __CLASS__?: string; // Metadata field, can be ignored
  count?: number;
  mean?: number;
  results: AdzunaJob[];
}

/**
 * Scrape jobs from Adzuna API
 * API Documentation: https://developer.adzuna.com/
 * 
 * Endpoint: GET https://api.adzuna.com/v1/api/jobs/{country_code}/search/{page_number}
 * Authentication: app_id and app_key as query parameters
 * 
 * Country codes: lowercase 2-letter codes (e.g., "us", "gb", "ca", "au")
 */
export interface AdzunaScrapeOptions {
  maxDaysOld?: number; // Filter by job age in days
  salaryMin?: number; // Minimum salary
  salaryMax?: number; // Maximum salary
  fullTime?: boolean; // Only full-time jobs
  partTime?: boolean; // Only part-time jobs
  contract?: boolean; // Only contract jobs
  permanent?: boolean; // Only permanent jobs
  distance?: number; // Distance in km from location (default: 5km)
  whatAnd?: string; // Keywords that must all be found
  whatPhrase?: string; // Entire phrase that must be found
  whatExclude?: string; // Keywords to exclude
  titleOnly?: string; // Keywords to search only in title
}

export async function scrapeAdzuna(
  jobTitles: string[],
  countryCode: string,
  appId?: string,
  appKey?: string,
  limit: number = 20,
  location?: string,
  options?: AdzunaScrapeOptions
): Promise<InsertJob[]> {
  const jobs: InsertJob[] = [];
  
  if (!appId || !appKey) {
    console.log("Adzuna API credentials not provided, skipping Adzuna scraper");
    return jobs;
  }

  try {
    // Adzuna uses lowercase country codes
    const normalizedCountryCode = countryCode.trim().toLowerCase();
    
    // Build search query from job titles
    const searchQuery = jobTitles.length > 0 
      ? jobTitles.join(" OR ")
      : "software developer";

    // Calculate number of pages needed (50 results per page max)
    const resultsPerPage = Math.min(limit, 50);
    const numPages = Math.ceil(limit / resultsPerPage);
    const actualNumPages = Math.min(numPages, 10); // Limit to 10 pages max (500 jobs)

    console.log(`Calling Adzuna API: query="${searchQuery}", country=${normalizedCountryCode}, limit=${limit}`);

    for (let page = 1; page <= actualNumPages; page++) {
      if (jobs.length >= limit) break;

      try {
        // Build URL with query parameters
        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          results_per_page: resultsPerPage.toString(),
          sort_by: "date", // Sort by date (newest first)
        });

        // Add search query - prefer what_or for multiple job titles (any match)
        // If only one title, use what for simple search
        if (jobTitles.length > 1) {
          params.append("what_or", searchQuery);
        } else {
          params.append("what", searchQuery);
        }

        // Add location if provided
        if (location) {
          params.append("where", location);
          // Add distance if specified (default is 5km per API docs)
          if (options?.distance !== undefined) {
            params.append("distance", options.distance.toString());
          }
        }

        // Add optional search parameters
        if (options?.whatAnd) {
          params.append("what_and", options.whatAnd);
        }
        if (options?.whatPhrase) {
          params.append("what_phrase", options.whatPhrase);
        }
        if (options?.whatExclude) {
          params.append("what_exclude", options.whatExclude);
        }
        if (options?.titleOnly) {
          params.append("title_only", options.titleOnly);
        }

        // Add job age filter
        if (options?.maxDaysOld !== undefined) {
          params.append("max_days_old", options.maxDaysOld.toString());
        }

        // Add salary filters
        if (options?.salaryMin !== undefined) {
          params.append("salary_min", options.salaryMin.toString());
        }
        if (options?.salaryMax !== undefined) {
          params.append("salary_max", options.salaryMax.toString());
        }

        // Add job type filters
        if (options?.fullTime) {
          params.append("full_time", "1");
        }
        if (options?.partTime) {
          params.append("part_time", "1");
        }
        if (options?.contract) {
          params.append("contract", "1");
        }
        if (options?.permanent) {
          params.append("permanent", "1");
        }

        const url = `https://api.adzuna.com/v1/api/jobs/${normalizedCountryCode}/search/${page}?${params.toString()}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Adzuna API error (${response.status}):`, errorText);
          if (page === 1) {
            throw new Error(`Adzuna API returned ${response.status}: ${errorText.substring(0, 200)}`);
          }
          // If it's not the first page, just break and return what we have
          break;
        }

        const data = await response.json() as AdzunaResponse;
        
        // Handle response structure: { __CLASS__, results: [...], count, mean }
        // The __CLASS__ fields are metadata and can be ignored
        const jobList = data?.results || [];
        
        if (Array.isArray(jobList)) {
          for (const job of jobList) {
            if (jobs.length >= limit) break;
            
            // Extract company name
            const companyName = job.company?.display_name || "Unknown";
            
            // Extract location
            const locationParts: string[] = [];
            if (job.location?.display_name) {
              locationParts.push(job.location.display_name);
            } else if (job.location?.area && Array.isArray(job.location.area)) {
              locationParts.push(...job.location.area);
            }
            const jobLocation = locationParts.length > 0 
              ? locationParts.join(", ") 
              : "Unknown";
            
            // Extract description
            const description = job.description || "";
            
            // Extract tags from description and title
            const tags = extractTags(`${job.title || ""} ${description}`);
            
            // Format salary
            let salary: string | undefined = undefined;
            if (job.salary_min && job.salary_max) {
              // Adzuna doesn't specify currency in the job object, but it's usually based on country
              const currency = getCurrencyForCountry(normalizedCountryCode);
              salary = `${currency} ${job.salary_min.toLocaleString()} - ${currency} ${job.salary_max.toLocaleString()}`;
            } else if (job.salary_min) {
              const currency = getCurrencyForCountry(normalizedCountryCode);
              salary = `${currency} ${job.salary_min.toLocaleString()}+`;
            } else if (job.salary_max) {
              const currency = getCurrencyForCountry(normalizedCountryCode);
              salary = `Up to ${currency} ${job.salary_max.toLocaleString()}`;
            }
            
            // Format posted date
            let postedDate = new Date().toLocaleDateString();
            if (job.created) {
              try {
                const date = new Date(job.created);
                if (!isNaN(date.getTime())) {
                  postedDate = date.toLocaleDateString();
                }
              } catch (e) {
                // Keep default
              }
            }
            
            jobs.push({
              externalId: job.id ? `adzuna_${job.id}` : `adzuna_${Date.now()}_${jobs.length}`,
              title: job.title || "Untitled Job",
              company: companyName,
              location: jobLocation,
              salary: salary,
              description: description || job.title || "",
              requirements: [],
              postedDate: postedDate,
              source: "Adzuna",
              url: job.redirect_url || "",
              status: "pending",
              tags: tags.length > 0 ? tags : undefined,
            });
          }
        }
        
        console.log(`Adzuna API page ${page}: returned ${jobList.length} jobs, total so far: ${jobs.length}`);
        
        // If we got fewer results than requested, we've reached the end
        if (jobList.length < resultsPerPage) {
          break;
        }
      } catch (error) {
        console.error(`Error scraping Adzuna page ${page}:`, error);
        // If it's the first page, throw the error; otherwise, just break
        if (page === 1) {
          throw error;
        }
        break;
      }
    }
    
    console.log(`Adzuna API returned ${jobs.length} jobs total`);
  } catch (error) {
    console.error("Error in Adzuna scraper:", error);
    throw error;
  }

  return jobs.slice(0, limit); // Ensure we never exceed the limit
}

/**
 * Get currency symbol for a country code
 */
function getCurrencyForCountry(countryCode: string): string {
  const currencyMap: Record<string, string> = {
    "us": "$",
    "ca": "CAD $",
    "gb": "£",
    "au": "A$",
    "nz": "NZ$",
    "ie": "€",
    "de": "€",
    "fr": "€",
    "es": "€",
    "it": "€",
    "nl": "€",
    "be": "€",
    "ch": "CHF",
    "se": "kr",
    "no": "kr",
    "dk": "kr",
    "fi": "€",
    "pl": "zł",
    "pt": "€",
    "at": "€",
    "jp": "¥",
    "kr": "₩",
    "sg": "S$",
    "in": "₹",
    "cn": "¥",
    "br": "R$",
    "mx": "$",
    "ar": "$",
    "cl": "$",
    "za": "R",
  };
  
  return currencyMap[countryCode.toLowerCase()] || "$";
}


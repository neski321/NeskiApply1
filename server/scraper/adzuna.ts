import { fetchWithRetry, delay, getScraperDelay, extractTextFromHtml, parseSalary, extractTags } from "./utils";
import type { InsertJob } from "@shared/schema";

interface AdzunaJob {
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  description: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  created: string;
  redirect_url: string;
  id: string;
}

interface AdzunaResponse {
  results: AdzunaJob[];
}

/**
 * Scrape jobs from Adzuna API (free tier available)
 * API: https://developer.adzuna.com/
 */
export async function scrapeAdzuna(
  jobTitles: string[],
  locations: string[],
  appId?: string,
  appKey?: string,
  limit: number = 50
): Promise<InsertJob[]> {
  const jobs: InsertJob[] = [];
  
  // Adzuna requires API credentials, but we can use a demo approach
  // For production, user should get API key from https://developer.adzuna.com/
  
  if (!appId || !appKey) {
    console.log("Adzuna API credentials not provided, skipping Adzuna scraper");
    return jobs;
  }

  try {
    for (const title of jobTitles.slice(0, 3)) { // Limit to 3 titles to avoid rate limits
      for (const location of locations.slice(0, 2)) { // Limit to 2 locations
        if (jobs.length >= limit) break;
        
        const url = `https://api.adzuna.com/v1/api/jobs/ca/search/1`;
        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          results_per_page: "50",
          what: title,
          where: location,
          content_type: "json",
        });

        try {
          const data = await fetchWithRetry(`${url}?${params}`) as AdzunaResponse;
          
          if (data.results && Array.isArray(data.results)) {
            for (const job of data.results) {
              if (jobs.length >= limit) break;
              
              const salary = job.salary_min && job.salary_max
                ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}`
                : parseSalary(job.description) || null;
              
              const description = extractTextFromHtml(job.description || "");
              const tags = extractTags(description);
              
              jobs.push({
                externalId: `adzuna_${job.id}`,
                title: job.title,
                company: job.company?.display_name || "Unknown",
                location: job.location?.display_name || location,
                salary: salary || undefined,
                description: description || job.title,
                requirements: [],
                postedDate: new Date(job.created).toLocaleDateString(),
                source: "Adzuna",
                url: job.redirect_url,
                status: "pending",
                tags: tags.length > 0 ? tags : undefined,
              });
            }
          }
          
          await delay(getScraperDelay());
        } catch (error) {
          console.error(`Error scraping Adzuna for ${title} in ${location}:`, error);
          continue;
        }
      }
      
      if (jobs.length >= limit) break;
    }
  } catch (error) {
    console.error("Error in Adzuna scraper:", error);
  }

  return jobs;
}





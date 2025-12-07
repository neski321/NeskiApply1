import { fetchWithRetry, delay, getScraperDelay, extractTextFromHtml, parseSalary, extractTags } from "./utils";
import * as cheerio from "cheerio";
import type { InsertJob } from "@shared/schema";

/**
 * Scrape jobs from Indeed (web scraping approach)
 * Note: This is a basic implementation. Indeed's ToS should be respected.
 * For production, consider using Indeed's official API or a service like ScraperAPI.
 */
export async function scrapeIndeed(
  jobTitles: string[],
  locations: string[],
  limit: number = 50
): Promise<InsertJob[]> {
  const jobs: InsertJob[] = [];
  
  try {
    for (const title of jobTitles.slice(0, 3)) {
      for (const location of locations.slice(0, 2)) {
        if (jobs.length >= limit) break;
        
        // Indeed search URL
        const searchQuery = encodeURIComponent(title);
        const locationQuery = encodeURIComponent(location);
        const url = `https://www.indeed.com/jobs?q=${searchQuery}&l=${locationQuery}&limit=50`;
        
        try {
          // Note: Indeed has anti-scraping measures. This is a basic implementation.
          // For production, consider using a service like ScraperAPI or Indeed's official API.
          const response = await fetchWithRetry(url, {
            method: "GET",
            responseType: "text",
          });
          
          const $ = cheerio.load(response as string);
          
          // Indeed's job card structure (this may change, so this is a basic implementation)
          $(".job_seen_beacon, .jobCard").each((_, element) => {
            if (jobs.length >= limit) return false;
            
            const $el = $(element);
            const title = $el.find("h2.jobTitle a, h2.jobTitle span").first().text().trim();
            const company = $el.find(".companyName, [data-testid='company-name']").first().text().trim();
            const locationText = $el.find(".companyLocation, [data-testid='text-location']").first().text().trim();
            const salary = $el.find(".salary-snippet, [data-testid='attribute_snippet_testid']").first().text().trim();
            const jobUrl = $el.find("h2.jobTitle a").attr("href");
            const jobId = jobUrl?.match(/jk=([^&]+)/)?.[1];
            
            if (!title || !company) return;
            
            // Get full job description (would need to fetch individual job page)
            const description = $el.find(".job-snippet, .summary").text().trim() || title;
            const tags = extractTags(description);
            
            jobs.push({
              externalId: jobId ? `indeed_${jobId}` : undefined,
              title,
              company,
              location: locationText || location,
              salary: salary || parseSalary(description) || undefined,
              description: description.substring(0, 5000), // Limit description length
              requirements: [],
              postedDate: "Recently", // Indeed doesn't always show exact date in list
              source: "Indeed",
              url: jobUrl?.startsWith("http") ? jobUrl : `https://www.indeed.com${jobUrl}`,
              status: "pending",
              tags: tags.length > 0 ? tags : undefined,
            });
          });
          
          await delay(getScraperDelay() * 2); // Longer delay for web scraping
        } catch (error) {
          console.error(`Error scraping Indeed for ${title} in ${location}:`, error);
          continue;
        }
      }
      
      if (jobs.length >= limit) break;
    }
  } catch (error) {
    console.error("Error in Indeed scraper:", error);
  }

  return jobs;
}


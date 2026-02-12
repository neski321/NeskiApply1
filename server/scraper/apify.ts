import { ApifyClient } from "apify-client";
import type { InsertJob } from "@shared/schema";
import { extractTags } from "./utils";

/** Apify Indeed Scraper Actor ID */
const APIFY_INDEED_SCRAPER_ACTOR_ID = "hMvNSpz3JnHgl5jkh";

export interface ApifyScrapeOptions {
  position: string;
  maxItemsPerSearch: number;
  country: string;
  location?: string;
  parseCompanyDetails?: boolean;
  saveOnlyUniqueItems?: boolean;
  followApplyRedirects?: boolean;
}

export interface ApifyActorInput {
  position: string;
  maxItemsPerSearch: number;
  country: string;
  location?: string;
  parseCompanyDetails: boolean;
  saveOnlyUniqueItems: boolean;
  followApplyRedirects: boolean;
}

/**
 * Generate a stable external ID for deduplication.
 * Uses URL if available (LinkedIn URLs are unique), otherwise hash of title+company.
 */
function getExternalId(item: Record<string, unknown>, index: number): string {
  const url = (item.url ?? item.applyUrl ?? item.link ?? item.jobUrl) as string | undefined;
  if (url && typeof url === "string" && url.length > 0) {
    return `apify_${url.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 150)}`;
  }
  const id = (item.id ?? item.jobId ?? item.linkedInId ?? item.externalId) as string | undefined;
  if (id && typeof id === "string" && id.length > 0) {
    return `apify_${id}`;
  }
  const title = (item.positionName ?? item.title ?? item.jobTitle ?? item.name ?? "") as string;
  const company = (item.company ?? item.companyName ?? item.employer ?? "") as string;
  const key = `${title}|${company}|${index}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return `apify_${Math.abs(hash).toString(36)}_${index}`;
}

/**
 * Normalize Apify job item to our InsertJob schema.
 * Apify Indeed Scraper uses positionName, company, location, description, etc.
 */
function normalizeApifyJobToInsertJob(item: Record<string, unknown>, index: number): InsertJob {
  const title = (item.positionName ?? item.title ?? item.jobTitle ?? item.name ?? "Untitled Job") as string;
  const company = (item.company ?? item.companyName ?? item.employer ?? "Unknown") as string;
  const location = (item.location ?? item.jobLocation ?? item.place ?? "Unknown") as string;
  const description = (item.description ?? item.jobDescription ?? item.text ?? title) as string;
  const url = (item.url ?? item.applyUrl ?? item.link ?? item.jobUrl ?? "") as string;
  const salary = (item.salary ?? item.salaryRange ?? item.compensation) as string | undefined;
  const postedAt = item.postedAt ?? item.postedDate ?? item.publishedAt ?? item.datePosted;

  let postedDate = new Date().toLocaleDateString();
  if (postedAt) {
    try {
      const date = typeof postedAt === "string" ? new Date(postedAt) : new Date(postedAt as number);
      if (!isNaN(date.getTime())) {
        postedDate = date.toLocaleDateString();
      }
    } catch {
      // Keep default
    }
  }

  const tags = extractTags(description || title);
  const requirements = Array.isArray(item.requirements)
    ? (item.requirements as string[])
    : [];

  return {
    externalId: getExternalId(item, index),
    title,
    company,
    location,
    salary: salary ?? undefined,
    description: description || title,
    requirements: requirements.length > 0 ? requirements : undefined,
    postedDate,
    source: "Apify",
    url: url || undefined,
    status: "pending",
    tags: tags.length > 0 ? tags : undefined,
  } as InsertJob;
}

/**
 * Scrape jobs using Apify LinkedIn Jobs Scraper actor.
 * Configurable via settings (apify_api_token, apify_*).
 */
export async function scrapeApify(
  apiToken: string,
  options: ApifyScrapeOptions
): Promise<InsertJob[]> {
  const {
    position,
    maxItemsPerSearch = 100,
    country = "US",
    location,
    parseCompanyDetails = false,
    saveOnlyUniqueItems = true,
    followApplyRedirects = false,
  } = options;

  if (!apiToken || apiToken.trim() === "") {
    console.log("Apify API token not provided, skipping Apify scraper");
    return [];
  }

  const client = new ApifyClient({ token: apiToken });

  const input: ApifyActorInput = {
    position: position.trim(),
    maxItemsPerSearch: Math.min(Math.max(1, maxItemsPerSearch), 1000),
    country: country.trim().toUpperCase().slice(0, 2) || "US",
    parseCompanyDetails,
    saveOnlyUniqueItems,
    followApplyRedirects,
  };

  if (location && location.trim()) {
    input.location = location.trim();
  }

  try {
    console.log(`[Apify] Starting Indeed Scraper: position="${position}", country=${input.country}`);

    const run = await client.actor(APIFY_INDEED_SCRAPER_ACTOR_ID).call(input);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const jobs: InsertJob[] = (items as Record<string, unknown>[]).map((item, index) =>
      normalizeApifyJobToInsertJob(item, index)
    );

    console.log(`[Apify] Scraper returned ${items.length} items, processed ${jobs.length} jobs`);

    return jobs;
  } catch (error) {
    console.error("[Apify] Error scraping Indeed jobs:", error);
    throw error;
  }
}

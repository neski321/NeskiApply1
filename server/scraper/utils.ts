import axios from "axios";

/**
 * Rate limiter - delays between requests
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get delay from environment or use default
 */
export function getScraperDelay(): number {
  return parseInt(process.env.SCRAPER_DELAY_MS || "2000", 10);
}

/**
 * Get daily limit from environment or use default
 */
export function getDailyLimit(): number {
  return parseInt(process.env.SCRAPER_DAILY_LIMIT || "50", 10);
}

/**
 * Create a user agent string to avoid blocking
 */
export function getUserAgent(): string {
  return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
}

/**
 * Make HTTP request with retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: any = {},
  maxRetries = 3
): Promise<any> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios({
        url,
        ...options,
        headers: {
          "User-Agent": getUserAgent(),
          ...options.headers,
        },
        timeout: 30000, // 30 second timeout
        responseType: options.responseType || "json",
      });
      return options.responseType === "text" ? response.data : response.data;
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const waitTime = attempt * 1000; // Exponential backoff
        await delay(waitTime);
      }
    }
  }
  
  throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Extract text from HTML (basic implementation)
 */
export function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();
  
  return text;
}

/**
 * Parse salary from text
 */
export function parseSalary(text: string): string | null {
  if (!text) return null;
  
  // Common salary patterns
  const patterns = [
    /\$(\d{1,3}(?:,\d{3})*(?:k|K)?)\s*-\s*\$(\d{1,3}(?:,\d{3})*(?:k|K)?)/, // $50k - $80k
    /\$(\d{1,3}(?:,\d{3})*(?:k|K)?)\s*\+\s*(?:per\s+)?(?:year|yr|hour|hr)/i, // $100k+ per year
    /(\d{1,3}(?:,\d{3})*)\s*-\s*(\d{1,3}(?:,\d{3})*)\s*(?:per\s+)?(?:year|yr|hour|hr)/i, // 50,000 - 80,000 per year
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

/**
 * Extract tags/skills from job description
 */
export function extractTags(description: string): string[] {
  const tags: string[] = [];
  const lowerDesc = description.toLowerCase();
  
  // Common tech stack keywords
  const techKeywords = [
    "react", "vue", "angular", "typescript", "javascript", "python", "java", "go", "rust",
    "node.js", "express", "django", "flask", "fastapi", "spring", "laravel",
    "postgresql", "mysql", "mongodb", "redis", "aws", "azure", "gcp", "docker", "kubernetes",
    "graphql", "rest api", "microservices", "agile", "scrum", "ci/cd", "git"
  ];
  
  for (const keyword of techKeywords) {
    if (lowerDesc.includes(keyword)) {
      const capitalized = keyword.split(" ").map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(" ");
      if (!tags.includes(capitalized)) {
        tags.push(capitalized);
      }
    }
  }
  
  return tags.slice(0, 10); // Limit to 10 tags
}


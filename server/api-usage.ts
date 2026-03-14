import { storage } from "./storage";
import { activityLogger } from "./logger";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { addDays } from "date-fns";

/**
 * API Usage Limits
 */
const PERPLEXITY_DAILY_LIMIT = 200;
const PERPLEXITY_MINUTE_LIMIT = 5;
const GEMINI_DAILY_LIMIT = 250; // Free tier: gemini-2.5-flash has 250 requests/day (as of Dec 2025+)
const GEMINI_MINUTE_LIMIT = 10; // Free tier: gemini-2.5-flash has 10 requests/minute
const OPENROUTER_DAILY_LIMIT = 50; // Free tier strict limit (50 requests/day)
const OPENROUTER_MINUTE_LIMIT = 20; // OpenRouter rate limit (20 requests/minute)
const JSEARCH_DAILY_LIMIT = 10; // User's limit: 10 jobs per day
const JSEARCH_MONTHLY_LIMIT = 200; // Basic plan: 200 requests/month (hard limit)
const JSEARCH_HOURLY_LIMIT = 1000; // Rate limit: 1000 requests/hour
const N8N_MONTHLY_LIMIT = 1000;
const APIFY_DAILY_LIMIT = 31; // Hard limit: max jobs from Apify API per day

interface ProviderUsage {
  dailyCount: number;
  dailyLimit: number;
  usagePercentage: number;
  minuteCount: number;
  minuteLimit: number;
}

interface JSearchUsage {
  monthlyCount: number;
  monthlyLimit: number;
  usagePercentage: number;
  hourlyCount: number;
  hourlyLimit: number;
  resetTime: Date; // 6th of next month
}

interface APIUsage {
  // Overall (for backward compatibility - shows Perplexity as primary)
  dailyCount: number;
  dailyLimit: number;
  usagePercentage: number;
  resetTime: Date;
  minuteCount: number;
  minuteLimit: number;
  // Breakdown by provider
  providers: {
    perplexity: ProviderUsage;
    gemini: ProviderUsage;
    openrouter: ProviderUsage;
    jsearch: ProviderUsage;
    apify: ProviderUsage; // Daily limit: 31 jobs
    n8n: {
      monthlyCount: number;
      monthlyLimit: number;
      usagePercentage: number;
      resetTime: Date; // First day of next month
    };
  };
}

/**
 * Get API usage statistics for a specific user
 */
export async function getAPIUsage(userId: string): Promise<APIUsage> {
  try {
    // Get current date/time (used for both daily and monthly calculations)
    const now = new Date();

    // User's timezone for "today" and reset at 12:00 AM in their timezone (from Settings > cron_timezone)
    // Use toDate with string to avoid fromZonedTime bug (only works in UTC environments)
    const tzSetting = await storage.getSetting("cron_timezone", userId);
    const timezone = tzSetting?.value || "America/Toronto";

    // Start of today and tomorrow at 12:00 AM in user's timezone (as UTC moments)
    const todayStr = formatInTimeZone(now, timezone, "yyyy-MM-dd");
    const tomorrowStr = formatInTimeZone(addDays(now, 1), timezone, "yyyy-MM-dd");
    const startOfTodayUTC = toDate(`${todayStr}T00:00:00`, { timeZone: timezone });
    const startOfTomorrowUTC = toDate(`${tomorrowStr}T00:00:00`, { timeZone: timezone });

    // Get all activity logs for this user
    const allLogs = await storage.getActivityLogs(userId, 1000);

    // Filter logs from "today" in user's timezone (12:00 AM to 11:59:59.999 in their TZ)
    const todayLogs = allLogs.filter(log => {
      const t = new Date(log.createdAt).getTime();
      return t >= startOfTodayUTC.getTime() && t < startOfTomorrowUTC.getTime();
    });
    
    // Count Perplexity API calls
    const perplexityLogs = todayLogs.filter(log => {
      if (log.metadata && typeof log.metadata === 'object') {
        return log.metadata.provider === "perplexity" || 
               (log.metadata.apiCall && log.message?.toLowerCase().includes("perplexity"));
      }
      return false;
    });
    
    // Count Gemini API calls
    const geminiLogs = todayLogs.filter(log => {
      if (log.metadata && typeof log.metadata === 'object') {
        return log.metadata.provider === "gemini" || 
               (log.metadata.apiCall && log.message?.toLowerCase().includes("gemini"));
      }
      return false;
    });
    
    // Count OpenRouter API calls
    const openrouterLogs = todayLogs.filter(log => {
      if (log.metadata && typeof log.metadata === 'object') {
        return log.metadata.provider === "openrouter" || 
               (log.metadata.apiCall && log.message?.toLowerCase().includes("openrouter"));
      }
      return false;
    });
    
    // Count Apify API usage (jobs requested today - daily limit 31)
    const apifyLogs = todayLogs.filter(log => {
      if (log.metadata && typeof log.metadata === 'object') {
        return log.metadata.provider === "apify" || 
               (log.metadata.apiCall && log.message?.toLowerCase().includes("apify"));
      }
      return false;
    });
    let apifyDailyCount = 0;
    apifyLogs.forEach(log => {
      if (log.metadata && typeof log.metadata === 'object' && typeof log.metadata.jobsRequested === 'number') {
        apifyDailyCount += log.metadata.jobsRequested;
      } else {
        apifyDailyCount += 1; // Fallback for legacy logs
      }
    });
    
    // Count JSearch API calls (monthly tracking, not daily)
    // JSearch has monthly limit (200/month) and hourly rate limit (1000/hour)
    // JSearch resets on the 6th of every month (reuse 'now' from function start)
    let jsearchPeriodStart: Date;
    let jsearchResetTime: Date;
    
    if (now.getDate() >= 6) {
      // Current period started on the 6th of this month
      jsearchPeriodStart = new Date(now.getFullYear(), now.getMonth(), 6);
      // Reset time is the 6th of next month
      jsearchResetTime = new Date(now.getFullYear(), now.getMonth() + 1, 6);
    } else {
      // Current period started on the 6th of last month
      jsearchPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 6);
      // Reset time is the 6th of this month
      jsearchResetTime = new Date(now.getFullYear(), now.getMonth(), 6);
    }
    jsearchPeriodStart.setHours(0, 0, 0, 0);
    jsearchResetTime.setHours(0, 0, 0, 0);
    
    // Get all JSearch logs from current period
    // Use the same date comparison logic as n8n (which works correctly)
    const jsearchLogsThisMonth = allLogs.filter(log => {
      // Check if it's a JSearch log
      const message = log.message?.toLowerCase() || "";
      const hasJSearchInMessage = message.includes("jsearch");
      
      let isJSearchLog = false;
      if (log.metadata && typeof log.metadata === 'object') {
        const hasJSearchProvider = log.metadata.provider === "jsearch";
        const hasApiCallFlag = log.metadata.apiCall === true;
        isJSearchLog = hasJSearchProvider || (hasApiCallFlag && hasJSearchInMessage);
      } else {
        isJSearchLog = hasJSearchInMessage;
      }
      
      if (!isJSearchLog) return false;
      
      // Check date using same logic as n8n (which works)
      const jobDate = new Date(log.createdAt);
      jobDate.setHours(0, 0, 0, 0); // Normalize to start of day for comparison
      const isInPeriod = jobDate.getTime() >= jsearchPeriodStart.getTime() && 
                         jobDate.getTime() < jsearchResetTime.getTime();
      
      return isInPeriod;
    });
    
    // Calculate total JSearch requests this month (sum up the request counts from metadata)
    let jsearchMonthlyCount = 0;
    jsearchLogsThisMonth.forEach(log => {
      if (log.metadata && typeof log.metadata === 'object') {
        if (typeof log.metadata.requestCount === 'number') {
          jsearchMonthlyCount += log.metadata.requestCount;
        } else {
          // Fallback: count as 1 request if no requestCount specified (legacy logs)
          jsearchMonthlyCount += 1;
        }
      } else {
        // No metadata: count as 1 request (legacy logs)
        jsearchMonthlyCount += 1;
      }
    });
    
    
    // Count JSearch API calls in the last hour (for rate limiting)
    const oneHourAgo = new Date(Date.now() - 3600000);
    const jsearchRecentHour = jsearchLogsThisMonth.filter(log => {
      const logDate = new Date(log.createdAt);
      return logDate >= oneHourAgo;
    });
    
    let jsearchHourlyCount = 0;
    jsearchRecentHour.forEach(log => {
      if (log.metadata && typeof log.metadata === 'object' && typeof log.metadata.requestCount === 'number') {
        jsearchHourlyCount += log.metadata.requestCount;
      } else {
        jsearchHourlyCount += 1;
      }
    });
    
    // Count API calls in the last minute for other providers
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const perplexityRecent = perplexityLogs.filter(log => {
      const logDate = new Date(log.createdAt);
      return logDate >= oneMinuteAgo;
    });
    const geminiRecent = geminiLogs.filter(log => {
      const logDate = new Date(log.createdAt);
      return logDate >= oneMinuteAgo;
    });
    const openrouterRecent = openrouterLogs.filter(log => {
      const logDate = new Date(log.createdAt);
      return logDate >= oneMinuteAgo;
    });
    
    // Calculate n8n monthly usage (count jobs with source containing "n8n" from current period)
    // n8n resets on the 6th of every month (reuse 'now' from JSearch calculation above)
    let n8nPeriodStart: Date;
    let n8nResetTime: Date;
    
    if (now.getDate() >= 6) {
      // Current period started on the 6th of this month
      n8nPeriodStart = new Date(now.getFullYear(), now.getMonth(), 6);
      // Reset time is the 6th of next month
      n8nResetTime = new Date(now.getFullYear(), now.getMonth() + 1, 6);
    } else {
      // Current period started on the 6th of last month
      n8nPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 6);
      // Reset time is the 6th of this month
      n8nResetTime = new Date(now.getFullYear(), now.getMonth(), 6);
    }
    n8nPeriodStart.setHours(0, 0, 0, 0);
    n8nResetTime.setHours(0, 0, 0, 0);
    
    // Method 1: Count n8n API calls (ingestions) from activity logs
    // This counts the number of times the ingestion endpoint was called
    const n8nIngestionLogs = allLogs.filter(log => {
      // Check if it's an n8n ingestion log
      const message = log.message?.toLowerCase() || "";
      // Message format: "API call: n8n Job Ingestion" or "n8n job ingestion: X new jobs added"
      const hasN8nInMessage = message.includes("n8n");
      const hasIngestionInMessage = message.includes("ingestion") || message.includes("job ingestion");
      
      let isN8nIngestion = false;
      if (log.metadata && typeof log.metadata === 'object') {
        // Primary check: provider is n8n and it's an API call
        const hasN8nProvider = log.metadata.provider === "n8n";
        const hasApiCallFlag = log.metadata.apiCall === true;
        
        // If provider is n8n and it's an API call, it's definitely an n8n ingestion
        if (hasN8nProvider && hasApiCallFlag) {
          isN8nIngestion = true;
        } else if (hasApiCallFlag && hasN8nInMessage && hasIngestionInMessage) {
          // Fallback: API call with n8n and ingestion in message
          isN8nIngestion = true;
        } else if (log.metadata.source === "n8n" && hasIngestionInMessage) {
          // Also check for source: "n8n" in metadata
          isN8nIngestion = true;
        }
      } else {
        // No metadata: check message only
        isN8nIngestion = hasN8nInMessage && hasIngestionInMessage;
      }
      
      if (!isN8nIngestion) return false;
      
      // Check if log is within the current period
      const logDate = new Date(log.createdAt);
      logDate.setHours(0, 0, 0, 0); // Normalize to start of day for comparison
      const isInPeriod = logDate.getTime() >= n8nPeriodStart.getTime() && 
                         logDate.getTime() < n8nResetTime.getTime();
      
      return isInPeriod;
    });
    
    // Method 2: Count n8n jobs from database
    // Get all jobs for this user
    const allJobs = await storage.getJobs(userId);
    
    // Filter n8n jobs within the current period
    // This includes all jobs from the period start (including test data) going forward
    const n8nJobs = allJobs.filter(job => {
      if (!job.source) return false;
      
      // Check if source contains "n8n" (case-insensitive)
      // Sources can be: "n8n", "n8n (Indeed)", "n8n (LinkedIn)", etc.
      const hasN8nSource = job.source.toLowerCase().includes("n8n");
      if (!hasN8nSource) return false;
      
      // Check if job is within the current period
      // Include all jobs from period start (inclusive) to reset time (exclusive)
      const jobDate = new Date(job.createdAt);
      jobDate.setHours(0, 0, 0, 0); // Normalize to start of day for comparison
      const isInPeriod = jobDate.getTime() >= n8nPeriodStart.getTime() && 
                         jobDate.getTime() < n8nResetTime.getTime();
      
      return isInPeriod;
    });
    
    // Sum up jobsIngested from all ingestion logs - this is the source of truth
    // It counts the actual number of jobs ingested per API call, including all ingestions in the period
    let totalJobsFromLogs = 0;
    n8nIngestionLogs.forEach(log => {
      if (log.metadata && typeof log.metadata === 'object' && typeof log.metadata.jobsIngested === 'number') {
        totalJobsFromLogs += log.metadata.jobsIngested;
      }
    });
    
    // Count jobs from database as verification
    // Note: This may be less than logs if jobs were deleted, duplicates updated, etc.
    const n8nJobsCount = n8nJobs.length;
    const n8nIngestionCount = n8nIngestionLogs.length;
    
    // Prioritize logs count since it's the accurate record of what was actually ingested
    // This ensures API usage tracking reflects actual API consumption, not current database state
    let n8nMonthlyCount = totalJobsFromLogs;
    
    // If logs show 0 but we have jobs in database, use database count as fallback
    // This handles edge cases where logs might be missing but jobs exist
    if (n8nMonthlyCount === 0 && n8nJobsCount > 0) {
      n8nMonthlyCount = n8nJobsCount;
    }
    
    // Final fallback: if still 0 but we have ingestion logs, use ingestion count as minimum
    // (at least 1 job per ingestion, though this is less accurate)
    if (n8nMonthlyCount === 0 && n8nIngestionCount > 0) {
      n8nMonthlyCount = n8nIngestionCount;
    }
    
    // Reset time = 12:00 AM tomorrow in user's timezone (already computed above)
    const resetTime = startOfTomorrowUTC;
    
    // Calculate usage for each provider
    // Calculate usage percentages with precision (for display) and rounded (for badge)
    const perplexityPercentage = Math.min(100, (perplexityLogs.length / PERPLEXITY_DAILY_LIMIT) * 100);
    const geminiPercentage = Math.min(100, (geminiLogs.length / GEMINI_DAILY_LIMIT) * 100);
    const openrouterPercentage = Math.min(100, (openrouterLogs.length / OPENROUTER_DAILY_LIMIT) * 100);
    const jsearchPercentage = Math.min(100, (jsearchMonthlyCount / JSEARCH_MONTHLY_LIMIT) * 100);
    const apifyPercentage = Math.min(100, (apifyDailyCount / APIFY_DAILY_LIMIT) * 100);
    const n8nPercentage = Math.min(100, (n8nMonthlyCount / N8N_MONTHLY_LIMIT) * 100);
    
    const perplexityUsage: ProviderUsage = {
      dailyCount: perplexityLogs.length,
      dailyLimit: PERPLEXITY_DAILY_LIMIT,
      usagePercentage: Math.round(perplexityPercentage), // Rounded for badge display
      minuteCount: perplexityRecent.length,
      minuteLimit: PERPLEXITY_MINUTE_LIMIT,
    };
    
    const geminiUsage: ProviderUsage = {
      dailyCount: geminiLogs.length,
      dailyLimit: GEMINI_DAILY_LIMIT,
      usagePercentage: Math.round(geminiPercentage), // Rounded for badge display
      minuteCount: geminiRecent.length,
      minuteLimit: GEMINI_MINUTE_LIMIT,
    };
    
    const openrouterUsage: ProviderUsage = {
      dailyCount: openrouterLogs.length,
      dailyLimit: OPENROUTER_DAILY_LIMIT,
      usagePercentage: Math.round(openrouterPercentage), // Rounded for badge display
      minuteCount: openrouterRecent.length,
      minuteLimit: OPENROUTER_MINUTE_LIMIT,
    };
    
    const jsearchUsage: JSearchUsage = {
      monthlyCount: jsearchMonthlyCount,
      monthlyLimit: JSEARCH_MONTHLY_LIMIT,
      usagePercentage: Math.round(jsearchPercentage), // Rounded for badge display
      hourlyCount: jsearchHourlyCount,
      hourlyLimit: JSEARCH_HOURLY_LIMIT,
      resetTime: jsearchResetTime, // Resets on 6th of next month
    };
    
    const apifyUsage: ProviderUsage = {
      dailyCount: apifyDailyCount,
      dailyLimit: APIFY_DAILY_LIMIT,
      usagePercentage: Math.round(apifyPercentage),
      minuteCount: 0,
      minuteLimit: 0,
    };
    
    const n8nUsage = {
      monthlyCount: n8nMonthlyCount,
      monthlyLimit: N8N_MONTHLY_LIMIT,
      usagePercentage: Math.round(n8nPercentage), // Rounded for badge display
      resetTime: n8nResetTime,
    };
    
    // Overall usage (defaults to Perplexity for backward compatibility)
    const overallDailyCount = perplexityLogs.length;
    const overallUsagePercentage = perplexityUsage.usagePercentage;
    
    return {
      dailyCount: overallDailyCount,
      dailyLimit: PERPLEXITY_DAILY_LIMIT,
      usagePercentage: overallUsagePercentage,
      resetTime,
      minuteCount: perplexityRecent.length,
      minuteLimit: PERPLEXITY_MINUTE_LIMIT,
      providers: {
        perplexity: perplexityUsage,
        gemini: geminiUsage,
        openrouter: openrouterUsage,
        jsearch: jsearchUsage,
        apify: apifyUsage,
        n8n: n8nUsage,
      },
    };
  } catch (error) {
    console.error("Error calculating API usage:", error);
    // Return default values on error
    const defaultProviderUsage: ProviderUsage = {
      dailyCount: 0,
      dailyLimit: 200,
      usagePercentage: 0,
      minuteCount: 0,
      minuteLimit: 5,
    };
    return {
      dailyCount: 0,
      dailyLimit: PERPLEXITY_DAILY_LIMIT,
      usagePercentage: 0,
      resetTime: new Date(),
      minuteCount: 0,
      minuteLimit: PERPLEXITY_MINUTE_LIMIT,
      providers: {
        perplexity: defaultProviderUsage,
        gemini: defaultProviderUsage,
        openrouter: defaultProviderUsage,
        jsearch: {
          monthlyCount: 0,
          monthlyLimit: JSEARCH_MONTHLY_LIMIT,
          usagePercentage: 0,
          hourlyCount: 0,
          hourlyLimit: JSEARCH_HOURLY_LIMIT,
          resetTime: new Date(),
        },
        apify: {
          dailyCount: 0,
          dailyLimit: APIFY_DAILY_LIMIT,
          usagePercentage: 0,
          minuteCount: 0,
          minuteLimit: 0,
        },
        n8n: {
          monthlyCount: 0,
          monthlyLimit: N8N_MONTHLY_LIMIT,
          usagePercentage: 0,
          resetTime: new Date(),
        },
      },
    };
  }
}

/**
 * Get Apify jobs requested today (for enforcing 31/day limit)
 */
export async function getApifyDailyUsage(userId: string): Promise<number> {
  const usage = await getAPIUsage(userId);
  return usage.providers.apify.dailyCount;
}

/**
 * Log an API call (call this whenever any API is used)
 * @param context - Description of the API call
 * @param provider - Provider name: "perplexity", "gemini", "jsearch", "n8n", or "apify"
 * @param metadata - Additional metadata
 * @param userId - User ID
 */
export async function logAPICall(
  context: string, 
  provider: "perplexity" | "gemini" | "openrouter" | "jsearch" | "n8n" | "apify",
  metadata?: Record<string, any>, 
  userId?: string
): Promise<void> {
  if (!userId) {
    console.error(`[logAPICall] Missing userId for ${provider} API call: ${context}`);
    return;
  }
  
  await activityLogger.info(`API call: ${context}`, {
    ...metadata,
    apiCall: true,
    provider,
    timestamp: new Date().toISOString(),
  }, userId);
}


import { storage } from "./storage";
import { activityLogger } from "./logger";

/**
 * Track API usage for Perplexity API
 * Perplexity free tier: 5 requests per minute, 200 requests per day
 */
const PERPLEXITY_DAILY_LIMIT = 200;
const PERPLEXITY_MINUTE_LIMIT = 5;

interface APIUsage {
  dailyCount: number;
  dailyLimit: number;
  usagePercentage: number;
  resetTime: Date;
  minuteCount: number;
  minuteLimit: number;
}

/**
 * Get API usage statistics for a specific user
 */
export async function getAPIUsage(userId: string): Promise<APIUsage> {
  try {
    // Get all activity logs for this user
    const allLogs = await storage.getActivityLogs(userId, 1000);
    
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Filter logs from today
    const todayLogs = allLogs.filter(log => {
      const logDate = new Date(log.createdAt);
      return logDate >= today;
    });
    
    // Count API calls - look for logs with apiCall flag or specific patterns
    const apiCallLogs = todayLogs.filter(log => {
      // Check if metadata has apiCall flag
      if (log.metadata && typeof log.metadata === 'object' && 'apiCall' in log.metadata) {
        return true;
      }
      // Also count ATS analysis and job matching (they use Perplexity)
      const message = log.message.toLowerCase();
      return (
        message.includes("ats analysis") ||
        (message.includes("matched") && message.includes("score")) ||
        (log.metadata && (log.metadata.analysisId || log.metadata.matchScore))
      );
    });
    
    const dailyCount = apiCallLogs.length;
    const usagePercentage = Math.min(100, Math.round((dailyCount / PERPLEXITY_DAILY_LIMIT) * 100));
    
    // Calculate reset time (midnight tomorrow)
    const resetTime = new Date();
    resetTime.setDate(resetTime.getDate() + 1);
    resetTime.setHours(0, 0, 0, 0);
    
    // Count API calls in the last minute (for rate limiting)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentApiCalls = apiCallLogs.filter(log => {
      const logDate = new Date(log.createdAt);
      return logDate >= oneMinuteAgo;
    });
    const minuteCount = recentApiCalls.length;
    
    return {
      dailyCount,
      dailyLimit: PERPLEXITY_DAILY_LIMIT,
      usagePercentage,
      resetTime,
      minuteCount,
      minuteLimit: PERPLEXITY_MINUTE_LIMIT,
    };
  } catch (error) {
    console.error("Error calculating API usage:", error);
    // Return default values on error
    return {
      dailyCount: 0,
      dailyLimit: PERPLEXITY_DAILY_LIMIT,
      usagePercentage: 0,
      resetTime: new Date(),
      minuteCount: 0,
      minuteLimit: PERPLEXITY_MINUTE_LIMIT,
    };
  }
}

/**
 * Log an API call (call this whenever Perplexity API is used)
 */
export async function logAPICall(context: string, metadata?: Record<string, any>, userId?: string): Promise<void> {
  await activityLogger.info(`API call: ${context}`, {
    ...metadata,
    apiCall: true,
    timestamp: new Date().toISOString(),
  }, userId);
}


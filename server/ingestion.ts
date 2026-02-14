/**
 * Shared job ingestion handling (n8n, Apify, etc.)
 * Jobs are upserted, then auto-matched in background with retries and rate limit handling.
 */
import { storage } from "./storage";
import { activityLogger } from "./logger";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { addDays } from "date-fns";

const MIN_DELAY_MS = 30000; // 30 seconds between requests (safe for Gemini's 2 req/min)
const MAX_RETRIES = 3;

/**
 * Run background auto-matching for ingested jobs.
 * Same logic as n8n ingestion: sequential matching with rate limit protection,
 * retries, OpenRouter fallback, and unscanned jobs notification.
 */
export async function runBackgroundMatching(
  jobsToMatch: Array<{ id: number; title: string }>,
  userId: string,
  source: string
): Promise<void> {
  if (jobsToMatch.length === 0) return;

  try {
    console.log(`[Ingest] Processing ${jobsToMatch.length} jobs for sequential auto-matching (source: ${source})...`);
    const { matchAndUpdateJob } = await import("./matcher/job-matcher");
    const { getAPIUsage } = await import("./api-usage");

    let matchedCount = 0;
    let failedCount = 0;
    const failedJobIds: number[] = [];

    const waitForRateLimitReset = async (provider: string) => {
      console.log(`[Ingest] ${provider} rate limit reached. Pausing and waiting for reset...`);
      await new Promise((resolve) => setTimeout(resolve, 65000));
      console.log(`[Ingest] Rate limit window reset, resuming processing...`);
    };

    const waitForDailyLimitReset = async () => {
      const now = new Date();
      const tzSetting = await storage.getSetting("cron_timezone", userId);
      const timezone = tzSetting?.value || "America/Toronto";
      const tomorrowStr = formatInTimeZone(addDays(now, 1), timezone, "yyyy-MM-dd");
      const startOfTomorrowUTC = toDate(`${tomorrowStr}T00:00:00`, { timeZone: timezone });
      const msUntilMidnight = startOfTomorrowUTC.getTime() - now.getTime();
      if (msUntilMidnight > 0) {
        const hoursUntilMidnight = Math.ceil(msUntilMidnight / (1000 * 60 * 60));
        console.log(`[Ingest] Daily limit reached. Pausing until midnight reset in ${timezone} (${hoursUntilMidnight} hours)...`);
        await new Promise((resolve) => setTimeout(resolve, msUntilMidnight + 60000));
        console.log(`[Ingest] Daily limit reset, resuming processing...`);
      }
    };

    for (let i = 0; i < jobsToMatch.length; i++) {
      const jobToMatch = jobsToMatch[i];
      let retryCount = 0;
      let willUseOpenRouter = false;
      let openrouterDailyLimit = false;

      while (retryCount < MAX_RETRIES) {
        let preference = "auto";
        try {
          const usage = await getAPIUsage(userId);
          const providerPreference = await storage.getSetting("ai_provider_preference", userId);
          preference = providerPreference?.value || "auto";

          let willUsePerplexity = false;
          let willUseGemini = false;
          willUseOpenRouter = false;
          if (preference === "auto" || preference === "perplexity,gemini,openrouter") {
            willUsePerplexity = true;
            willUseGemini = true;
            willUseOpenRouter = true;
          } else {
            const providers = preference.split(",").map((p) => p.trim());
            willUsePerplexity = providers.includes("perplexity");
            willUseGemini = providers.includes("gemini");
            willUseOpenRouter = providers.includes("openrouter");
          }

          const perplexityMinuteLimit = willUsePerplexity && usage.providers.perplexity.minuteCount >= usage.providers.perplexity.minuteLimit;
          const geminiMinuteLimit = willUseGemini && usage.providers.gemini.minuteCount >= usage.providers.gemini.minuteLimit;
          const openrouterMinuteLimit = willUseOpenRouter && usage.providers.openrouter.minuteCount >= usage.providers.openrouter.minuteLimit;

          if (perplexityMinuteLimit) {
            await waitForRateLimitReset("Perplexity");
            continue;
          }
          if (geminiMinuteLimit) {
            await waitForRateLimitReset("Gemini");
            continue;
          }
          if (openrouterMinuteLimit) {
            await waitForRateLimitReset("OpenRouter");
            continue;
          }

          const perplexityDailyLimit = willUsePerplexity && usage.providers.perplexity.dailyCount >= usage.providers.perplexity.dailyLimit;
          const geminiDailyLimit = willUseGemini && usage.providers.gemini.dailyCount >= usage.providers.gemini.dailyLimit;
          openrouterDailyLimit = willUseOpenRouter && usage.providers.openrouter.dailyCount >= usage.providers.openrouter.dailyLimit;

          if ((perplexityDailyLimit || geminiDailyLimit) && !openrouterDailyLimit && willUseOpenRouter) {
            console.log(`[Ingest] Primary providers at daily limit, switching to OpenRouter for job ${jobToMatch.id}...`);
            const originalPreference = preference;
            await storage.setSetting("ai_provider_preference", "openrouter", userId);
            const success = await matchAndUpdateJob(jobToMatch.id, userId);
            await storage.setSetting("ai_provider_preference", originalPreference, userId);
            if (success) {
              matchedCount++;
              console.log(`[Ingest] Successfully auto-matched job ${jobToMatch.id} - ${matchedCount}/${jobsToMatch.length} (${source})`);
              break;
            }
          }

          const allProvidersAtDailyLimit =
            (willUsePerplexity && perplexityDailyLimit) &&
            (willUseGemini && geminiDailyLimit) &&
            (willUseOpenRouter && openrouterDailyLimit);
          if (allProvidersAtDailyLimit) {
            await waitForDailyLimitReset();
            continue;
          }

          if (i > 0 || retryCount > 0) {
            await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS));
          }

          const success = await matchAndUpdateJob(jobToMatch.id, userId);
          if (success) {
            matchedCount++;
            console.log(`[Ingest] Successfully auto-matched job ${jobToMatch.id} (${jobToMatch.title}) - ${matchedCount}/${jobsToMatch.length} (${source})`);
            break;
          } else {
            retryCount++;
            if (retryCount < MAX_RETRIES) {
              if (retryCount === 1 && !openrouterDailyLimit && willUseOpenRouter) {
                await storage.setSetting("ai_provider_preference", "openrouter", userId);
                await new Promise((resolve) => setTimeout(resolve, 10000));
                continue;
              }
              await new Promise((resolve) => setTimeout(resolve, 10000));
              continue;
            } else {
              failedCount++;
              failedJobIds.push(jobToMatch.id);
              await activityLogger.error(
                `Failed to auto-match job "${jobToMatch.title}" from ${source} ingestion after ${MAX_RETRIES} retries`,
                { jobId: jobToMatch.id, reason: "AI service returned null or failed" },
                userId
              );
              break;
            }
          }
        } catch (err: any) {
          const isUnauthorized =
            err?.message?.includes("unauthorized") ||
            err?.message?.includes("invalid") ||
            err?.message?.includes("401") ||
            err?.status === 401;

          if (isUnauthorized && retryCount === 0 && !openrouterDailyLimit && willUseOpenRouter) {
            await storage.setSetting("ai_provider_preference", "openrouter", userId);
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, 5000));
            continue;
          }

          retryCount++;
          if (retryCount < MAX_RETRIES) {
            console.error(`[Ingest] Error auto-matching job ${jobToMatch.id}, retrying (${retryCount}/${MAX_RETRIES}):`, err);
            await new Promise((resolve) => setTimeout(resolve, 10000));
            continue;
          } else {
            failedCount++;
            failedJobIds.push(jobToMatch.id);
            await activityLogger.error(
              `Failed to auto-match job "${jobToMatch.title}" from ${source} ingestion after ${MAX_RETRIES} retries`,
              { jobId: jobToMatch.id, error: err instanceof Error ? err.message : String(err) },
              userId
            );
            break;
          }
        }
      }
    }

    console.log(`[Ingest] Auto-matching complete: ${matchedCount} matched, ${failedCount} failed out of ${jobsToMatch.length} (${source})`);

    if (failedJobIds.length > 0) {
      await activityLogger.warning(
        `${source} ingestion complete: ${failedJobIds.length} job(s) failed ATS scanning after retries`,
        {
          failedJobIds,
          failedCount,
          matchedCount,
          total: jobsToMatch.length,
          source,
          type: "unscanned_jobs_notification",
        },
        userId
      );
    }
  } catch (error) {
    console.error(`[Ingest] Error in auto-matching (${source}):`, error);
    await activityLogger.error(
      `Error processing auto-matching for ${source} ingestion`,
      { error: error instanceof Error ? error.message : String(error) },
      userId
    );
  }
}

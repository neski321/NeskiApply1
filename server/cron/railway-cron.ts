/**
 * Railway Cron Job Entry Point
 * 
 * This file is designed to be run as a separate Railway cron job service.
 * Railway will start this service at scheduled intervals, run the job, and stop it.
 * 
 * To use this:
 * 1. Create a new service in Railway for cron jobs
 * 2. Set the start command to: node dist/cron/railway-cron.cjs
 * 3. Configure the cron schedule in Railway (e.g., every 15 minutes)
 * 4. Set the same environment variables as your main service
 */

import "dotenv/config";
import { storage } from "../storage";
import { executeDailyScraping } from "./index";

async function runCronJob() {
  console.log(`[Railway Cron] Starting cron job at ${new Date().toISOString()}`);
  
  try {
    // Get all users
    const allUsers = await storage.getAllUsers();
    console.log(`[Railway Cron] Found ${allUsers.length} users`);
    
    // Run scraping for each enabled user
    for (const user of allUsers) {
      try {
        // Check if user has cron enabled
        const cronEnabledSetting = await storage.getSetting("cron_enabled", user.id);
        if (!cronEnabledSetting || cronEnabledSetting.value !== "true") {
          console.log(`[Railway Cron] Skipping user ${user.username} - cron not enabled`);
          continue;
        }
        
        // Get user's schedule settings
        const scheduleTimeSetting = await storage.getSetting("cron_schedule_time", user.id);
        const timezoneSetting = await storage.getSetting("cron_timezone", user.id);
        
        const scheduleTime = scheduleTimeSetting?.value || "09:00";
        const timezone = timezoneSetting?.value || "America/Toronto";
        
        // Check if it's time to run for this user
        const now = new Date();
        if (shouldRunNow(scheduleTime, timezone, now)) {
          console.log(`[Railway Cron] Running scheduled job for user ${user.id} (${user.username}) at ${scheduleTime} ${timezone}`);
          await executeDailyScraping(user.id);
        } else {
          const userTimeString = now.toLocaleString("en-US", { 
            timeZone: timezone,
            hour12: false,
            hour: "2-digit",
            minute: "2-digit"
          });
          console.log(`[Railway Cron] Not time yet for user ${user.username}: current=${userTimeString}, scheduled=${scheduleTime} ${timezone}`);
        }
      } catch (error) {
        console.error(`[Railway Cron] Error processing user ${user.id}:`, error);
        // Continue with other users
      }
    }
    
    console.log(`[Railway Cron] Cron job completed at ${new Date().toISOString()}`);
    process.exit(0); // Exit successfully
  } catch (error) {
    console.error("[Railway Cron] Fatal error:", error);
    process.exit(1); // Exit with error
  }
}

/**
 * Check if a cron job should run now based on schedule time and timezone
 */
function shouldRunNow(scheduleTime: string, timezone: string, now: Date): boolean {
  try {
    const [scheduleHour, scheduleMinute] = scheduleTime.split(":").map(Number);
    
    if (isNaN(scheduleHour) || isNaN(scheduleMinute)) {
      return false;
    }
    
    // Convert current time to user's timezone
    const userTimeString = now.toLocaleString("en-US", { 
      timeZone: timezone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit"
    });
    
    const [currentHour, currentMinute] = userTimeString.split(":").map(Number);
    
    // Run if it's the scheduled hour and minute (within a 5-minute window)
    const timeDiff = Math.abs((currentHour * 60 + currentMinute) - (scheduleHour * 60 + scheduleMinute));
    return timeDiff <= 5; // Within 5 minutes of scheduled time
  } catch (error) {
    console.error(`[Railway Cron] Error checking schedule time:`, error);
    return false;
  }
}

// Run the cron job
runCronJob();


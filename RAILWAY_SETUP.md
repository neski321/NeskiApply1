# Railway Deployment Guide

## Overview

This app uses cron jobs for scheduled job scraping. Railway offers two approaches:

1. **Always-on server** (Paid tier) - Current `node-cron` implementation works
2. **Native Railway cron jobs** (All tiers) - More efficient, server only runs when needed

## Option 1: Always-On Server (Current Implementation)

### Requirements
- Railway **Pro** plan ($5/month minimum)
- Server stays running 24/7
- Current `node-cron` implementation works as-is

### Setup
1. Deploy your main service normally
2. The cron jobs will run automatically using `node-cron`
3. No additional configuration needed

## Option 2: Railway Native Cron Jobs (Recommended)

### Benefits
- Works on **free tier** (with limitations)
- More cost-effective (only runs when needed)
- Better resource utilization

### Setup Steps

#### 1. Main Service Setup
- Deploy your main app service normally
- This handles the web server, API, and frontend

#### 2. Create Cron Service
1. In Railway, create a **new service** for cron jobs
2. Connect it to the same GitHub repo
3. Set the **start command** to:
   ```
   node dist/cron/railway-cron.cjs
   ```

#### 3. Configure Cron Schedule
1. Go to your cron service settings
2. Find "Cron Schedule" section
3. Set schedule to: `*/15 * * * *` (every 15 minutes)
   - This checks all users and runs jobs at their scheduled times
   - Minimum interval on Railway is 5 minutes

#### 4. Environment Variables
- Copy all environment variables from your main service
- Especially: `DATABASE_URL`, `SESSION_SECRET`, etc.

#### 5. Disable node-cron in Main Service
To avoid conflicts, you can disable the `node-cron` implementation:

Add to your main service's environment variables:
```
DISABLE_NODE_CRON=true
```

Then update `server/index.ts`:
```typescript
// Setup daily job scraping cron job (only if not using Railway cron)
if (!process.env.DISABLE_NODE_CRON) {
  const { setupDailyScraping } = await import("./cron/index");
  await setupDailyScraping();
}
```

## Railway Cron Schedule Examples

- Every 15 minutes: `*/15 * * * *`
- Every hour: `0 * * * *`
- Daily at 9 AM UTC: `0 9 * * *`
- Every 5 minutes: `*/5 * * * *` (minimum interval)

## Important Notes

1. **Railway cron jobs**:
   - Start the service when scheduled
   - Run the task
   - Stop the service when done
   - Service must exit (use `process.exit()`)

2. **User-specific schedules**:
   - The cron service runs every 15 minutes
   - It checks each user's individual schedule
   - Only runs jobs for users whose scheduled time matches (within 5-minute window)

3. **Free Tier Limitations**:
   - Railway free tier has usage limits
   - Cron jobs count toward usage
   - Consider upgrading for production use

## Testing

After setup, check logs:
1. Main service logs - should show web server running
2. Cron service logs - should show cron job executions

## Troubleshooting

### Cron jobs not running
- Check cron service is enabled
- Verify cron schedule is set correctly
- Check logs for errors
- Ensure environment variables are set

### Jobs running at wrong time
- Verify user timezone settings
- Check cron schedule timezone (should be UTC for Railway)
- User times are converted from their timezone

### Service exits too quickly
- Ensure `process.exit()` is called after job completes
- Check for unhandled promises that prevent exit











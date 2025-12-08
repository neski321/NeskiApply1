import { storage } from "../storage";
import type { Job, Resume } from "@shared/schema";
import { callAIWithFallback, type AIChatMessage } from "../ai-service";

export interface MatchResult {
  bestResumeId: number;
  matchScore: number;
  missingKeywords: string[];
  suggestions: Array<{ title: string; description: string; type: string }>;
  resumeComparisons: Array<{ resumeId: number; resumeName: string; score: number }>;
}

/**
 * Match a job against all resumes using Perplexity API
 */
export async function matchJobAgainstResumes(job: Job, userId: string): Promise<MatchResult | null> {
  try {
    // Get all resumes for this user
    const resumes = await storage.getResumes(userId);
    
    if (resumes.length === 0) {
      console.log("No resumes found, skipping job matching");
      return null;
    }

    // Check if at least one AI API key is configured
    const perplexityKey = await storage.getSetting("perplexity_api_key", userId);
    const geminiKey = await storage.getSetting("gemini_api_key", userId);
    
    if ((!perplexityKey || !perplexityKey.value) && (!geminiKey || !geminiKey.value)) {
      console.log("Neither Perplexity nor Gemini API key configured, skipping job matching");
      return null;
    }

    // Prepare messages for AI analysis
    const messages: AIChatMessage[] = [
      {
        role: "system",
        content: "You are an ATS (Applicant Tracking System) expert analyzer. Analyze job descriptions against resumes and provide detailed matching insights, missing keywords, and improvement suggestions."
      },
      {
        role: "user",
        content: `Analyze this job description against the following resumes and provide:
1. Which resume is the best match (provide ID and match score 0-100)
2. Missing keywords from the best resume
3. Specific actionable suggestions to improve the resume
4. Match scores for all resumes

Job Title: ${job.title}
Company: ${job.company}
Job Description:
${job.description}

Resumes:
${resumes.map(r => `ID: ${r.id}, Name: ${r.name}, Skills: ${r.skills.join(", ")}, Experience: ${r.experience}, Content: ${r.rawContent.substring(0, 1000)}`).join("\n\n")}

Return your response as JSON in this exact format:
{
  "bestResumeId": <number>,
  "matchScore": <number 0-100>,
  "missingKeywords": ["keyword1", "keyword2"],
  "suggestions": [
    {"title": "Suggestion title", "description": "Detailed suggestion", "type": "content"},
    ...
  ],
  "resumeComparisons": [
    {"resumeId": <number>, "resumeName": "Name", "score": <number>},
    ...
  ]
}`
      }
    ];

    // Call AI with fallback (Perplexity first, then Gemini)
    const aiResult = await callAIWithFallback(messages, "sonar-pro", userId);
    
    if (!aiResult) {
      console.error("No response from AI service (Perplexity or Gemini)");
      return null;
    }

    const content = aiResult.content;
    const provider = aiResult.provider;
    
    console.log(`Job matching completed using ${provider}`);

    // Parse the JSON response
    let analysisResult: MatchResult;
    try {
      // Try to extract JSON from the response (it might be wrapped in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      analysisResult = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (parseError) {
      console.error(`Failed to parse ${provider} response:`, content);
      return null;
    }

    return analysisResult;
  } catch (error) {
    console.error("Error matching job against resumes:", error);
    return null;
  }
}

/**
 * Match a single job and update it in the database
 */
export async function matchAndUpdateJob(jobId: number, userId: string): Promise<boolean> {
  try {
    const job = await storage.getJob(jobId, userId);
    if (!job) {
      console.error(`Job ${jobId} not found`);
      return false;
    }

    const matchResult = await matchJobAgainstResumes(job, userId);
    if (!matchResult) {
      return false;
    }

    // Update job with match results
    await storage.updateJob(jobId, {
      matchScore: matchResult.matchScore,
      matchedResumeId: matchResult.bestResumeId,
      matchReasoning: matchResult.suggestions.map(s => `${s.title}: ${s.description}`),
      tags: matchResult.missingKeywords.length > 0 
        ? [...(job.tags || []), ...matchResult.missingKeywords].slice(0, 15) // Limit tags
        : job.tags,
    }, userId);

    // Save full ATS analysis to database for viewing later
    try {
      await storage.createATSAnalysis({
        jobId: jobId,
        jobTitle: job.title,
        jobCompany: job.company,
        jobDescription: job.description,
        bestResumeId: matchResult.bestResumeId,
        matchScore: matchResult.matchScore,
        missingKeywords: matchResult.missingKeywords,
        suggestions: matchResult.suggestions as any,
        resumeComparisons: matchResult.resumeComparisons as any,
      }, userId);
      console.log(`Saved ATS analysis for job ${jobId} to database`);
    } catch (error) {
      console.error(`Failed to save ATS analysis for job ${jobId}:`, error);
      // Don't fail the matching if analysis save fails
    }

    // Log activity (API usage is already logged by AI service)
    const { activityLogger } = await import("../logger");
    await activityLogger.info(
      `Job "${job.title}" matched - Score: ${matchResult.matchScore}%`,
      { jobId, matchScore: matchResult.matchScore, resumeId: matchResult.bestResumeId },
      userId
    );

    // Send Discord notification for high-match jobs
    try {
      const matchedResume = await storage.getResume(matchResult.bestResumeId, userId);
      const { notifyHighMatchJob } = await import("../discord");
      await notifyHighMatchJob(
        job.title,
        job.company,
        job.location,
        matchResult.matchScore,
        userId,
        job.url || undefined,
        matchedResume?.name
      );
    } catch (error) {
      // Don't fail the matching if Discord notification fails
      console.error("Error sending Discord notification:", error);
    }

    console.log(`Matched job ${jobId} (${job.title}) - Score: ${matchResult.matchScore}%`);
    return true;
  } catch (error) {
    console.error(`Error matching job ${jobId}:`, error);
    return false;
  }
}

/**
 * Match multiple jobs in batch
 */
export async function matchJobsBatch(jobs: Job[], userId: string): Promise<{ matched: number; failed: number }> {
  let matched = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      // Skip if already matched recently (optional - can be removed to re-match)
      if (job.matchScore !== null && job.matchScore !== undefined) {
        continue;
      }

      const success = await matchAndUpdateJob(job.id, userId);
      if (success) {
        matched++;
      } else {
        failed++;
      }

      // Add delay between API calls to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error in batch matching for job ${job.id}:`, error);
      failed++;
    }
  }

  return { matched, failed };
}

/**
 * Match all pending jobs (jobs without match scores)
 */
export async function matchAllPendingJobs(userId: string): Promise<{ matched: number; failed: number; total: number }> {
  try {
    const allJobs = await storage.getJobs(userId);
    const pendingJobs = allJobs.filter(j => j.matchScore === null || j.matchScore === undefined);
    
    console.log(`Matching ${pendingJobs.length} pending jobs...`);
    
    const result = await matchJobsBatch(pendingJobs, userId);
    
    return {
      ...result,
      total: pendingJobs.length,
    };
  } catch (error) {
    console.error("Error matching all pending jobs:", error);
    return { matched: 0, failed: 0, total: 0 };
  }
}


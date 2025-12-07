import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { insertResumeSchema, insertJobSchema, insertATSAnalysisSchema } from "@shared/schema";
import { z } from "zod";
import { parseResume } from "./parser/resume-parser";
import { unlink } from "fs/promises";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============ RESUMES API ============
  
  // Get all resumes
  app.get("/api/resumes", async (req, res) => {
    try {
      const resumes = await storage.getResumes();
      res.json(resumes);
    } catch (error) {
      console.error("Error fetching resumes:", error);
      res.status(500).json({ error: "Failed to fetch resumes" });
    }
  });

  // Get single resume
  app.get("/api/resumes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const resume = await storage.getResume(id);
      
      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }
      
      res.json(resume);
    } catch (error) {
      console.error("Error fetching resume:", error);
      res.status(500).json({ error: "Failed to fetch resume" });
    }
  });

  // Create resume
  app.post("/api/resumes", async (req, res) => {
    try {
      const validatedData = insertResumeSchema.parse(req.body);
      const resume = await storage.createResume(validatedData);
      
      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.success(`Resume "${resume.name}" created`, { resumeId: resume.id });
      
      res.status(201).json(resume);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating resume:", error);
      res.status(500).json({ error: "Failed to create resume" });
    }
  });

  // Update resume
  app.patch("/api/resumes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const partialSchema = insertResumeSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      
      const resume = await storage.updateResume(id, validatedData);
      
      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }
      
      res.json(resume);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating resume:", error);
      res.status(500).json({ error: "Failed to update resume" });
    }
  });

  // Delete resume
  app.delete("/api/resumes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const resume = await storage.getResume(id);
      const deleted = await storage.deleteResume(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Resume not found" });
      }
      
      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.info(`Resume "${resume?.name || id}" deleted`, { resumeId: id });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting resume:", error);
      res.status(500).json({ error: "Failed to delete resume" });
    }
  });

  // Upload resume file
  const uploadDir = process.env.UPLOAD_DIR || "./uploads/resumes";
  const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "10485760", 10); // 10MB default

  const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `resume-${uniqueSuffix}${ext}`);
    },
  });

  const upload = multer({
    storage: storageConfig,
    limits: {
      fileSize: maxFileSize,
    },
    fileFilter: (req, file, cb) => {
      const allowedExts = [".pdf", ".docx", ".doc", ".txt"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Allowed types: ${allowedExts.join(", ")}`));
      }
    },
  });

  app.post("/api/resumes/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { name } = req.body;
      if (!name) {
        // Clean up uploaded file
        await unlink(req.file.path);
        return res.status(400).json({ error: "Resume name is required" });
      }

      // Parse the uploaded file
      const parsed = await parseResume(req.file.path, req.file.originalname);

      // Create resume in database
      const resume = await storage.createResume({
        name: name || parsed.fileName,
        fileName: req.file.originalname,
        skills: parsed.skills,
        experience: parsed.experience,
        education: parsed.education || "",
        rawContent: parsed.rawContent,
      });

      // Optionally keep the file, or delete it after parsing
      // For now, we'll keep it in case we need it later
      // You can uncomment the line below to delete after parsing:
      // await unlink(req.file.path);

      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.success(`Resume "${resume.name}" uploaded and parsed`, { resumeId: resume.id, fileName: req.file.originalname });

      res.status(201).json(resume);
    } catch (error) {
      // Clean up uploaded file on error
      if (req.file?.path) {
        try {
          await unlink(req.file.path);
        } catch (unlinkError) {
          console.error("Error cleaning up file:", unlinkError);
        }
      }

      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      
      console.error("Error uploading resume:", error);
      res.status(500).json({ 
        error: "Failed to upload and parse resume", 
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ============ JOBS API ============
  
  // Get all jobs (with optional filters)
  app.get("/api/jobs", async (req, res) => {
    try {
      const { status, minMatchScore } = req.query;
      
      const filters: any = {};
      if (status) filters.status = status as string;
      if (minMatchScore) filters.minMatchScore = parseInt(minMatchScore as string);
      
      const jobs = await storage.getJobs(filters);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get single job
  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Create job
  app.post("/api/jobs", async (req, res) => {
    try {
      const validatedData = insertJobSchema.parse(req.body);
      const job = await storage.createJob(validatedData);
      res.status(201).json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating job:", error);
      res.status(500).json({ error: "Failed to create job" });
    }
  });

  // Update job
  app.patch("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const partialSchema = insertJobSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      
      const job = await storage.updateJob(id, validatedData);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Log activity for status changes
      const { activityLogger } = await import("./logger");
      if (validatedData.status) {
        if (validatedData.status === "applied") {
          await activityLogger.success(`Applied to "${job.title}" at ${job.company}`, { jobId: id });
        } else {
          await activityLogger.info(`Job "${job.title}" status updated to ${validatedData.status}`, { jobId: id, status: validatedData.status });
        }
      }
      
      res.json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating job:", error);
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  // Delete job
  app.delete("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteJob(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting job:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // ============ ATS ANALYSIS API ============
  
  // Analyze job description against resumes
  app.post("/api/ats/analyze", async (req, res) => {
    try {
      const { jobTitle, jobCompany, jobDescription } = req.body;
      
      if (!jobDescription) {
        return res.status(400).json({ error: "Job description is required" });
      }

      // Get all resumes
      const resumes = await storage.getResumes();
      
      if (resumes.length === 0) {
        return res.status(400).json({ error: "No resumes found. Please upload at least one resume first." });
      }

      // Check if at least one AI API key is configured
      const perplexityKey = await storage.getSetting("perplexity_api_key");
      const geminiKey = await storage.getSetting("gemini_api_key");
      
      if ((!perplexityKey || !perplexityKey.value) && (!geminiKey || !geminiKey.value)) {
        return res.status(400).json({ 
          error: "Neither Perplexity nor Gemini API key configured. Please add at least one in Settings." 
        });
      }

      // Import AI service with fallback
      const { callAIWithFallback } = await import("./ai-service");
      type AIChatMessage = { role: "system" | "user" | "assistant"; content: string };

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

Job Description:
${jobDescription}

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
      const aiResult = await callAIWithFallback(messages, "sonar-pro");
      
      if (!aiResult) {
        return res.status(500).json({ 
          error: "No response from AI service (Perplexity or Gemini). Please check your API keys and try again." 
        });
      }

      const content = aiResult.content;
      const provider = aiResult.provider;
      
      console.log(`ATS analysis completed using ${provider}`);

      // Parse the JSON response
      let analysisResult;
      try {
        // Try to extract JSON from the response (it might be wrapped in markdown)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        analysisResult = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch (parseError) {
        console.error(`Failed to parse ${provider} response:`, content);
        return res.status(500).json({ error: "Failed to parse AI response", rawResponse: content });
      }

      // Save analysis to database
      const savedAnalysis = await storage.createATSAnalysis({
        jobTitle: jobTitle || "Untitled Job",
        jobCompany: jobCompany || null,
        jobDescription,
        bestResumeId: analysisResult.bestResumeId,
        matchScore: analysisResult.matchScore,
        missingKeywords: analysisResult.missingKeywords || [],
        suggestions: analysisResult.suggestions || [],
        resumeComparisons: analysisResult.resumeComparisons || []
      });

      // Log API usage
      const { logAPICall } = await import("./api-usage");
      await logAPICall("ATS Analysis", { analysisId: savedAnalysis.id });

      res.json(savedAnalysis);
    } catch (error) {
      console.error("Error during ATS analysis:", error);
      res.status(500).json({ error: "Failed to analyze job description" });
    }
  });

  // Get analysis history
  app.get("/api/ats/analyses", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const analyses = await storage.getATSAnalyses(limit);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching analyses:", error);
      res.status(500).json({ error: "Failed to fetch analyses" });
    }
  });

  // Get single analysis
  app.get("/api/ats/analyses/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = await storage.getATSAnalysis(id);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching analysis:", error);
      res.status(500).json({ error: "Failed to fetch analysis" });
    }
  });

  // ============ SETTINGS API ============
  
  // Get all settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Get single setting
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  // Set a setting
  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      
      if (!key || value === undefined || value === null) {
        return res.status(400).json({ error: "Key and value are required" });
      }
      
      // Allow empty strings to clear settings (fallback to env vars)
      const setting = await storage.setSetting(key, String(value));
      res.json(setting);
    } catch (error) {
      console.error("Error setting value:", error);
      res.status(500).json({ error: "Failed to set setting" });
    }
  });

  // ============ JOB SCRAPING API ============
  
  // Trigger daily cron job manually
  app.post("/api/jobs/trigger-cron", async (req, res) => {
    try {
      const { executeDailyScraping } = await import("./cron/index");
      
      // Execute the cron job logic immediately
      const result = await executeDailyScraping();
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          results: result.results,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error) {
      console.error("Error triggering cron job:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to trigger cron job",
      });
    }
  });
  
  // Match all pending jobs against resumes
  app.post("/api/jobs/match", async (req, res) => {
    try {
      // Import matcher (dynamic import to avoid loading issues)
      const { matchAllPendingJobs } = await import("./matcher/job-matcher");
      
      // Start matching (don't await - return immediately)
      const { activityLogger } = await import("./logger");
      await activityLogger.info("Job matching started for all pending jobs");
      
      matchAllPendingJobs().then(async (result) => {
        console.log(`Job matching complete: ${result.matched} matched, ${result.failed} failed out of ${result.total} total`);
        await activityLogger.success(
          `Job matching complete: ${result.matched} matched, ${result.failed} failed`,
          { matched: result.matched, failed: result.failed, total: result.total }
        );
      }).catch(async (error) => {
        console.error("Error in background job matching:", error);
        await activityLogger.error("Job matching failed", { error: error instanceof Error ? error.message : "Unknown error" });
      });
      
      // Return immediately
      res.json({ 
        message: "Job matching started in background. This may take a while depending on the number of jobs."
      });
    } catch (error) {
      console.error("Error starting job matching:", error);
      res.status(500).json({ 
        error: "Failed to start job matching",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Trigger job scraping
  app.post("/api/jobs/sync", async (req, res) => {
    try {
      // Get search parameters from settings (matching JSearch API format)
      const jobTitlesSetting = await storage.getSetting("job_titles");
      const countryCodesSetting = await storage.getSetting("country_codes");
      const datePostedSetting = await storage.getSetting("date_posted");
      const excludedKeywordsSetting = await storage.getSetting("excluded_keywords");
      const linkedInTimePeriodSetting = await storage.getSetting("linkedin_time_period");
      const linkedInLocationFilterSetting = await storage.getSetting("linkedin_location_filter");
      const jobSearchProviderPreferenceSetting = await storage.getSetting("job_search_provider_preference");
      
      if (!jobTitlesSetting) {
        return res.status(400).json({ 
          error: "Job titles must be configured in Settings" 
        });
      }
      
      const jobTitles = jobTitlesSetting.value.split(",").map(t => t.trim()).filter(Boolean);
      
      if (jobTitles.length === 0) {
        return res.status(400).json({ 
          error: "At least one job title must be configured" 
        });
      }
      
      // Parse country code (JSearch uses single country, take first if multiple provided)
      let countryCode = "US"; // Default to US
      if (countryCodesSetting?.value) {
        const codes = countryCodesSetting.value.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
        if (codes.length > 0) {
          countryCode = codes[0]; // Use first country code
        }
      }
      
      // Parse date_posted (default to "week" if not set)
      const datePosted = datePostedSetting?.value || "week";
      
      // Map date_posted to postedAtMaxAgeDays for compatibility with scrapeJobs interface
      const datePostedToDays: Record<string, number> = {
        "today": 1,
        "3days": 3,
        "week": 7,
        "month": 30,
        "all": 365,
      };
      const postedAtMaxAgeDays = datePostedToDays[datePosted] || 7;
      
      const excludedKeywords = excludedKeywordsSetting?.value
        ? excludedKeywordsSetting.value.split(",").map(k => k.trim()).filter(Boolean)
        : [];
      
      // LinkedIn settings
      const linkedInTimePeriod = (linkedInTimePeriodSetting?.value || "both") as "24h" | "7d" | "both";
      const linkedInLocationFilter = linkedInLocationFilterSetting?.value || undefined;
      
      // Job search provider preference
      const jobSearchProviderPreference = (jobSearchProviderPreferenceSetting?.value || "auto") as "auto" | "jsearch" | "linkedin";
      console.log(`[Routes] Job search provider preference from settings: "${jobSearchProviderPreference}"`);
      
      // Import scraper (dynamic import to avoid loading issues)
      const { scrapeJobs } = await import("./scraper/index");
      
      // Start scraping (don't await - return immediately)
      const { activityLogger } = await import("./logger");
      await activityLogger.info("Job scraping started", { 
        jobTitles: jobTitles.length, 
        countryCode,
        datePosted,
        linkedInTimePeriod
      });
      
      scrapeJobs({
        jobTitles,
        countryCodes: [countryCode], // Pass as array for compatibility
        excludedKeywords,
        postedAtMaxAgeDays,
        locationFilter: linkedInLocationFilter,
        linkedInTimePeriod,
        jobSearchProviderPreference,
      }).then(async (results) => {
        const totalFound = results.reduce((sum, r) => sum + r.jobsFound, 0);
        const totalAdded = results.reduce((sum, r) => sum + r.jobsAdded, 0);
        console.log(`Scraping complete: ${totalAdded} new jobs added from ${totalFound} found`);
        
        await activityLogger.success(
          `Job scraping complete: ${totalAdded} new jobs added from ${totalFound} found`, 
          { results }
        );
      }).catch(async (error) => {
        console.error("Error in background scraping:", error);
        await activityLogger.error("Job scraping failed", { error: error instanceof Error ? error.message : "Unknown error" });
      });
      
      // Return immediately
      res.json({ 
        message: "Job scraping started in background",
        jobTitles: jobTitles.length,
        countryCode,
        datePosted,
      });
    } catch (error) {
      console.error("Error starting job scraping:", error);
      res.status(500).json({ 
        error: "Failed to start job scraping",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ============ ACTIVITY LOGS API ============
  
  // Get activity logs
  app.get("/api/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getActivityLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // ============ API USAGE API ============
  
  // Get API usage statistics
  app.get("/api/usage", async (req, res) => {
    try {
      const { getAPIUsage } = await import("./api-usage");
      const usage = await getAPIUsage();
      res.json(usage);
    } catch (error) {
      console.error("Error fetching API usage:", error);
      res.status(500).json({ error: "Failed to fetch API usage" });
    }
  });

  // ============ STATS API ============
  
  // Get dashboard statistics
  app.get("/api/stats", async (req, res) => {
    try {
      const jobs = await storage.getJobs();
      const resumes = await storage.getResumes();
      
      // Calculate stats
      const totalJobs = jobs.length;
      const appliedJobs = jobs.filter(j => j.status === "applied").length;
      const pendingJobs = jobs.filter(j => j.status === "pending").length;
      const rejectedJobs = jobs.filter(j => j.status === "rejected").length;
      const interviewJobs = jobs.filter(j => j.status === "interview").length;
      
      // Jobs from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayJobs = jobs.filter(j => {
        const jobDate = new Date(j.createdAt);
        return jobDate >= today;
      }).length;
      
      // High match jobs (>80%)
      const highMatchJobs = jobs.filter(j => j.matchScore && j.matchScore >= 80).length;
      
      // Interview rate (if we have applied jobs)
      const interviewRate = appliedJobs > 0 
        ? ((interviewJobs / appliedJobs) * 100).toFixed(1)
        : "0.0";
      
      // Calculate change from yesterday (simplified - just show today's count)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayJobs = jobs.filter(j => {
        const jobDate = new Date(j.createdAt);
        return jobDate >= yesterday && jobDate < today;
      }).length;
      
      // Calculate top missing skills from job tags
      // Tags contain missing keywords from ATS analysis
      const skillCounts = new Map<string, number>();
      jobs.forEach(job => {
        if (job.tags && Array.isArray(job.tags)) {
          job.tags.forEach(tag => {
            if (tag && tag.trim()) {
              const skill = tag.trim();
              skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
            }
          });
        }
      });
      
      // Sort by count and get top 5
      const topMissingSkills = Array.from(skillCounts.entries())
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      res.json({
        totalJobs,
        todayJobs,
        yesterdayJobs,
        appliedJobs,
        pendingJobs,
        rejectedJobs,
        interviewJobs,
        interviewRate: `${interviewRate}%`,
        highMatchJobs,
        totalResumes: resumes.length,
        topMissingSkills,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  return httpServer;
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import passport from "passport";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { insertResumeSchema, insertJobSchema, insertATSAnalysisSchema, insertUserSchema, jobs, type InsertJob, type Job } from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { parseResume } from "./parser/resume-parser";
import { unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { requireAuth } from "./auth/middleware";
import { getUserIdFromRequest, getUserFromRequest } from "./auth/helpers";
import { isAdmin, requireAdmin } from "./auth/admin";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============ AUTHENTICATION API ============
  
  // Check authentication status
  app.get("/api/auth/me", (req, res) => {
    // Debug logging
    console.log("[Auth Check] Session ID:", req.sessionID);
    console.log("[Auth Check] Is authenticated:", req.isAuthenticated());
    console.log("[Auth Check] User:", req.user ? "exists" : "null");
    console.log("[Auth Check] Session:", req.session ? "exists" : "null");
    
    if (req.isAuthenticated() && req.user) {
      // Don't send password hash
      const { password, ...userWithoutPassword } = req.user as any;
      res.json({ authenticated: true, user: userWithoutPassword });
    } else {
      console.log("[Auth Check] Not authenticated - returning false");
      res.json({ authenticated: false, user: null });
    }
  });
  
  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // Validate input
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      if (username.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const user = await storage.createUser({
        username,
        password: hashedPassword,
      });
      
      // Auto-login after registration
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to create session" });
        }
        
        const { password: _, ...userWithoutPassword } = user;
        res.json({ 
          success: true, 
          message: "User created successfully",
          user: userWithoutPassword,
          redirectToSettings: true // Flag to redirect to settings
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ 
        error: "Failed to register user",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Login
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ error: "Authentication error" });
      }
      
      if (!user) {
        return res.status(401).json({ 
          error: info?.message || "Invalid username or password" 
        });
      }
      
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[Login] Login error:", loginErr);
          return res.status(500).json({ error: "Failed to create session" });
        }
        
        console.log("[Login] User logged in, session ID:", req.sessionID);
        console.log("[Login] Is authenticated:", req.isAuthenticated());
        
        // Get actual cookie config from session
        const sessionConfig = req.session.cookie;
        console.log("[Login] Session cookie config:", {
          secure: sessionConfig.secure,
          httpOnly: sessionConfig.httpOnly,
          sameSite: sessionConfig.sameSite,
          maxAge: sessionConfig.maxAge,
        });
        
        // Ensure session is saved before sending response
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[Login] Session save error:", saveErr);
            return res.status(500).json({ error: "Failed to save session" });
          }
          
          console.log("[Login] Session saved successfully, session ID:", req.sessionID);
          console.log("[Login] Response headers will include Set-Cookie for session");
          
          const { password: _, ...userWithoutPassword } = user;
          
          // Don't manually set cookie - express-session handles it automatically
          // Manually setting it can cause conflicts
          res.json({ 
            success: true, 
            message: "Login successful",
            user: userWithoutPassword 
          });
        });
      });
    })(req, res, next);
  });
  
  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          return res.status(500).json({ error: "Failed to destroy session" });
        }
        res.clearCookie("connect.sid");
        res.json({ success: true, message: "Logged out successfully" });
      });
    });
  });
  
  // ============ RESUMES API ============
  
  // Get all resumes
  app.get("/api/resumes", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const resumes = await storage.getResumes(userId);
      res.json(resumes);
    } catch (error) {
      console.error("Error fetching resumes:", error);
      res.status(500).json({ error: "Failed to fetch resumes" });
    }
  });

  // Get single resume
  app.get("/api/resumes/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const resume = await storage.getResume(id, userId);
      
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
  app.post("/api/resumes", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const validatedData = insertResumeSchema.parse(req.body);
      const resume = await storage.createResume(validatedData, userId);
      
      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.success(`Resume "${resume.name}" created`, { resumeId: resume.id }, userId);
      
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
  app.patch("/api/resumes/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const partialSchema = insertResumeSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      
      const resume = await storage.updateResume(id, validatedData, userId);
      
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
  app.delete("/api/resumes/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const resume = await storage.getResume(id, userId);
      const deleted = await storage.deleteResume(id, userId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Resume not found" });
      }
      
      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.info(`Resume "${resume?.name || id}" deleted`, { resumeId: id }, userId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting resume:", error);
      res.status(500).json({ error: "Failed to delete resume" });
    }
  });

  // Upload resume file
  // Use absolute path for Railway compatibility
  const uploadDir = process.env.UPLOAD_DIR 
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve("./uploads/resumes");
  const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "10485760", 10); // 10MB default

  // Ensure upload directory exists (important for Railway deployments)
  if (!existsSync(uploadDir)) {
    try {
      await mkdir(uploadDir, { recursive: true });
      console.log(`[Upload] Created upload directory: ${uploadDir}`);
    } catch (error) {
      console.error(`[Upload] Failed to create upload directory: ${uploadDir}`, error);
      throw new Error(`Failed to create upload directory: ${uploadDir}`);
    }
  } else {
    console.log(`[Upload] Using existing upload directory: ${uploadDir}`);
  }

  const storageConfig = multer.diskStorage({
    destination: async (req, file, cb) => {
      // Ensure directory exists before saving (defensive check)
      if (!existsSync(uploadDir)) {
        try {
          await mkdir(uploadDir, { recursive: true });
        } catch (error) {
          return cb(new Error(`Failed to create upload directory: ${uploadDir}`));
        }
      }
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

  app.post("/api/resumes/upload", requireAuth, (req, res, next) => {
    // Handle multer errors (file size, file type, etc.)
    upload.single("file")(req, res, (err) => {
      if (err) {
        // Multer errors
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ 
              error: `File too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB` 
            });
          }
          return res.status(400).json({ error: err.message });
        }
        // Other upload errors (e.g., file type)
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { name } = req.body;
      if (!name) {
        // Clean up uploaded file
        await unlink(req.file.path);
        return res.status(400).json({ error: "Resume name is required" });
      }

      // Verify file exists before parsing
      if (!existsSync(req.file.path)) {
        console.error(`[Upload] File not found at path: ${req.file.path}`);
        await unlink(req.file.path).catch(() => {}); // Try to clean up if it exists
        return res.status(500).json({ 
          error: "Uploaded file not found on server",
          details: `Expected file at: ${req.file.path}`
        });
      }

      console.log(`[Upload] Parsing file: ${req.file.path} (exists: ${existsSync(req.file.path)})`);
      
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
      }, userId);

      // Optionally keep the file, or delete it after parsing
      // For now, we'll keep it in case we need it later
      // You can uncomment the line below to delete after parsing:
      // await unlink(req.file.path);

      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.success(`Resume "${resume.name}" uploaded and parsed`, { resumeId: resume.id, fileName: req.file.originalname }, userId);

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
      
      // Ensure we always return JSON, even on unexpected errors
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Failed to upload and parse resume", 
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  });

  // ============ JOBS API ============
  
  // Get all jobs (with optional filters)
  app.get("/api/jobs", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { status, minMatchScore, isApplied } = req.query;
      
      const filters: any = {};
      if (status) filters.status = status as string;
      if (minMatchScore) filters.minMatchScore = parseInt(minMatchScore as string);
      if (isApplied !== undefined) {
        filters.isApplied = isApplied === "true";
      }
      
      const jobs = await storage.getJobs(userId, filters);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get single job
  app.get("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id, userId);
      
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
  app.post("/api/jobs", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const validatedData = insertJobSchema.parse(req.body);
      const job = await storage.createJob(validatedData, userId);
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
  app.patch("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const partialSchema = insertJobSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      
      const job = await storage.updateJob(id, validatedData, userId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Log activity for status changes
      const { activityLogger } = await import("./logger");
      if (validatedData.status) {
        if (validatedData.status === "viewed") {
          await activityLogger.info(`Viewed link for "${job.title}" at ${job.company}`, { jobId: id }, userId);
        } else if (validatedData.status === "applied") {
          // Legacy support - treat as viewed
          await activityLogger.info(`Viewed link for "${job.title}" at ${job.company}`, { jobId: id }, userId);
        } else {
          await activityLogger.info(`Job "${job.title}" status updated to ${validatedData.status}`, { jobId: id, status: validatedData.status }, userId);
        }
      }
      
      // Log activity for applied status changes
      if (validatedData.isApplied !== undefined) {
        if (validatedData.isApplied === true) {
          await activityLogger.success(`Marked as applied: "${job.title}" at ${job.company}`, { jobId: id }, userId);
        } else {
          await activityLogger.info(`Unmarked as applied: "${job.title}" at ${job.company}`, { jobId: id }, userId);
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
  app.delete("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      
      // Get job details before deleting for activity log
      const job = await storage.getJob(id, userId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      const deleted = await storage.deleteJob(id, userId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Log the deletion
      const { activityLogger } = await import("./logger");
      await activityLogger.info(`Job deleted: "${job.title}" at ${job.company}`, { jobId: id }, userId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting job:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // ============ ATS ANALYSIS API ============
  
  // Analyze job description against resumes
  app.post("/api/ats/analyze", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { jobTitle, jobCompany, jobDescription, jobId } = req.body;
      
      if (!jobDescription) {
        return res.status(400).json({ error: "Job description is required" });
      }
      
      // If jobId is provided, verify the job exists and belongs to the user
      if (jobId) {
        const job = await storage.getJob(parseInt(jobId), userId);
        if (!job) {
          return res.status(404).json({ error: "Job not found" });
        }
      }

      // Get all resumes for this user
      const resumes = await storage.getResumes(userId);
      
      if (resumes.length === 0) {
        return res.status(400).json({ error: "No resumes found. Please upload at least one resume first." });
      }

      // Check if at least one AI API key is configured
      const perplexityKey = await storage.getSetting("perplexity_api_key", userId);
      const geminiKey = await storage.getSetting("gemini_api_key", userId);
      
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
          content: `
      You are an ATS + job-fit evaluation engine.
      
      You must analyze a job listing against multiple resumes and produce:
      - a weighted 0–100 match score,
      - the best resume ID,
      - missing keywords for the best resume,
      - actionable resume improvement suggestions.
      
      Scoring priorities (highest → lowest):
      1) Skills matching (dominant)
      2) Full-time status
      3) Date posted (recency)
      4) Lower experience required
      5) Pay rate
      6) Company & location
      
      Weights (total 100):
      - skills_match: 45
      - full_time_status: 20
      - date_posted: 15
      - experience_requirement: 10
      - pay_rate: 5
      - company_location: 5
      
      Rules:
      - Do not infer missing details. If missing/unclear, treat as "unknown" and score conservatively.
      - Skills matching is dominant:
        - If skills_match < 20/45, cap overall score at 49.
      - Recency cannot override a skills mismatch.
      - Deduct points for missing, unclear, or mismatched information.
      - Be consistent and repeatable.
      - Output JSON only, exactly matching the user-requested schema.
      `
        },
        {
          role: "user",
          content: `Analyze this job listing against the following resumes and provide:
      1. Which resume is the best match (provide ID and match score 0-100)
      2. Missing keywords from the best resume
      3. Specific actionable suggestions to improve the resume
      4. Match scores for all resumes
      
      Scoring must follow the weighted criteria:
      - skills_match (45), full_time_status (20), date_posted (15), experience_requirement (10), pay_rate (5), company_location (5)
      
      Rules:
      - Do not infer missing details (treat as "unknown")
      - If skills_match < 20/45, cap total score at 49
      - Be consistent and repeatable
      
      Job Listing (use structured fields first if present, then description):
      ${jobDescription}
      
      Resumes:
      ${resumes
        .map(
          r =>
            `ID: ${r.id}, Name: ${r.name}, Skills: ${r.skills.join(
              ", "
            )}, Experience: ${r.experience}, Content: ${r.rawContent.substring(0, 1000)}`
        )
        .join("\n\n")}
      
      Return your response as JSON in this exact format:
      {
        "bestResumeId": <number>,
        "matchScore": <number 0-100>,
        "missingKeywords": ["keyword1", "keyword2"],
        "suggestions": [
          { "title": "Suggestion title", "description": "Detailed suggestion", "type": "content" }
        ],
        "resumeComparisons": [
          { "resumeId": <number>, "resumeName": "Name", "score": <number> }
        ]
      }
      
      Constraints:
      - No extra keys
      - No extra text
      `
        }
      ];
      

      // Call AI with fallback (Perplexity first, then Gemini)
      const aiResult = await callAIWithFallback(messages, "sonar-pro", userId);
      
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
        jobId: jobId ? parseInt(jobId) : undefined,
        jobTitle: jobTitle || "Untitled Job",
        jobCompany: jobCompany || undefined,
        jobDescription,
        bestResumeId: analysisResult.bestResumeId,
        matchScore: analysisResult.matchScore,
        missingKeywords: analysisResult.missingKeywords || [],
        suggestions: analysisResult.suggestions || [],
        resumeComparisons: analysisResult.resumeComparisons || []
      }, userId);
      
      // If jobId was provided, update the job's match score and matched resume
      if (jobId) {
        await storage.updateJob(parseInt(jobId), {
          matchScore: analysisResult.matchScore,
          matchedResumeId: analysisResult.bestResumeId,
        }, userId);
      }

      // Log API usage
      const { logAPICall } = await import("./api-usage");
      await logAPICall("ATS Analysis", { analysisId: savedAnalysis.id }, userId);

      res.json(savedAnalysis);
    } catch (error) {
      console.error("Error during ATS analysis:", error);
      res.status(500).json({ error: "Failed to analyze job description" });
    }
  });

  // Get analysis history
  app.get("/api/ats/analyses", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const analyses = await storage.getATSAnalyses(userId, limit);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching analyses:", error);
      res.status(500).json({ error: "Failed to fetch analyses" });
    }
  });

  // Get single analysis by ID
  app.get("/api/ats/analyses/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseInt(req.params.id);
      const analysis = await storage.getATSAnalysis(id, userId);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching analysis:", error);
      res.status(500).json({ error: "Failed to fetch analysis" });
    }
  });

  // Get analysis by job ID
  app.get("/api/ats/analyses/job/:jobId", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const jobId = parseInt(req.params.jobId);
      const analysis = await storage.getATSAnalysisByJobId(jobId, userId);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found for this job" });
      }
      
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching analysis by job ID:", error);
      res.status(500).json({ error: "Failed to fetch analysis" });
    }
  });

  // ============ SETTINGS API ============
  
  // Get all settings
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const settings = await storage.getAllSettings(userId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Get single setting
  app.get("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const setting = await storage.getSetting(req.params.key, userId);
      
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
  app.post("/api/settings", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { key, value } = req.body;
      
      if (!key || value === undefined || value === null) {
        return res.status(400).json({ error: "Key and value are required" });
      }
      
      // Allow empty strings to clear settings (fallback to env vars)
      const setting = await storage.setSetting(key, String(value), userId);
      res.json(setting);
    } catch (error) {
      console.error("Error setting value:", error);
      res.status(500).json({ error: "Failed to set setting" });
    }
  });

  // ============ JOB INGESTION API ============
  
  /**
   * External job ingestion endpoint
   * 
   * Accepts jobs from external sources (e.g., n8n) and feeds them into the same
   * pipeline as internally scraped jobs (storage → auto-match → ATS analysis → notify).
   * 
   * Authentication: Requires x-neskiapply-ingest-key header matching INGEST_KEY env var
   * 
   * Payload: Single job object or array of job objects in n8n format:
   * {
   *   "id": "83e792a7592d5d3f",
   *   "positionName": "Associate Software Engineer",
   *   "company": "Capgemini",
   *   "location": "Mississauga, ON",
   *   "salary": "$60,000–$80,000 a year",
   *   "jobType": ["Permanent"],
   *   "postedAt": "3 days ago",
   *   "postingDateParsed": "2025-12-30T04:18:11.402Z",
   *   "description": "...",
   *   "url": "...",
   *   "externalApplyLink": "...",
   *   "isExpired": false
   * }
   * 
   * Query params:
   *   - userId: Required. User ID to associate jobs with
   * 
   * Response:
   * {
   *   "ok": true,
   *   "processed": <number>,
   *   "inserted": <number>,
   *   "updated": <number>,
   *   "skipped": <number>
   * }
   */
  app.post("/api/jobs/ingest", async (req, res) => {
    try {
      // Validate ingest key
      const ingestKey = req.headers["x-neskiapply-ingest-key"];
      const expectedKey = process.env.INGEST_KEY;
      
      if (!expectedKey) {
        console.error("[Ingest] INGEST_KEY environment variable not configured");
        return res.status(500).json({ 
          ok: false, 
          error: "Ingest endpoint not configured" 
        });
      }
      
      if (!ingestKey || ingestKey !== expectedKey) {
        console.warn("[Ingest] Invalid or missing ingest key");
        return res.status(401).json({ 
          ok: false, 
          error: "Invalid or missing ingest key" 
        });
      }
      
      // Get userId from query params
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ 
          ok: false, 
          error: "userId query parameter is required" 
        });
      }
      
      // Verify user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ 
          ok: false, 
          error: "User not found" 
        });
      }
      
      // Parse payload (single job or array)
      const payload = req.body;
      const jobs = Array.isArray(payload) ? payload : [payload];
      
      if (jobs.length === 0) {
        return res.status(400).json({ 
          ok: false, 
          error: "No jobs provided in payload" 
        });
      }
      
      let processed = 0;
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      
      // Helper function to infer source from URL
      // Returns format: "n8n (Indeed)" or "n8n (LinkedIn)" etc. to indicate it came via n8n
      const inferSource = (url: string | undefined | null): string => {
        if (!url) return "n8n";
        try {
          const domain = new URL(url).hostname.toLowerCase();
          if (domain.includes("indeed")) return "n8n (Indeed)";
          if (domain.includes("linkedin")) return "n8n (LinkedIn)";
          if (domain.includes("glassdoor")) return "n8n (Glassdoor)";
          if (domain.includes("monster")) return "n8n (Monster)";
          if (domain.includes("ziprecruiter")) return "n8n (ZipRecruiter)";
          return "n8n";
        } catch {
          return "n8n";
        }
      };
      
      // Helper function to format posted date
      const formatPostedDate = (postingDateParsed: string | undefined, postedAt: string | undefined): string | undefined => {
        if (postingDateParsed) {
          try {
            const date = new Date(postingDateParsed);
            if (!isNaN(date.getTime())) {
              return date.toLocaleDateString();
            }
          } catch {
            // Fall through to postedAt
          }
        }
        if (postedAt) {
          return postedAt.trim();
        }
        return undefined;
      };
      
      // Helper function to clamp text field length
      const clampText = (text: string | undefined | null, maxLength: number = 50000): string => {
        if (!text) return "";
        const trimmed = text.trim();
        return trimmed.length > maxLength ? trimmed.substring(0, maxLength) : trimmed;
      };
      
      // Process each job
      for (const jobData of jobs) {
        try {
          // Skip expired jobs
          if (jobData.isExpired === true) {
            skipped++;
            continue;
          }
          
          // Map n8n format to internal format
          const externalId = jobData.id ? `n8n_${jobData.id}` : undefined;
          const title = (jobData.positionName || "").trim();
          const company = (jobData.company || "").trim();
          const location = (jobData.location || "unknown").trim();
          const salary = jobData.salary ? (jobData.salary.trim() || null) : null;
          const description = clampText(jobData.description, 50000);
          const postedDate = formatPostedDate(jobData.postingDateParsed, jobData.postedAt);
          const url = (jobData.url || jobData.externalApplyLink || null)?.trim() || null;
          const source = inferSource(url);
          
          // Validate required fields
          if (!title || !company || !description) {
            console.warn(`[Ingest] Skipping job with missing required fields: ${JSON.stringify({ title, company, hasDescription: !!description })}`);
            skipped++;
            continue;
          }
          
          // Build InsertJob object (userId is added by storage layer, not included here)
          const insertJob = {
            externalId: externalId || undefined, // Ensure null becomes undefined
            title,
            company,
            location,
            salary: salary || null,
            description,
            requirements: undefined, // n8n doesn't provide this separately
            postedDate: postedDate || undefined,
            source,
            url: url || null,
            status: "pending",
            // Don't set matchScore, matchedResumeId, matchReasoning, or tags
            // These will be set by the matching pipeline
          } as InsertJob;
          
          // Use existing upsert mechanism (same as JSearch scraper)
          // This handles both insert and update automatically
          const savedJob = await storage.upsertJobByExternalId(insertJob, userId);
          
          // For simplicity, we'll count all as inserted (upsert handles duplicates)
          // In practice, if externalId matches, it updates; otherwise inserts
          inserted++;
          
          // Always trigger auto-matching for new jobs
          // (matching is idempotent, so safe to call on updates too)
          import("./matcher/job-matcher").then(({ matchAndUpdateJob }) => {
            matchAndUpdateJob(savedJob.id, userId).catch(err => 
              console.error(`[Ingest] Error auto-matching job ${savedJob.id}:`, err)
            );
          });
          
          processed++;
        } catch (error) {
          console.error(`[Ingest] Error processing job:`, error);
          skipped++;
        }
      }
      
      // Log activity
      const { activityLogger } = await import("./logger");
      if (inserted > 0 || updated > 0) {
        await activityLogger.success(
          `n8n job ingestion: ${inserted} new jobs added, ${updated} updated`,
          { inserted, updated, skipped, processed, source: "n8n" },
          userId
        );
      } else if (skipped > 0) {
        await activityLogger.info(
          `n8n job ingestion: ${skipped} jobs skipped (duplicates or expired)`,
          { inserted, updated, skipped, processed, source: "n8n" },
          userId
        );
      }
      
      res.json({
        ok: true,
        processed,
        inserted,
        updated,
        skipped,
      });
    } catch (error) {
      console.error("[Ingest] Error in ingestion endpoint:", error);
      res.status(500).json({
        ok: false,
        error: "Failed to ingest jobs",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ============ JOB SCRAPING API ============
  
  // Trigger daily cron job manually
  app.post("/api/jobs/trigger-cron", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { executeDailyScraping } = await import("./cron/index");
      
      // Execute the cron job logic immediately
      const result = await executeDailyScraping(userId);
      
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
  app.post("/api/jobs/match", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      // Import matcher (dynamic import to avoid loading issues)
      const { matchAllPendingJobs } = await import("./matcher/job-matcher");
      
      // Start matching (don't await - return immediately)
      const { activityLogger } = await import("./logger");
      await activityLogger.info("Job matching started for all pending jobs", undefined, userId);
      
      matchAllPendingJobs(userId).then(async (result) => {
        console.log(`Job matching complete: ${result.matched} matched, ${result.failed} failed out of ${result.total} total`);
        await activityLogger.success(
          `Job matching complete: ${result.matched} matched, ${result.failed} failed`,
          { matched: result.matched, failed: result.failed, total: result.total },
          userId
        );
      }).catch(async (error) => {
        console.error("Error in background job matching:", error);
        await activityLogger.error("Job matching failed", { error: error instanceof Error ? error.message : "Unknown error" }, userId);
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
  app.post("/api/jobs/sync", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      // Get search parameters from settings (matching JSearch API format)
      const jobTitlesSetting = await storage.getSetting("job_titles", userId);
      const countryCodesSetting = await storage.getSetting("country_codes", userId);
      const datePostedSetting = await storage.getSetting("date_posted", userId);
      const excludedKeywordsSetting = await storage.getSetting("excluded_keywords", userId);
      const workFromHomeSetting = await storage.getSetting("work_from_home", userId);
      const employmentTypesSetting = await storage.getSetting("employment_types", userId);
      const jsearchLanguageSetting = await storage.getSetting("jsearch_language", userId);
      const jsearchJobRequirementsSetting = await storage.getSetting("jsearch_job_requirements", userId);
      const jsearchRadiusSetting = await storage.getSetting("jsearch_radius", userId);
      const jsearchExcludeJobPublishersSetting = await storage.getSetting("jsearch_exclude_job_publishers", userId);
      
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
      
      // Parse JSearch-specific parameters
      const workFromHome = workFromHomeSetting?.value === "true";
      const employmentTypes = employmentTypesSetting?.value || undefined;
      const language = jsearchLanguageSetting?.value || undefined;
      const jobRequirements = jsearchJobRequirementsSetting?.value || undefined;
      const radius = jsearchRadiusSetting?.value ? parseInt(jsearchRadiusSetting.value) : undefined;
      const excludeJobPublishers = jsearchExcludeJobPublishersSetting?.value || undefined;
      
      // Import scraper (dynamic import to avoid loading issues)
      const { scrapeJobs } = await import("./scraper/index");
      
      // Start scraping (don't await - return immediately)
      const { activityLogger } = await import("./logger");
      await activityLogger.info("Job scraping started", { 
        jobTitles: jobTitles.length, 
        countryCode,
        datePosted
      }, userId);
      
      scrapeJobs({
        jobTitles,
        countryCodes: [countryCode], // Pass as array for compatibility
        excludedKeywords,
        postedAtMaxAgeDays,
        workFromHome,
        employmentTypes,
        language,
        jobRequirements,
        radius,
        excludeJobPublishers,
        userId, // Pass userId to scraper
      }).then(async (results) => {
        const totalFound = results.reduce((sum, r) => sum + r.jobsFound, 0);
        const totalAdded = results.reduce((sum, r) => sum + r.jobsAdded, 0);
        console.log(`Scraping complete: ${totalAdded} new jobs added from ${totalFound} found`);
        
        await activityLogger.success(
          `Job scraping complete: ${totalAdded} new jobs added from ${totalFound} found`, 
          { results },
          userId
        );
      }).catch(async (error) => {
        console.error("Error in background scraping:", error);
        await activityLogger.error("Job scraping failed", { error: error instanceof Error ? error.message : "Unknown error" }, userId);
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
  
  // Get activity logs (user-specific, or all if admin)
  app.get("/api/activity", requireAuth, async (req, res) => {
    try {
      const user = getUserFromRequest(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      
      // If user is admin, get all logs; otherwise get only their logs
      let logs;
      if (isAdmin(user)) {
        logs = await storage.getAllActivityLogs(limit);
      } else {
        const userId = getUserIdFromRequest(req);
        logs = await storage.getActivityLogs(userId, limit);
      }
      
      // If admin, enrich logs with user information
      if (isAdmin(user) && logs.length > 0) {
        const userIds = [...new Set(logs.map(log => log.userId))];
        const usersMap = new Map();
        
        // Fetch user info for all unique user IDs
        for (const uid of userIds) {
          const userInfo = await storage.getUser(uid);
          if (userInfo) {
            usersMap.set(uid, { id: userInfo.id, username: userInfo.username });
          }
        }
        
        // Add user info to each log
        const enrichedLogs = logs.map(log => ({
          ...log,
          user: usersMap.get(log.userId) || { id: log.userId, username: "Unknown" },
        }));
        
        res.json(enrichedLogs);
      } else {
        res.json(logs);
      }
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // ============ ADMIN API ============
  
  // Get current user ID (for ingest endpoint setup)
  app.get("/api/user/id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      res.json({ userId });
    } catch (error) {
      console.error("Error getting user ID:", error);
      res.status(500).json({ error: "Failed to get user ID" });
    }
  });
  
  // Get all users (admin only)
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Don't send password hashes to frontend
      const safeUsers = users.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // ============ API USAGE API ============
  
  // Get API usage statistics
  app.get("/api/usage", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const { getAPIUsage } = await import("./api-usage");
      const usage = await getAPIUsage(userId);
      res.json(usage);
    } catch (error) {
      console.error("Error fetching API usage:", error);
      res.status(500).json({ error: "Failed to fetch API usage" });
    }
  });

  // Check if required settings are configured
  app.get("/api/settings/check-required", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      const perplexityKey = await storage.getSetting("perplexity_api_key", userId);
      const geminiKey = await storage.getSetting("gemini_api_key", userId);
      const discordWebhook = await storage.getSetting("discord_webhook", userId);
      
      const missing: string[] = [];
      if (!perplexityKey?.value && !geminiKey?.value) {
        missing.push("At least one AI API key (Perplexity or Gemini)");
      }
      if (!discordWebhook?.value) {
        missing.push("Discord webhook URL");
      }
      
      res.json({
        configured: missing.length === 0,
        missing,
        hasPerplexity: !!perplexityKey?.value,
        hasGemini: !!geminiKey?.value,
        hasDiscord: !!discordWebhook?.value,
      });
    } catch (error) {
      console.error("Error checking required settings:", error);
      res.status(500).json({ error: "Failed to check required settings" });
    }
  });

  // ============ STATS API ============
  
  // Get dashboard statistics
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const jobs = await storage.getJobs(userId);
      const resumes = await storage.getResumes(userId);
      
      // Calculate stats
      const totalJobs = jobs.length;
      const linksViewed = jobs.filter(j => j.status === "viewed" || j.status === "applied").length; // Count both "viewed" and legacy "applied" as viewed
      const appliedJobs = jobs.filter(j => j.isApplied === true).length; // Count jobs actually marked as applied
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
      
      // Response rate (interviews / applied)
      const responseRate = appliedJobs > 0
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
        linksViewed, // Links that have been viewed
        appliedJobs, // Jobs actually marked as applied (isApplied = true)
        pendingJobs,
        rejectedJobs,
        interviewJobs,
        interviewRate: `${interviewRate}%`,
        responseRate: `${responseRate}%`,
        highMatchJobs,
        totalResumes: resumes.length,
        topMissingSkills,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Reschedule cron job (called when cron settings change)
  app.post("/api/cron/reschedule", async (req, res) => {
    try {
      const { rescheduleDailyScraping, rescheduleReminderCron } = await import("./cron/index");
      await rescheduleDailyScraping();
      await rescheduleReminderCron();
      res.json({ 
        success: true, 
        message: "Cron jobs rescheduled successfully" 
      });
    } catch (error) {
      console.error("Error rescheduling cron job:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to reschedule cron job",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test daily reminder
  app.post("/api/reminder/test", requireAuth, async (req, res) => {
    // Ensure we always send a JSON response
    res.setHeader("Content-Type", "application/json");
    
    try {
      const userId = getUserIdFromRequest(req);
      console.log("[Reminder Test] Route hit - Starting reminder test...");
      
      // Check if reminders are enabled
      const reminderEnabled = await storage.getSetting("reminder_enabled", userId);
      if (!reminderEnabled || reminderEnabled.value !== "true") {
        res.status(400).json({ 
          success: false, 
          error: "Reminders are not enabled. Enable reminders in Settings first." 
        });
        return;
      }

      // Check if Discord notifications are enabled
      const discordEnabled = await storage.getSetting("discord_notifications", userId);
      if (!discordEnabled || discordEnabled.value !== "true") {
        res.status(400).json({ 
          success: false, 
          error: "Discord notifications are not enabled. Enable Discord notifications in Settings first." 
        });
        return;
      }

      // Get all unapplied jobs
      const allJobs = await storage.getJobs(userId, { isApplied: false });
      
      // Filter out rejected jobs
      const unappliedJobs = allJobs.filter(j => j.status !== "rejected");
      
      // Get reminder threshold (default: 70%)
      const reminderThresholdSetting = await storage.getSetting("reminder_match_threshold", userId);
      const reminderThreshold = reminderThresholdSetting ? parseInt(reminderThresholdSetting.value, 10) : 70;
      
      // Count high priority unapplied jobs
      const highPriorityJobs = unappliedJobs.filter(j => j.matchScore && j.matchScore >= reminderThreshold);
      
      // Send test reminder
      const { sendApplyReminder } = await import("./discord");
      
      try {
        const success = await sendApplyReminder(userId, unappliedJobs.length, highPriorityJobs.length);
        
        if (success) {
          console.log("[Reminder Test] Success - reminder sent");
          res.json({ 
            success: true, 
            message: `Reminder test sent successfully! Found ${unappliedJobs.length} unapplied jobs (${highPriorityJobs.length} high priority).` 
          });
          return;
        } else {
          console.log("[Reminder Test] Failed - sendApplyReminder returned false");
          res.status(400).json({ 
            success: false, 
            error: "Failed to send reminder. Check your Discord webhook URL and notification settings." 
          });
          return;
        }
      } catch (reminderError) {
        console.error("[Reminder Test] Error in sendApplyReminder:", reminderError);
        const errorMessage = reminderError instanceof Error ? reminderError.message : "Unknown error";
        res.status(400).json({ 
          success: false,
          error: errorMessage,
          message: errorMessage
        });
        return;
      }
    } catch (error) {
      console.error("[Reminder Test] Unexpected error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        success: false,
        error: errorMessage,
        message: `Failed to test reminder: ${errorMessage}`
      });
      return;
    }
  });

  // Test Discord webhook
  app.post("/api/discord/test", requireAuth, async (req, res) => {
    // Ensure we always send a JSON response
    res.setHeader("Content-Type", "application/json");
    
    try {
      const userId = getUserIdFromRequest(req);
      console.log("[Discord Test] Route hit - Starting Discord webhook test...");
      const { sendTestNotification } = await import("./discord");
      
      try {
        const success = await sendTestNotification(userId);
        
        if (success) {
          console.log("[Discord Test] Success - notification sent");
          res.json({ 
            success: true, 
            message: "Discord webhook test notification sent successfully!" 
          });
          return;
        } else {
          console.log("[Discord Test] Failed - sendTestNotification returned false");
          res.status(400).json({ 
            success: false, 
            error: "Failed to send Discord notification. Check your webhook URL and notification settings." 
          });
          return;
        }
      } catch (discordError) {
        console.error("[Discord Test] Error in sendTestNotification:", discordError);
        const errorMessage = discordError instanceof Error ? discordError.message : "Unknown error";
        res.status(400).json({ 
          success: false,
          error: errorMessage,
          message: errorMessage
        });
        return;
      }
    } catch (error) {
      console.error("[Discord Test] Unexpected error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ 
        success: false,
        error: errorMessage,
        message: `Failed to test Discord webhook: ${errorMessage}`
      });
      return;
    }
  });

  return httpServer;
}

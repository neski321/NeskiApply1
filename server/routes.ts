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
import { unlink, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { requireAuth } from "./auth/middleware";
import { getUserIdFromRequest, getUserFromRequest } from "./auth/helpers";
import { isAdmin, requireAdmin } from "./auth/admin";

// Security: Helper function to safely parse and validate integer parameters
function parseIdParam(param: string | undefined, paramName: string = "id"): number | null {
  if (!param) return null;
  const parsed = parseInt(param, 10);
  if (isNaN(parsed) || parsed < 1) return null;
  return parsed;
}

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

  // Request password reset
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      // Find user by username
      let user;
      try {
        user = await storage.getUserByUsername(username);
      } catch (dbError) {
        console.error("Database error in forgot-password:", dbError);
        // If it's a table doesn't exist error, return a helpful message
        if (dbError instanceof Error && dbError.message.includes("does not exist")) {
          return res.status(500).json({ 
            error: "Database table not found. Please run database migrations.",
            message: "The password reset feature requires a database migration. Please contact support."
          });
        }
        throw dbError;
      }
      
      // Always return success (don't reveal if user exists for security)
      if (!user) {
        return res.json({ 
          success: true, 
          message: "If an account with that username exists, a password reset link has been sent." 
        });
      }

      // Generate reset token
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

      // Save token to database
      try {
        await storage.createPasswordResetToken({
          userId: user.id,
          token,
          expiresAt,
          used: false,
        });
      } catch (dbError) {
        console.error("Database error creating password reset token:", dbError);
        // If it's a table doesn't exist error, return a helpful message
        if (dbError instanceof Error && (
          dbError.message.includes("does not exist") || 
          dbError.message.includes("relation") ||
          dbError.message.includes("table")
        )) {
          return res.status(500).json({ 
            error: "Database table not found",
            message: "The password reset feature requires a database migration. Please run 'npm run db:push' to create the required table."
          });
        }
        throw dbError;
      }

      // In a real app, you would send an email here with the reset link
      // For now, we'll return the token in the response (for development/testing)
      // In production, remove the token from the response and send it via email
      const resetUrl = `${req.protocol}://${req.get("host")}/reset-password?token=${token}`;
      
      console.log(`[Password Reset] Reset link for user ${username}: ${resetUrl}`);
      
      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.info(
        "Password reset requested",
        { userId: user.id, username: user.username },
        user.id
      );

      res.json({ 
        success: true, 
        message: "If an account with that username exists, a password reset link has been sent.",
        // Remove this in production - only for development
        resetUrl: process.env.NODE_ENV === "development" ? resetUrl : undefined
      });
    } catch (error) {
      console.error("Error requesting password reset:", error);
      res.status(500).json({ 
        error: "Failed to process password reset request",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Find token
      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      // Check if token is used
      if (resetToken.used) {
        return res.status(400).json({ error: "This reset token has already been used" });
      }

      // Check if token is expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ error: "This reset token has expired" });
      }

      // Hash new password
      const bcrypt = await import("bcrypt");
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user password
      const updatedUser = await storage.updateUserPassword(resetToken.userId, hashedPassword);
      
      if (!updatedUser) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      // Mark token as used
      await storage.markPasswordResetTokenAsUsed(token);

      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.info(
        "Password reset completed",
        { userId: updatedUser.id, username: updatedUser.username },
        updatedUser.id
      );

      res.json({ 
        success: true, 
        message: "Password has been reset successfully. You can now log in with your new password." 
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ 
        error: "Failed to reset password",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
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
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid resume ID" });
      }
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
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid resume ID" });
      }
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
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid resume ID" });
      }
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

  // Security: Validate file content by checking magic numbers (file signatures)
  // Note: PDF support removed - only DOC/DOCX/TXT are supported
  const validateFileContent = async (filePath: string, expectedExt: string): Promise<boolean> => {
    try {
      const buffer = await readFile(filePath);
      const fileSignature = buffer.slice(0, 8); // Read first 8 bytes
      
      // DOCX magic number: PK (ZIP format) - DOCX is a ZIP file
      if (expectedExt === ".docx") {
        const zipSignature = Buffer.from("PK");
        return fileSignature.slice(0, 2).equals(zipSignature);
      }
      
      // DOC magic number: D0 CF 11 E0 A1 B1 1A E1 (OLE2 format)
      if (expectedExt === ".doc") {
        const docSignature = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
        return fileSignature.equals(docSignature);
      }
      
      // TXT files - no specific magic number, accept any text-like content
      if (expectedExt === ".txt") {
        // Check if file contains mostly printable ASCII/UTF-8 characters
        const textSample = buffer.slice(0, Math.min(512, buffer.length));
        const isText = textSample.every(byte => 
          (byte >= 0x20 && byte <= 0x7E) || // Printable ASCII
          byte === 0x09 || // Tab
          byte === 0x0A || // Newline
          byte === 0x0D || // Carriage return
          (byte >= 0xC0 && byte <= 0xDF) || // UTF-8 start bytes
          (byte >= 0x80 && byte <= 0xBF) // UTF-8 continuation bytes
        );
        return isText;
      }
      
      return false;
    } catch (error) {
      console.error("Error validating file content:", error);
      return false;
    }
  };

  const upload = multer({
    storage: storageConfig,
    limits: {
      fileSize: maxFileSize,
    },
    fileFilter: (req, file, cb) => {
      const allowedExts = [".docx", ".doc", ".txt"];
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

      // Security: Validate file content matches extension
      const ext = path.extname(req.file.originalname).toLowerCase();
      const isValidContent = await validateFileContent(req.file.path, ext);
      
      if (!isValidContent) {
        // Clean up uploaded file
        await unlink(req.file.path);
        return res.status(400).json({ 
          error: "File content does not match file type. The file may be corrupted or malicious." 
        });
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
        technicalSkillsSection: parsed.technicalSkillsSection || null,
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
      
      // Add optimized resume indicator for each job
      const jobsWithOptimizedInfo = await Promise.all(jobs.map(async (job) => {
        const optimizedResumes = await storage.getOptimizedResumes(userId, job.id);
        return {
          ...job,
          hasOptimizedResume: optimizedResumes.length > 0,
          optimizedResumeCount: optimizedResumes.length
        };
      }));
      
      res.json(jobsWithOptimizedInfo);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get count of unscanned jobs (jobs without match scores) - MUST be before /api/jobs/:id
  app.get("/api/jobs/unscanned-count", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const allJobs = await storage.getJobs(userId);
      const unscannedJobs = allJobs.filter(j => j.matchScore === null || j.matchScore === undefined);
      
      res.json({
        count: unscannedJobs.length,
        jobs: unscannedJobs.map(j => ({ id: j.id, title: j.title, company: j.company, createdAt: j.createdAt }))
      });
    } catch (error) {
      console.error("Error getting unscanned jobs count:", error);
      res.status(500).json({ error: "Failed to get unscanned jobs count" });
    }
  });

  // Get count of zero-score jobs (jobs with matchScore === 0) - MUST be before /api/jobs/:id
  app.get("/api/jobs/zero-score-count", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const allJobs = await storage.getJobs(userId);
      // Filter for jobs with matchScore exactly equal to 0 (not null/undefined)
      const zeroScoreJobs = allJobs.filter(j => j.matchScore !== null && j.matchScore !== undefined && j.matchScore === 0);
      
      console.log(`[Zero Score Count] Total jobs: ${allJobs.length}, Zero-score jobs: ${zeroScoreJobs.length}`);
      
      res.json({
        count: zeroScoreJobs.length,
        jobs: zeroScoreJobs.map(j => ({ id: j.id, title: j.title, company: j.company, createdAt: j.createdAt }))
      });
    } catch (error) {
      console.error("Error getting zero-score jobs count:", error);
      res.status(500).json({ error: "Failed to get zero-score jobs count" });
    }
  });

  // Get single job
  app.get("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Validate ID parameter
      if (!req.params.id) {
        return res.status(400).json({ error: "Job ID is required" });
      }
      
      const id = parseIdParam(req.params.id);
      if (!id) {
        console.warn(`[Get Job] Invalid job ID provided: "${req.params.id}"`);
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
      const job = await storage.getJob(id, userId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Add optimized resume indicator
      const optimizedResumes = await storage.getOptimizedResumes(userId, id);
      const jobWithOptimizedInfo = {
        ...job,
        hasOptimizedResume: optimizedResumes.length > 0,
        optimizedResumeCount: optimizedResumes.length
      };
      
      res.json(jobWithOptimizedInfo);
    } catch (error) {
      console.error("Error fetching job:", error);
      // Check if it's the NaN error and provide a better message
      if (error instanceof Error && error.message.includes("NaN")) {
        console.error(`[Get Job] NaN error detected - req.params.id was: "${req.params?.id}"`);
        return res.status(400).json({ error: "Invalid job ID format" });
      }
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
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      const partialSchema = insertJobSchema.partial();
      const validatedData = partialSchema.parse(req.body);
      
      // Set appliedAt timestamp when marking as applied
      if (validatedData.isApplied === true) {
        validatedData.appliedAt = new Date();
      } else if (validatedData.isApplied === false) {
        validatedData.appliedAt = null;
      }
      
      const job = await storage.updateJob(id, validatedData, userId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Check for optimized resumes if marking as applied
      let optimizedResumes = [];
      if (validatedData.isApplied === true) {
        optimizedResumes = await storage.getOptimizedResumes(userId, id);
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
      
      // Log activity for interview status changes
      if (validatedData.gotInterview !== undefined) {
        if (validatedData.gotInterview === true) {
          await activityLogger.success(`Got interview: "${job.title}" at ${job.company}`, { jobId: id }, userId);
        } else {
          await activityLogger.info(`Removed interview status: "${job.title}" at ${job.company}`, { jobId: id }, userId);
        }
      }
      
      // Log activity for rejection status changes
      if (validatedData.rejected !== undefined) {
        if (validatedData.rejected === true) {
          await activityLogger.info(`Marked as rejected: "${job.title}" at ${job.company}`, { jobId: id }, userId);
        } else {
          await activityLogger.info(`Removed rejection status: "${job.title}" at ${job.company}`, { jobId: id }, userId);
        }
      }
      
      // Include optimized resumes info if marking as applied
      const response: any = { ...job };
      if (validatedData.isApplied === true && optimizedResumes.length > 0) {
        response.hasOptimizedResumes = true;
        response.optimizedResumesCount = optimizedResumes.length;
      }
      
      res.json(response);
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
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
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
      const { jobTitle, jobCompany, jobDescription, jobId, aiProvider } = req.body;
      
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
      const openrouterKey = await storage.getSetting("openrouter_api_key", userId);
      
      if ((!perplexityKey || !perplexityKey.value) && 
          (!geminiKey || !geminiKey.value) && 
          (!openrouterKey || !openrouterKey.value)) {
        return res.status(400).json({ 
          error: "No AI API key configured. Please add at least one (Perplexity, Gemini, or OpenRouter) in Settings." 
        });
      }

      // Import AI service with fallback and usage tracking
      const { callAIWithFallback } = await import("./ai-service");
      const { getAPIUsage } = await import("./api-usage");
      const { activityLogger } = await import("./logger");
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
      

      // Get user's provider preference or use override
      const providerPreference = await storage.getSetting("ai_provider_preference", userId);
      let preference = aiProvider || providerPreference?.value || "auto";
      
      // Check API usage before processing
      const usage = await getAPIUsage(userId);
      
      // Determine which providers might be used
      let willUsePerplexity = false;
      let willUseGemini = false;
      let willUseOpenRouter = false;
      
      if (preference === "auto" || preference === "perplexity,gemini,openrouter") {
        willUsePerplexity = true;
        willUseGemini = true;
        willUseOpenRouter = true;
      } else {
        const providers = preference.split(",").map(p => p.trim());
        willUsePerplexity = providers.includes("perplexity");
        willUseGemini = providers.includes("gemini");
        willUseOpenRouter = providers.includes("openrouter");
      }
      
      // Check daily limits - if primary providers hit limit, switch to OpenRouter
      const perplexityDailyLimit = willUsePerplexity && 
        usage.providers.perplexity.dailyCount >= usage.providers.perplexity.dailyLimit;
      const geminiDailyLimit = willUseGemini && 
        usage.providers.gemini.dailyCount >= usage.providers.gemini.dailyLimit;
      const openrouterDailyLimit = willUseOpenRouter && 
        usage.providers.openrouter.dailyCount >= usage.providers.openrouter.dailyLimit;
      
      // If primary providers hit daily limit, automatically switch to OpenRouter if available
      if ((perplexityDailyLimit || geminiDailyLimit) && !openrouterDailyLimit && willUseOpenRouter) {
        console.log(`[ATS Analyzer] Primary providers (Perplexity/Gemini) at daily limit, switching to OpenRouter...`);
        preference = "openrouter";
        await activityLogger.info(
          "ATS Analysis: Switched to OpenRouter due to daily limit on primary providers",
          { originalPreference: aiProvider || providerPreference?.value, switchedTo: "openrouter" },
          userId
        );
      }
      
      // Call AI with fallback (Perplexity → Gemini → OpenRouter)
      // Support both single providers and comma-separated combinations
      const providerOverride = preference;
      let aiResult;
      let retryCount = 0;
      const MAX_RETRIES = 2; // Allow one retry with fallback
      
      while (retryCount <= MAX_RETRIES) {
        try {
          aiResult = await callAIWithFallback(messages, "sonar-pro", userId, providerOverride);
          
          if (aiResult) {
            break; // Success, exit retry loop
          }
          
          // If no result and we haven't tried OpenRouter yet, switch to it
          if (retryCount === 0 && !openrouterDailyLimit && willUseOpenRouter && preference !== "openrouter") {
            console.log(`[ATS Analyzer] Primary providers failed, retrying with OpenRouter...`);
            preference = "openrouter";
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Brief delay before retry
            continue;
          }
          
          // If still no result after retries, break
          break;
        } catch (error: any) {
          // Check if it's a 401/unauthorized error
          const isUnauthorized = error?.message?.includes("unauthorized") || 
                                error?.message?.includes("invalid") || 
                                error?.message?.includes("401") ||
                                error?.status === 401;
          
          if (isUnauthorized) {
            // Log the error (already logged in ai-service, but log here for context)
            await activityLogger.warning(
              "ATS Analysis: API key authorization error, attempting fallback",
              { provider: providerOverride, error: error?.message },
              userId
            );
            
            // If we haven't tried OpenRouter yet, switch to it
            if (retryCount === 0 && !openrouterDailyLimit && willUseOpenRouter && preference !== "openrouter") {
              console.log(`[ATS Analyzer] 401 error with ${providerOverride}, switching to OpenRouter...`);
              preference = "openrouter";
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 2000)); // Brief delay before retry
              continue;
            } else {
              // All providers failed or already tried OpenRouter
              return res.status(401).json({ 
                error: error.message || "API key is invalid or unauthorized. Please check your API key in Settings." 
              });
            }
          }
          
          // For other errors, re-throw
          throw error;
        }
      }
      
      if (!aiResult) {
        // Determine which provider was requested to give a more specific error
        const requestedProvider = aiProvider || providerPreference?.value || "auto";
        let errorMessage = "No response from AI service. Please check your API keys and try again.";
        
        if (requestedProvider === "perplexity") {
          errorMessage = "Perplexity API failed. Please check your Perplexity API key in Settings.";
        } else if (requestedProvider === "gemini") {
          errorMessage = "Gemini API failed. Please check your Gemini API key in Settings.";
        } else if (requestedProvider === "openrouter") {
          errorMessage = "OpenRouter API failed. Please check your OpenRouter API key in Settings.";
        }
        
        return res.status(500).json({ 
          error: errorMessage
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
        resumeComparisons: analysisResult.resumeComparisons || [],
        aiProvider: provider || undefined,
        aiModel: aiResult.model || undefined
      }, userId);
      
      // If jobId was provided, update the job's match score and matched resume
      if (jobId) {
        await storage.updateJob(parseInt(jobId), {
          matchScore: analysisResult.matchScore,
          matchedResumeId: analysisResult.bestResumeId,
        }, userId);
      }

      // Log API usage (provider is already logged in ai-service)
      // We don't need to log again here as it's already logged with provider

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
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid analysis ID" });
      }
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

  // Get analysis by job ID (latest one)
  app.get("/api/ats/analyses/job/:jobId", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const jobId = parseIdParam(req.params.jobId);
      if (!jobId) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
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

  // Get all analyses by job ID
  app.get("/api/ats/analyses/job/:jobId/all", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const jobId = parseIdParam(req.params.jobId);
      if (!jobId) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
      const analyses = await storage.getAllAnalysesByJobId(jobId, userId);
      console.log(`[Analyses] Found ${analyses.length} analyses for job ${jobId} (userId: ${userId})`);
      if (analyses.length > 0) {
        console.log(`[Analyses] Analysis IDs: ${analyses.map(a => a.id).join(", ")}`);
        console.log(`[Analyses] Analysis jobIds: ${analyses.map(a => a.jobId).join(", ")}`);
      }
      
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching all analyses by job ID:", error);
      res.status(500).json({ error: "Failed to fetch analyses" });
    }
  });

  // Delete ATS analysis
  app.delete("/api/ats/analyses/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid analysis ID" });
      }
      
      // Get analysis details before deleting for activity log
      const analysis = await storage.getATSAnalysis(id, userId);
      
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      
      const deleted = await storage.deleteATSAnalysis(id, userId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      
      // Log the deletion
      const { activityLogger } = await import("./logger");
      await activityLogger.info(
        `Analysis deleted for "${analysis.jobTitle}" at ${analysis.jobCompany || "Unknown"}`,
        { analysisId: id, jobId: analysis.jobId },
        userId
      );
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting analysis:", error);
      res.status(500).json({ error: "Failed to delete analysis" });
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
      const jobsToMatch: Array<{ id: number; title: string }> = []; // Queue jobs for sequential matching
      
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
          // This handles both insert and update automatically with duplicate detection
          // Duplicate detection: First by externalId, then by URL+title+company if externalId is missing
          const { job: savedJob, wasInserted } = await storage.upsertJobByExternalId(insertJob, userId);
          
          // Track inserts vs updates properly
          if (wasInserted) {
            inserted++;
            // Queue job for sequential matching (to avoid rate limits)
            jobsToMatch.push({ id: savedJob.id, title: savedJob.title });
          } else {
            updated++;
            // Skip auto-matching for updates (job already matched previously)
          }
          
          processed++;
        } catch (error) {
          console.error(`[Ingest] Error processing job:`, error);
          skipped++;
        }
      }
      
      // Process auto-matching sequentially with smart rate limiting
      // This prevents hitting rate limits when n8n sends many jobs at once (e.g., 30 jobs/hour)
      // The system will pause and wait when limits are reached, then resume to ensure every job is scanned
      if (jobsToMatch.length > 0) {
        console.log(`[Ingest] Queueing ${jobsToMatch.length} jobs for sequential auto-matching with rate limit protection...`);
        const { matchAndUpdateJob } = await import("./matcher/job-matcher");
        const { activityLogger } = await import("./logger");
        const { getAPIUsage } = await import("./api-usage");
        
        let matchedCount = 0;
        let failedCount = 0;
        const failedJobIds: number[] = []; // Track failed job IDs for notification
        
        // Calculate minimum delay between requests based on rate limits
        // Gemini: 2 req/min = 30 seconds, Perplexity: 5 req/min = 12 seconds
        // Use 30 seconds to be safe for Gemini's 2 req/min limit
        const MIN_DELAY_MS = 30000; // 30 seconds between requests (safe for Gemini's 2 req/min)
        
        // Helper function to wait for rate limit to reset
        const waitForRateLimitReset = async (provider: string, usage: any) => {
          console.log(`[Ingest] ${provider} rate limit reached. Pausing and waiting for reset...`);
          // Wait 65 seconds to ensure we're past the 1-minute window
          await new Promise(resolve => setTimeout(resolve, 65000));
          console.log(`[Ingest] Rate limit window reset, resuming processing...`);
        };
        
        // Helper function to check if we need to wait for daily limit
        // For daily limits, we'll wait until the next day (midnight reset)
        const waitForDailyLimitReset = async () => {
          const now = new Date();
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          const msUntilMidnight = tomorrow.getTime() - now.getTime();
          
          if (msUntilMidnight > 0) {
            const hoursUntilMidnight = Math.ceil(msUntilMidnight / (1000 * 60 * 60));
            console.log(`[Ingest] Daily limit reached. Pausing until midnight reset (${hoursUntilMidnight} hours)...`);
            await new Promise(resolve => setTimeout(resolve, msUntilMidnight + 60000)); // Add 1 minute buffer
            console.log(`[Ingest] Daily limit reset, resuming processing...`);
          }
        };
        
        for (let i = 0; i < jobsToMatch.length; i++) {
          const jobToMatch = jobsToMatch[i];
          let retryCount = 0;
          const MAX_RETRIES = 3;
          
          while (retryCount < MAX_RETRIES) {
            try {
              // Check current API usage before processing
              const usage = await getAPIUsage(userId);
              
              // Get user's AI provider preference to know which limits to check
              const providerPreference = await storage.getSetting("ai_provider_preference", userId);
              const preference = providerPreference?.value || "auto";
              
              // Determine which providers might be used
              let willUsePerplexity = false;
              let willUseGemini = false;
              let willUseOpenRouter = false;
              
              if (preference === "auto" || preference === "perplexity,gemini,openrouter") {
                willUsePerplexity = true;
                willUseGemini = true;
                willUseOpenRouter = true;
              } else {
                const providers = preference.split(",").map(p => p.trim());
                willUsePerplexity = providers.includes("perplexity");
                willUseGemini = providers.includes("gemini");
                willUseOpenRouter = providers.includes("openrouter");
              }
              
              // Check minute limits and wait if needed
              const perplexityMinuteLimit = willUsePerplexity && 
                usage.providers.perplexity.minuteCount >= usage.providers.perplexity.minuteLimit;
              const geminiMinuteLimit = willUseGemini && 
                usage.providers.gemini.minuteCount >= usage.providers.gemini.minuteLimit;
              const openrouterMinuteLimit = willUseOpenRouter && 
                usage.providers.openrouter.minuteCount >= usage.providers.openrouter.minuteLimit;
              
              // Wait for minute limit to reset if needed
              if (perplexityMinuteLimit) {
                await waitForRateLimitReset("Perplexity", usage);
                // Re-check usage after waiting
                continue; // Retry this job
              }
              if (geminiMinuteLimit) {
                await waitForRateLimitReset("Gemini", usage);
                continue; // Retry this job
              }
              if (openrouterMinuteLimit) {
                await waitForRateLimitReset("OpenRouter", usage);
                continue; // Retry this job
              }
              
              // Check daily limits
              const perplexityDailyLimit = willUsePerplexity && 
                usage.providers.perplexity.dailyCount >= usage.providers.perplexity.dailyLimit;
              const geminiDailyLimit = willUseGemini && 
                usage.providers.gemini.dailyCount >= usage.providers.gemini.dailyLimit;
              const openrouterDailyLimit = willUseOpenRouter && 
                usage.providers.openrouter.dailyCount >= usage.providers.openrouter.dailyLimit;
              
              // If primary providers hit daily limit, automatically switch to OpenRouter if available
              if ((perplexityDailyLimit || geminiDailyLimit) && !openrouterDailyLimit && willUseOpenRouter) {
                console.log(`[Ingest] Primary providers (Perplexity/Gemini) at daily limit, switching to OpenRouter for job ${jobToMatch.id}...`);
                // Temporarily override provider preference to use OpenRouter only
                const originalPreference = preference;
                await storage.setSetting("ai_provider_preference", "openrouter", userId);
                // Process job with OpenRouter
                const success = await matchAndUpdateJob(jobToMatch.id, userId);
                // Restore original preference
                await storage.setSetting("ai_provider_preference", originalPreference, userId);
                
                if (success) {
                  matchedCount++;
                  console.log(`[Ingest] Successfully auto-matched job ${jobToMatch.id} using OpenRouter fallback - ${matchedCount}/${jobsToMatch.length} completed`);
                  break; // Success, move to next job
                } else {
                  console.warn(`[Ingest] OpenRouter fallback also failed for job ${jobToMatch.id}`);
                  // Continue to retry logic below
                }
              }
              
              // Check if all potential providers are at their daily limit
              const allProvidersAtDailyLimit = 
                (willUsePerplexity && perplexityDailyLimit) &&
                (willUseGemini && geminiDailyLimit) &&
                (willUseOpenRouter && openrouterDailyLimit);
              
              if (allProvidersAtDailyLimit) {
                // Wait until midnight for daily limit reset
                await waitForDailyLimitReset();
                // Re-check usage after waiting
                continue; // Retry this job
              }
              
              // Add delay between API calls to respect rate limits
              if (i > 0 || retryCount > 0) {
                const delay = MIN_DELAY_MS;
                console.log(`[Ingest] Waiting ${delay / 1000} seconds before processing job ${jobToMatch.id} (${i + 1}/${jobsToMatch.length})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              
              const success = await matchAndUpdateJob(jobToMatch.id, userId);
              if (success) {
                matchedCount++;
                console.log(`[Ingest] Successfully auto-matched job ${jobToMatch.id} (${jobToMatch.title}) - ${matchedCount}/${jobsToMatch.length} completed`);
                break; // Success, move to next job
              } else {
                retryCount++;
                if (retryCount < MAX_RETRIES) {
                  console.warn(`[Ingest] Auto-matching failed for job ${jobToMatch.id}, retrying with fallback providers (${retryCount}/${MAX_RETRIES})...`);
                  // If retrying and we haven't tried OpenRouter yet, switch to it
                  if (retryCount === 1 && !openrouterDailyLimit && willUseOpenRouter) {
                    console.log(`[Ingest] Switching to OpenRouter fallback for retry of job ${jobToMatch.id}...`);
                    const originalPreference = preference;
                    await storage.setSetting("ai_provider_preference", "openrouter", userId);
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before retry
                    // Will retry with OpenRouter in next iteration
                    continue;
                  } else {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before retry
                    continue;
                  }
                } else {
                  failedCount++;
                  failedJobIds.push(jobToMatch.id);
                  console.warn(`[Ingest] Auto-matching failed for job ${jobToMatch.id} (${jobToMatch.title}) after ${MAX_RETRIES} retries - may need manual ATS analysis`);
                  await activityLogger.error(
                    `Failed to auto-match job "${jobToMatch.title}" from n8n ingestion after ${MAX_RETRIES} retries`,
                    { jobId: jobToMatch.id, reason: "AI service returned null or failed" },
                    userId
                  );
                  break; // Move to next job
                }
              }
            } catch (err: any) {
              // Check if it's a 401/unauthorized error - switch provider and retry
              const isUnauthorized = err?.message?.includes("unauthorized") || 
                                    err?.message?.includes("invalid") || 
                                    err?.message?.includes("401") ||
                                    err?.status === 401;
              
              if (isUnauthorized && retryCount === 0) {
                // First retry: switch to OpenRouter if available
                console.warn(`[Ingest] 401/unauthorized error for job ${jobToMatch.id}, switching to OpenRouter fallback...`);
                if (!openrouterDailyLimit && willUseOpenRouter) {
                  const originalPreference = preference;
                  await storage.setSetting("ai_provider_preference", "openrouter", userId);
                  retryCount++;
                  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
                  continue; // Retry with OpenRouter
                }
              }
              
              retryCount++;
              if (retryCount < MAX_RETRIES) {
                console.error(`[Ingest] Error auto-matching job ${jobToMatch.id}, retrying (${retryCount}/${MAX_RETRIES}):`, err);
                await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before retry
                continue;
              } else {
                failedCount++;
                failedJobIds.push(jobToMatch.id);
                console.error(`[Ingest] Error auto-matching job ${jobToMatch.id} (${jobToMatch.title}) after ${MAX_RETRIES} retries:`, err);
                await activityLogger.error(
                  `Failed to auto-match job "${jobToMatch.title}" from n8n ingestion after ${MAX_RETRIES} retries`,
                  { jobId: jobToMatch.id, error: err instanceof Error ? err.message : String(err), isUnauthorized },
                  userId
                );
                break; // Move to next job
              }
            }
          }
        }
        
        console.log(`[Ingest] Auto-matching complete: ${matchedCount} matched, ${failedCount} failed out of ${jobsToMatch.length} jobs`);
        
        // Store failed job IDs in activity log metadata for notification system
        if (failedJobIds.length > 0) {
          await activityLogger.warning(
            `n8n ingestion complete: ${failedJobIds.length} job(s) failed ATS scanning after retries`,
            { 
              failedJobIds,
              failedCount, 
              matchedCount, 
              total: jobsToMatch.length,
              source: "n8n",
              type: "unscanned_jobs_notification"
            },
            userId
          );
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
        // Log n8n API usage (counts jobs ingested)
        const { logAPICall } = await import("./api-usage");
        await logAPICall("n8n Job Ingestion", "n8n", { jobsIngested: inserted + updated }, userId);
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


  // Match zero-score jobs
  app.post("/api/jobs/match-zero-score", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      // Import matcher (dynamic import to avoid loading issues)
      const { matchAllZeroScoreJobs } = await import("./matcher/job-matcher");
      
      // Start matching (don't await - return immediately)
      const { activityLogger } = await import("./logger");
      await activityLogger.info("Re-matching zero-score jobs started", undefined, userId);
      
      matchAllZeroScoreJobs(userId).then(async (result) => {
        console.log(`Zero-score job re-matching complete: ${result.matched} matched, ${result.failed} failed out of ${result.total} total`);
        await activityLogger.success(
          `Zero-score job re-matching complete: ${result.matched} matched, ${result.failed} failed`,
          { matched: result.matched, failed: result.failed, total: result.total },
          userId
        );
      }).catch(async (error) => {
        console.error("Error in background zero-score job matching:", error);
        await activityLogger.error("Zero-score job re-matching failed", { error: error instanceof Error ? error.message : "Unknown error" }, userId);
      });
      
      // Return immediately
      res.json({ 
        message: "Zero-score job re-matching started in background. This may take a while depending on the number of jobs."
      });
    } catch (error) {
      console.error("Error starting zero-score job matching:", error);
      res.status(500).json({ 
        error: "Failed to start zero-score job matching",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Retry matching for a specific job
  app.post("/api/jobs/:id/match", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const jobId = parseIdParam(req.params.id);
      if (!jobId) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      // Verify job exists and belongs to user
      const job = await storage.getJob(jobId, userId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Import matcher
      const { matchAndUpdateJob } = await import("./matcher/job-matcher");
      const { activityLogger } = await import("./logger");

      // Check prerequisites before matching
      const resumes = await storage.getResumes(userId);
      if (resumes.length === 0) {
        return res.status(400).json({ 
          error: "No resumes found",
          message: "Please upload at least one resume before matching jobs."
        });
      }

      // Check if at least one AI API key is configured
      const perplexityKey = await storage.getSetting("perplexity_api_key", userId);
      const geminiKey = await storage.getSetting("gemini_api_key", userId);
      const openrouterKey = await storage.getSetting("openrouter_api_key", userId);
      
      if ((!perplexityKey || !perplexityKey.value) && 
          (!geminiKey || !geminiKey.value) && 
          (!openrouterKey || !openrouterKey.value)) {
        return res.status(400).json({ 
          error: "No AI API key configured",
          message: "Please configure at least one AI API key (Perplexity, Gemini, or OpenRouter) in Settings."
        });
      }

      // Attempt to match the job
      const success = await matchAndUpdateJob(jobId, userId);
      
      if (success) {
        await activityLogger.info(
          `Manually retried matching for job "${job.title}"`,
          { jobId },
          userId
        );
        // Return updated job
        const updatedJob = await storage.getJob(jobId, userId);
        res.json({
          success: true,
          message: "Job matched successfully",
          job: updatedJob
        });
      } else {
        await activityLogger.error(
          `Failed to match job "${job.title}" on retry`,
          { jobId, reason: "AI service returned null or failed" },
          userId
        );
        res.status(500).json({
          success: false,
          error: "Failed to match job",
          message: "The AI service did not return a valid response. Please check your API keys and try again."
        });
      }
    } catch (error) {
      console.error("Error retrying job matching:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({
        success: false,
        error: "Failed to retry job matching",
        message: errorMessage
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
      const rejectedJobs = jobs.filter(j => j.rejected === true).length; // Use new rejected boolean field
      const interviewJobs = jobs.filter(j => j.gotInterview === true).length; // Use new gotInterview boolean field
      
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
      
      // Send test reminder (force=true to bypass daily limit for testing)
      const { executeReminderCheck } = await import("./cron/index");
      
      try {
        const result = await executeReminderCheck(userId, true); // force=true for test
        const success = result.sent || false;
        
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

  // ============ RESUME OPTIMIZER API ============
  
  // Optimize resume for a specific job
  app.post("/api/resumes/:resumeId/optimize", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const resumeId = parseIdParam(req.params.resumeId);
      if (!resumeId) {
        return res.status(400).json({ error: "Invalid resume ID" });
      }
      const { jobId, atsAnalysisId } = req.body;

      const parsedJobId = typeof jobId === "number" ? jobId : (jobId ? parseInt(String(jobId), 10) : null);
      if (!parsedJobId || isNaN(parsedJobId)) {
        return res.status(400).json({ error: "Job ID is required and must be a valid number" });
      }

      // Get resume
      const resume = await storage.getResume(resumeId, userId);
      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }

      // Get job
      const job = await storage.getJob(parsedJobId, userId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Get ATS analysis if provided, or find the most recent one for this job
      let atsAnalysis = null;
      if (atsAnalysisId) {
        const parsedAtsAnalysisId = typeof atsAnalysisId === "number" ? atsAnalysisId : (atsAnalysisId ? parseInt(String(atsAnalysisId), 10) : null);
        if (parsedAtsAnalysisId && !isNaN(parsedAtsAnalysisId)) {
          atsAnalysis = await storage.getATSAnalysis(parsedAtsAnalysisId, userId);
          if (!atsAnalysis) {
            return res.status(404).json({ error: "ATS Analysis not found" });
          }
          // Verify the analysis is for this resume and job
          if (atsAnalysis.bestResumeId !== resumeId) {
            return res.status(400).json({ error: "ATS Analysis is not for the selected resume" });
          }
          if (atsAnalysis.jobId && atsAnalysis.jobId !== parsedJobId) {
            return res.status(400).json({ error: "ATS Analysis is not for the selected job" });
          }
        }
      } else {
        // Try to find the most recent ATS analysis for this job
        atsAnalysis = await storage.getATSAnalysisByJobId(parsedJobId, userId);
        // Verify it's for the selected resume
        if (atsAnalysis && atsAnalysis.bestResumeId !== resumeId) {
          atsAnalysis = null; // Don't use it if it's for a different resume
        }
      }

      // Check if Gemini API key is configured (required for optimization)
      const geminiKey = await storage.getSetting("gemini_api_key", userId);
      if (!geminiKey || !geminiKey.value) {
        return res.status(400).json({ 
          error: "Gemini API key is required for resume optimization. Please add it in Settings." 
        });
      }

      // Import and call optimizer
      const { optimizeResumeForJob } = await import("./resume-optimizer");
      const optimizedResume = await optimizeResumeForJob(resume, job, userId, atsAnalysis || undefined);

      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.success(
        `Resume "${resume.name}" optimized for job "${job.title}"${atsAnalysis ? " using ATS analysis" : ""}`,
        { resumeId: resume.id, jobId: job.id, atsAnalysisId: atsAnalysis?.id },
        userId
      );

      res.json({
        originalResume: resume,
        optimizedResume,
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
        },
        atsAnalysis: atsAnalysis ? {
          id: atsAnalysis.id,
          matchScore: atsAnalysis.matchScore,
          missingKeywords: atsAnalysis.missingKeywords,
          suggestions: atsAnalysis.suggestions,
        } : null,
      });
    } catch (error) {
      console.error("Error optimizing resume:", error);
      res.status(500).json({ 
        error: "Failed to optimize resume",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Optimize resume for a job - automatically finds best resume from ATS analysis
  app.post("/api/jobs/:jobId/optimize-resume", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const jobId = parseIdParam(req.params.jobId);
      if (!jobId) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      // Get job
      const job = await storage.getJob(jobId, userId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if an optimized resume already exists for this job
      const existingOptimizedResumes = await storage.getOptimizedResumes(userId, jobId);
      if (existingOptimizedResumes.length > 0) {
        return res.status(400).json({ 
          error: "An optimized resume already exists for this job. You can view it in the Resumes page under 'Optimized Resumes'.",
          existingOptimizedResumeId: existingOptimizedResumes[0].id
        });
      }

      // Find the most recent ATS analysis for this job
      const atsAnalysis = await storage.getATSAnalysisByJobId(jobId, userId);
      if (!atsAnalysis) {
        return res.status(404).json({ 
          error: "No ATS analysis found for this job. Please run an ATS analysis first." 
        });
      }

      // Get the best resume from the ATS analysis
      const resume = await storage.getResume(atsAnalysis.bestResumeId, userId);
      if (!resume) {
        return res.status(404).json({ error: "Best resume from ATS analysis not found" });
      }

      // Check if Gemini API key is configured (required for optimization)
      const geminiKey = await storage.getSetting("gemini_api_key", userId);
      if (!geminiKey || !geminiKey.value) {
        return res.status(400).json({ 
          error: "Gemini API key is required for resume optimization. Please add it in Settings." 
        });
      }

      // Import and call optimizer
      const { optimizeResumeForJob, analyzeOptimizedResume } = await import("./resume-optimizer");
      const optimizedResume = await optimizeResumeForJob(resume, job, userId, atsAnalysis);

      // Run ATS analysis on optimized resume
      let optimizedAnalysis = null;
      try {
        optimizedAnalysis = await analyzeOptimizedResume(
          resume,
          optimizedResume,
          job,
          atsAnalysis.matchScore,
          userId
        );
      } catch (analysisError) {
        console.error("Error running post-optimization ATS analysis:", analysisError);
        // Don't fail the whole request if analysis fails, but log it
      }

      // Save optimized resume to database
      let savedOptimizedResume = null;
      try {
        // Ensure technicalSkills is a string (not array)
        const technicalSkillsString = typeof optimizedResume.technicalSkills === 'string' 
          ? optimizedResume.technicalSkills 
          : Array.isArray(optimizedResume.technicalSkills)
            ? optimizedResume.technicalSkills.join(", ")
            : "";

        savedOptimizedResume = await storage.createOptimizedResume({
          originalResumeId: resume.id,
          jobId: job.id,
          atsAnalysisId: atsAnalysis.id,
          optimizedAnalysisId: optimizedAnalysis?.analysis?.id || null,
          professionalSummary: optimizedResume.professionalSummary,
          technicalSkills: technicalSkillsString,
          education: optimizedResume.education || null,
          relevantExperience: Array.isArray(optimizedResume.relevantExperience) ? optimizedResume.relevantExperience : [],
          projects: optimizedResume.projects && Array.isArray(optimizedResume.projects) ? optimizedResume.projects : null,
          changes: Array.isArray(optimizedResume.changes) ? optimizedResume.changes : [],
          originalScore: optimizedAnalysis?.originalScore || atsAnalysis.matchScore,
          newScore: optimizedAnalysis?.newScore || atsAnalysis.matchScore,
          scoreImprovement: optimizedAnalysis?.scoreImprovement || 0,
          improved: optimizedAnalysis?.improved || false,
        }, userId);
      } catch (saveError) {
        console.error("Error saving optimized resume:", saveError);
        // Don't fail the whole request if save fails
      }

      // Log activity
      const { activityLogger } = await import("./logger");
      await activityLogger.success(
        `Resume "${resume.name}" optimized for job "${job.title}" using ATS analysis`,
        { resumeId: resume.id, jobId: job.id, atsAnalysisId: atsAnalysis.id, optimizedResumeId: savedOptimizedResume?.id },
        userId
      );

      res.json({
        originalResume: resume,
        optimizedResume,
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
        },
        atsAnalysis: {
          id: atsAnalysis.id,
          matchScore: atsAnalysis.matchScore,
          missingKeywords: atsAnalysis.missingKeywords,
          suggestions: atsAnalysis.suggestions,
        },
        optimizedAnalysis,
        savedOptimizedResume: savedOptimizedResume ? {
          id: savedOptimizedResume.id,
          createdAt: savedOptimizedResume.createdAt,
        } : null,
      });
    } catch (error) {
      console.error("Error optimizing resume:", error);
      res.status(500).json({ 
        error: "Failed to optimize resume",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ============ OPTIMIZED RESUMES API ============
  
  // Get all optimized resumes
  app.get("/api/optimized-resumes", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      // Safely parse jobId from query params
      let jobId: number | undefined = undefined;
      if (req.query.jobId) {
        const jobIdParam = req.query.jobId as string;
        // Check if it's a valid string that can be parsed
        if (jobIdParam && jobIdParam !== "undefined" && jobIdParam !== "null" && jobIdParam.trim() !== "") {
          const parsed = parseIdParam(jobIdParam);
          if (parsed) {
            jobId = parsed;
          } else {
            // Invalid format, but don't fail - just ignore the parameter
            console.warn(`[Optimized Resumes] Invalid jobId query parameter: "${jobIdParam}"`);
          }
        }
      }
      const optimizedResumes = await storage.getOptimizedResumes(userId, jobId);
      
      // Enrich with resume and job information
      const enrichedResumes = await Promise.all(
        optimizedResumes.map(async (optimized) => {
          const [resume, job] = await Promise.all([
            storage.getResume(optimized.originalResumeId, userId),
            storage.getJob(optimized.jobId, userId),
          ]);
          return {
            ...optimized,
            originalResume: resume ? { id: resume.id, name: resume.name } : null,
            job: job ? { id: job.id, title: job.title, company: job.company } : null,
          };
        })
      );
      
      res.json(enrichedResumes);
    } catch (error) {
      console.error("Error fetching optimized resumes:", error);
      res.status(500).json({ error: "Failed to fetch optimized resumes" });
    }
  });

  // Get single optimized resume
  app.get("/api/optimized-resumes/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid optimized resume ID" });
      }
      const optimizedResume = await storage.getOptimizedResume(id, userId);
      
      if (!optimizedResume) {
        return res.status(404).json({ error: "Optimized resume not found" });
      }
      
      // Enrich with resume and job information
      const [resume, job] = await Promise.all([
        storage.getResume(optimizedResume.originalResumeId, userId),
        storage.getJob(optimizedResume.jobId, userId),
      ]);
      
      res.json({
        ...optimizedResume,
        originalResume: resume ? { id: resume.id, name: resume.name } : null,
        job: job ? { id: job.id, title: job.title, company: job.company } : null,
      });
    } catch (error) {
      console.error("Error fetching optimized resume:", error);
      res.status(500).json({ error: "Failed to fetch optimized resume" });
    }
  });

  // Delete optimized resume
  app.delete("/api/optimized-resumes/:id", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid optimized resume ID" });
      }
      const deleted = await storage.deleteOptimizedResume(id, userId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Optimized resume not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting optimized resume:", error);
      res.status(500).json({ error: "Failed to delete optimized resume" });
    }
  });

  // Download optimized resume as PDF
  app.get("/api/optimized-resumes/:id/download", requireAuth, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = parseIdParam(req.params.id);
      if (!id) {
        return res.status(400).json({ error: "Invalid optimized resume ID" });
      }
      
      // Get format from query parameter (default to 'pdf')
      const format = (req.query.format as string) || "pdf";
      if (format !== "pdf" && format !== "docx") {
        return res.status(400).json({ error: "Invalid format. Must be 'pdf' or 'docx'" });
      }
      
      // Get the optimized resume
      const optimizedResume = await storage.getOptimizedResume(id, userId);
      if (!optimizedResume) {
        return res.status(404).json({ error: "Optimized resume not found" });
      }
      
      // Get job and original resume info for metadata
      const [job, originalResume] = await Promise.all([
        storage.getJob(optimizedResume.jobId, userId),
        storage.getResume(optimizedResume.originalResumeId, userId),
      ]);
      
      if (!job || !originalResume) {
        return res.status(404).json({ error: "Related job or resume not found" });
      }
      
      const resumeData = {
        professionalSummary: optimizedResume.professionalSummary,
        technicalSkills: optimizedResume.technicalSkills,
        education: optimizedResume.education || "",
        relevantExperience: optimizedResume.relevantExperience,
        projects: optimizedResume.projects,
      };
      
      const metadata = {
        jobTitle: job.title,
        jobCompany: job.company,
        originalResumeName: originalResume.name,
        optimizedDate: optimizedResume.createdAt,
      };
      
      const sanitizedTitle = job.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const timestamp = Date.now();
      
      if (format === "docx") {
        // Generate Word document
        const { generateOptimizedResumeWord } = await import("./word-generator");
        const wordBuffer = await generateOptimizedResumeWord(resumeData, metadata);
        
        // Set response headers
        const filename = `optimized-resume-${sanitizedTitle}-${timestamp}.docx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", wordBuffer.length.toString());
        
        // Send the buffer
        res.send(wordBuffer);
      } else {
        // Generate PDF
        const { generateOptimizedResumePDF } = await import("./pdf-generator");
        const pdfStream = generateOptimizedResumePDF(resumeData, metadata);
        
        // Set response headers
        const filename = `optimized-resume-${sanitizedTitle}-${timestamp}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        
        // Pipe the PDF to the response
        pdfStream.pipe(res);
      }
    } catch (error) {
      console.error("Error downloading optimized resume:", error);
      res.status(500).json({ error: "Failed to download optimized resume" });
    }
  });

  return httpServer;
}

// Load environment variables from .env file
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import passport from "passport";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { configureSession } from "./auth/session";
import { configurePassport } from "./auth/passport";

const app = express();
const httpServer = createServer(app);

// Trust proxy - REQUIRED for Railway to handle cookies correctly
// Railway uses a reverse proxy, so we need to trust the first proxy
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Security: Helmet.js for security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts for React/Vite
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"], // Disable iframes by default (change if needed)
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for Railway compatibility
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resources
  })
);

// Security: Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for n8n ingestion endpoint (has its own authentication)
    return req.path === "/api/jobs/ingest";
  },
});

// Apply rate limiting to all API routes (except n8n ingest)
app.use("/api", apiLimiter);

// Separate, more lenient rate limiter for n8n ingestion endpoint
// n8n has its own authentication via header, so we allow more requests
const n8nIngestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Allow up to 500 requests per 15 minutes (n8n may send batches)
  message: "Too many ingestion requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply lenient rate limiting to n8n ingestion endpoint
app.use("/api/jobs/ingest", n8nIngestLimiter);

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: "Too many login attempts, please try again later.",
  skipSuccessfulRequests: true, // Don't count successful requests
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use(
  express.json({
    limit: "50mb", // Increased limit for n8n ingest endpoint which may send large job arrays
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// CORS headers for Railway (if needed)
app.use((req, res, next) => {
  // Allow credentials (cookies) to be sent
  res.header("Access-Control-Allow-Credentials", "true");
  // Allow the origin that's making the request
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Configure and use session middleware (must be before passport)
app.use(configureSession());

// Configure and initialize Passport
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      
      if (capturedJsonResponse) {
        // Truncate large responses to avoid console spam
        const responseStr = JSON.stringify(capturedJsonResponse);
        const maxLength = 500; // Max 500 characters for response logging
        
        if (responseStr.length > maxLength) {
          // For arrays, show count and first item summary
          if (Array.isArray(capturedJsonResponse)) {
            const itemCount = capturedJsonResponse.length;
            const firstItem = capturedJsonResponse[0];
            let summary = `[${itemCount} items]`;
            
            if (firstItem && typeof firstItem === 'object') {
              // Show keys of first item
              const keys = Object.keys(firstItem);
              summary += ` (keys: ${keys.slice(0, 5).join(", ")}${keys.length > 5 ? "..." : ""})`;
            }
            
            logLine += ` :: ${summary}`;
          } else if (typeof capturedJsonResponse === 'object') {
            // For objects, show keys and truncated values
            const keys = Object.keys(capturedJsonResponse);
            const summary: Record<string, any> = {};
            
            for (const key of keys.slice(0, 5)) {
              const value = capturedJsonResponse[key];
              if (Array.isArray(value)) {
                summary[key] = `[${value.length} items]`;
              } else if (typeof value === 'string' && value.length > 100) {
                summary[key] = value.substring(0, 100) + "...";
              } else if (typeof value === 'object' && value !== null) {
                summary[key] = `{${Object.keys(value).length} keys}`;
              } else {
                summary[key] = value;
              }
            }
            
            if (keys.length > 5) {
              summary["..."] = `${keys.length - 5} more keys`;
            }
            
            logLine += ` :: ${JSON.stringify(summary)}`;
          } else {
            // For primitives, just truncate
            logLine += ` :: ${responseStr.substring(0, maxLength)}...`;
          }
        } else {
          logLine += ` :: ${responseStr}`;
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Setup daily job scraping cron job (only if not using Railway cron)
  // Set DISABLE_NODE_CRON=true if using Railway's native cron jobs
  if (!process.env.DISABLE_NODE_CRON) {
    const { setupDailyScraping, setupReminderCron, setupJobCleanup, setupOptimizedResumeCleanup } = await import("./cron/index");
    await setupDailyScraping();
    await setupReminderCron();
    await setupJobCleanup();
    await setupOptimizedResumeCleanup();
  } else {
    console.log("[Server] node-cron disabled - using Railway cron jobs instead");
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 4037
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      //reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

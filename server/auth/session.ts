import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "../db";

const PgSession = connectPgSimple(session);

/**
 * Configure express-session with PostgreSQL store
 */
export function configureSession() {
  // Railway uses HTTPS, so we need secure cookies
  // Check if we're in production OR if RAILWAY environment is set
  const isProduction = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
  
  // For Railway/production, default to "none" if not explicitly set
  // "none" is required for cross-site cookies and works with secure: true
  let cookieSameSite: "lax" | "none" | "strict" = "lax";
  if (process.env.COOKIE_SAME_SITE) {
    cookieSameSite = process.env.COOKIE_SAME_SITE as "lax" | "none" | "strict";
  } else if (isProduction) {
    // Default to "none" for production/Railway to ensure cookies work
    cookieSameSite = "none";
  }
  
  console.log("[Session Config] NODE_ENV:", process.env.NODE_ENV);
  console.log("[Session Config] RAILWAY_ENVIRONMENT:", process.env.RAILWAY_ENVIRONMENT);
  console.log("[Session Config] isProduction:", isProduction);
  console.log("[Session Config] COOKIE_SAME_SITE (env):", process.env.COOKIE_SAME_SITE);
  console.log("[Session Config] COOKIE_SAME_SITE (final):", cookieSameSite);
  console.log("[Session Config] SESSION_SECRET set:", !!process.env.SESSION_SECRET);
  console.log("[Session Config] Cookie settings:", {
    secure: isProduction,
    httpOnly: true,
    sameSite: cookieSameSite,
    maxAge: "30 days"
  });
  
  // Configure PgSession store
  // Don't use createTableIfMissing - it tries to read table.sql which doesn't exist in dist
  // Instead, we'll create the table manually via migration or ensure it exists
  const sessionStore = new PgSession({
    pool: pool,
    tableName: "session", // Table name for sessions
    createTableIfMissing: false, // Disable auto-create to avoid table.sql file issue
  });
  
  // Ensure session table exists (create it if it doesn't)
  // This avoids the table.sql file issue
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS session (
          sid VARCHAR NOT NULL COLLATE "default",
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL,
          CONSTRAINT session_pkey PRIMARY KEY (sid)
        )
        WITH (OIDS=FALSE);
        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session ("expire");
      `);
      console.log("[Session Config] Session table verified/created");
    } catch (error) {
      console.error("[Session Config] Error ensuring session table exists:", error);
      // Don't throw - table might already exist
    }
  })();
  
  return session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Railway uses HTTPS, so secure must be true
      secure: isProduction, // Use secure cookies in production (HTTPS)
      httpOnly: true, // Prevent XSS attacks
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: cookieSameSite,
      // Don't set domain unless explicitly needed (Railway usually works without it)
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    },
    name: "connect.sid", // Session cookie name
  });
}


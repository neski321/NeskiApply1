import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "../db";

const PgSession = connectPgSimple(session);

/**
 * Configure express-session with PostgreSQL store
 */
export function configureSession() {
  return session({
    store: new PgSession({
      pool: pool,
      tableName: "session", // Table name for sessions
      createTableIfMissing: true, // Automatically create table if it doesn't exist
    }),
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Use secure cookies in production (HTTPS)
      httpOnly: true, // Prevent XSS attacks
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      // Railway: Use "none" if frontend/backend are on different subdomains, "lax" if same domain
      sameSite: (process.env.COOKIE_SAME_SITE as "lax" | "none" | "strict") || "lax",
      // Ensure domain is set correctly for Railway
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    },
    name: "connect.sid", // Session cookie name
  });
}


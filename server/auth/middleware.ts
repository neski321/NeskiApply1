import type { Request, Response, NextFunction } from "express";

/**
 * Middleware to check if user is authenticated
 * Redirects to login if not authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // If API route, return 401
  if (req.path.startsWith("/api")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  // Otherwise redirect to login
  return res.redirect("/login");
}

/**
 * Middleware to check if user is authenticated (returns boolean)
 */
export function isAuthenticated(req: Request): boolean {
  return req.isAuthenticated() === true;
}











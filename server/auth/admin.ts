import type { Request, Response, NextFunction } from "express";
import { getUserFromRequest } from "./helpers";
import type { User } from "@shared/schema";

/**
 * Middleware to check if user is an admin
 * Returns 403 if user is not an admin
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getUserFromRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }
  
  next();
}

/**
 * Check if user is an admin (non-blocking, returns boolean)
 */
export function isAdmin(user: User | undefined): boolean {
  return user?.role === "admin";
}


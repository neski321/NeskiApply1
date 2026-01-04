import type { Request } from "express";
import type { User } from "@shared/schema";

/**
 * Get the authenticated user from the request
 * Returns undefined if not authenticated
 */
export function getUserFromRequest(req: Request): User | undefined {
  return req.user as User | undefined;
}

/**
 * Get the user ID from the request
 * Throws error if not authenticated
 */
export function getUserIdFromRequest(req: Request): string {
  const user = getUserFromRequest(req);
  if (!user || !user.id) {
    throw new Error("User not authenticated");
  }
  return user.id;
}









import { storage } from "./storage";
import type { InsertActivityLog } from "@shared/schema";

export type ActivityLogType = "success" | "info" | "warning" | "error";

/**
 * Log an activity to the database
 */
export async function logActivity(
  type: ActivityLogType,
  message: string,
  metadata?: Record<string, any>,
  userId?: string
): Promise<void> {
  try {
    if (!userId) {
      console.warn(`[Activity Log] Skipping log without userId: ${message}`);
      return;
    }
    
    // Convert metadata to proper format (null if undefined or empty object)
    const metadataValue = metadata && Object.keys(metadata).length > 0 ? metadata : null;
    
    await storage.createActivityLog({
      type,
      message,
      metadata: metadataValue,
    }, userId);
  } catch (error) {
    // Don't throw - logging should never break the app
    console.error("Failed to log activity:", error);
    // Also log to console as fallback
    console.log(`[Activity Log Failed] ${type.toUpperCase()}: ${message}`, metadata);
  }
}

/**
 * Convenience functions for different log types
 */
export const activityLogger = {
  success: (message: string, metadata?: Record<string, any>, userId?: string) => 
    logActivity("success", message, metadata, userId),
  info: (message: string, metadata?: Record<string, any>, userId?: string) => 
    logActivity("info", message, metadata, userId),
  warning: (message: string, metadata?: Record<string, any>, userId?: string) => 
    logActivity("warning", message, metadata, userId),
  error: (message: string, metadata?: Record<string, any>, userId?: string) => 
    logActivity("error", message, metadata, userId),
};



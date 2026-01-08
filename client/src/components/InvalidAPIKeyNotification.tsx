import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, Settings, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getActivityLogs, type ActivityLogWithUser } from "@/lib/api";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";

const DISMISSED_STORAGE_KEY = "dismissed-api-key-errors";

export function InvalidAPIKeyNotification() {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState<Record<string, number>>({}); // Track dismissed providers with timestamps

  // Load dismissed notifications from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(DISMISSED_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, number>;
          setDismissed(parsed);
        }
      } catch (error) {
        console.error("Failed to load dismissed notifications:", error);
      }
    }
  }, []);

  // Fetch recent activity logs to check for API key errors
  const { data: logs = [], isLoading } = useQuery<ActivityLogWithUser[]>({
    queryKey: ["activity", "api-errors"],
    queryFn: () => getActivityLogs(50), // Get last 50 logs
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Find recent API key authorization errors (within last 24 hours)
  const apiKeyErrors = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    return logs
      .filter(log => {
        // Check if it's an error type
        if (log.type !== "error") return false;
        
        // Check if it's within last 24 hours
        const logTime = new Date(log.createdAt).getTime();
        if (logTime < oneDayAgo) return false;
        
        // Check if it's an API key authorization error
        const metadata = log.metadata as any;
        const messageLower = log.message?.toLowerCase() || "";
        
        // Check metadata first (most reliable)
        if (metadata?.error === "401_unauthorized" || metadata?.error === "401") {
          return true;
        }
        
        // Check message for API key errors
        if ((messageLower.includes("invalid") || messageLower.includes("unauthorized")) && 
            (messageLower.includes("api key") || messageLower.includes("perplexity") || 
             messageLower.includes("gemini") || messageLower.includes("openrouter"))) {
          return true;
        }
        
        return false;
      })
      .map(log => {
        const metadata = log.metadata as any;
        const messageLower = log.message?.toLowerCase() || "";
        
        // Extract provider from metadata (most reliable)
        let provider = metadata?.provider;
        
        // Fallback to extracting from message
        if (!provider) {
          if (messageLower.includes("perplexity")) provider = "Perplexity";
          else if (messageLower.includes("gemini")) provider = "Gemini";
          else if (messageLower.includes("openrouter")) provider = "OpenRouter";
          else provider = "Unknown";
        } else {
          // Capitalize provider name
          provider = provider.charAt(0).toUpperCase() + provider.slice(1);
        }
        
        return {
          provider,
          message: log.message,
          timestamp: new Date(log.createdAt),
          id: `${provider}-${log.id}`, // Unique ID for dismissal
        };
      })
      .filter((error, index, self) => 
        // Get most recent error for each provider
        index === self.findIndex(e => e.provider === error.provider)
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()) // Sort by most recent first
      .filter(error => {
        // Check if this provider was dismissed
        const dismissedTime = dismissed[error.provider];
        if (!dismissedTime) return true; // Not dismissed, show it
        
        // Only show if the error is newer than the dismissal time
        // This allows new errors to show even if the provider was previously dismissed
        return error.timestamp.getTime() > dismissedTime;
      });
  }, [logs, dismissed]);

  // Don't show if no errors, loading, or all dismissed
  if (isLoading || apiKeyErrors.length === 0) {
    return null;
  }

  // Get the most recent error (or first one if multiple)
  const latestError = apiKeyErrors[0];
  const providerName = latestError.provider;

  const handleDismiss = () => {
    const now = Date.now();
    const newDismissed = {
      ...dismissed,
      [providerName]: now, // Store dismissal timestamp for this provider
    };
    setDismissed(newDismissed);
    
    // Persist to localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(newDismissed));
      } catch (error) {
        console.error("Failed to save dismissed notification:", error);
      }
    }
  };

  const handleGoToSettings = () => {
    setLocation("/settings?tab=api-keys");
  };

  return (
    <Alert className="mb-4 border-red-500/50 bg-red-500/10">
      <AlertCircle className="h-4 w-4 text-red-500" />
      <AlertTitle className="text-red-500 font-semibold">
        Invalid API Key Detected
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              Your <strong>{providerName}</strong> API key is invalid or unauthorized. 
              The system has automatically switched to a fallback provider, but you should update your API key in Settings.
            </p>
            {apiKeyErrors.length > 1 && (
              <p className="text-xs text-muted-foreground mt-1">
                {apiKeyErrors.length - 1} other API key issue{apiKeyErrors.length - 1 !== 1 ? "s" : ""} detected
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleGoToSettings}
              className="gap-2"
            >
              <Settings className="h-3 w-3" />
              Go to Settings
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}


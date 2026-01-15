import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, Clock } from "lucide-react";
import { useState, useEffect } from "react";

const DISMISSED_STORAGE_KEY = "dismissed-rate-limit-notification";

interface RateLimitNotificationProps {
  error: Error & { isRateLimit?: boolean; retryAfter?: number; limit?: number; window?: string };
  onDismiss?: () => void;
}

export function RateLimitNotification({ error, onDismiss }: RateLimitNotificationProps) {
  const [dismissed, setDismissed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Load dismissed state from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(DISMISSED_STORAGE_KEY);
        if (stored) {
          const dismissedTime = parseInt(stored, 10);
          // Show again if it's been more than 5 minutes since dismissal
          if (Date.now() - dismissedTime < 5 * 60 * 1000) {
            setDismissed(true);
          }
        }
      } catch (error) {
        console.error("Failed to load dismissed notification:", error);
      }
    }
  }, []);

  // Calculate time remaining
  useEffect(() => {
    if (error.retryAfter) {
      setTimeRemaining(error.retryAfter);
      const interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 0) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [error.retryAfter]);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(DISMISSED_STORAGE_KEY, Date.now().toString());
      } catch (error) {
        console.error("Failed to save dismissed notification:", error);
      }
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  if (dismissed || !error.isRateLimit) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins} minute${mins !== 1 ? "s" : ""}${secs > 0 ? ` and ${secs} second${secs !== 1 ? "s" : ""}` : ""}`;
    }
    return `${secs} second${secs !== 1 ? "s" : ""}`;
  };

  return (
    <Alert className="mb-4 border-orange-500/50 bg-orange-500/10">
      <AlertCircle className="h-4 w-4 text-orange-500" />
      <AlertTitle className="text-orange-500 font-semibold">
        Too Many Requests
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              {error.message || "You've made too many requests. Please wait before trying again."}
            </p>
            {error.limit && error.window && (
              <p className="text-xs text-muted-foreground mt-1">
                Limit: {error.limit} requests per {error.window}
              </p>
            )}
            {timeRemaining !== null && timeRemaining > 0 && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Please wait {formatTime(timeRemaining)} before trying again
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="h-8 w-8 p-0 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RateLimitNotification } from "./RateLimitNotification";
import { useToast } from "@/hooks/use-toast";

export function GlobalErrorHandler() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rateLimitError, setRateLimitError] = useState<Error | null>(null);

  useEffect(() => {
    // Listen for mutations that fail with rate limit errors
    const unsubscribe = queryClient.getMutationCache().subscribe((mutation) => {
      if (mutation.state && mutation.state.status === "error") {
        const error = mutation.state.error as Error & { isRateLimit?: boolean };
        if (error?.isRateLimit) {
          setRateLimitError(error);
          // Also show a toast for immediate feedback
          toast({
            title: "Rate Limit Exceeded",
            description: error.message || "You've made too many requests. Please wait before trying again.",
            variant: "destructive",
            duration: 5000,
          });
        }
      }
    });

    // Also check for query errors
    const queryUnsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.type === "error" && event?.query?.state?.error) {
        const error = event.query.state.error as Error & { isRateLimit?: boolean };
        if (error?.isRateLimit) {
          setRateLimitError(error);
          toast({
            title: "Rate Limit Exceeded",
            description: error.message || "You've made too many requests. Please wait before trying again.",
            variant: "destructive",
            duration: 5000,
          });
        }
      }
    });

    return () => {
      unsubscribe();
      queryUnsubscribe();
    };
  }, [queryClient, toast]);

  // Clear rate limit error after 5 minutes
  useEffect(() => {
    if (rateLimitError) {
      const timer = setTimeout(() => {
        setRateLimitError(null);
      }, 5 * 60 * 1000); // 5 minutes
      return () => clearTimeout(timer);
    }
  }, [rateLimitError]);

  if (!rateLimitError) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
      <RateLimitNotification
        error={rateLimitError}
        onDismiss={() => setRateLimitError(null)}
      />
    </div>
  );
}

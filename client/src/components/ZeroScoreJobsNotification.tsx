import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, ScanSearch, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getZeroScoreJobsCount, matchZeroScoreJobs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export function ZeroScoreJobsNotification() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  // Fetch zero-score jobs count
  const { data: zeroScoreData, isLoading, error: queryError } = useQuery({
    queryKey: ["zeroScoreJobsCount"],
    queryFn: getZeroScoreJobsCount,
    refetchInterval: 30000, // Check every 30 seconds
    retry: 2, // Retry on failure
  });

  const zeroScoreCount = zeroScoreData?.count || 0;

  const matchMutation = useMutation({
    mutationFn: matchZeroScoreJobs,
    onSuccess: () => {
      toast({
        title: "Scanning Started",
        description: `Re-scanning ${zeroScoreCount} job(s) with 0% match score. This may take a few minutes.`,
        variant: "default",
      });
      // Refetch zero-score count and jobs after a delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["zeroScoreJobsCount"] });
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }, 5000);
    },
    onError: (error: Error) => {
      toast({
        title: "Scanning Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Don't show if dismissed or no zero-score jobs (but show even while loading if we have data)
  if (dismissed || zeroScoreCount === 0) {
    return null;
  }

  return (
    <Alert className="mb-4 border-orange-500/50 bg-orange-500/10">
      <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
      <AlertTitle className="text-orange-500 font-semibold text-sm sm:text-base">
        Zero Match Score Jobs Detected
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs sm:text-sm text-muted-foreground flex-1">
            {zeroScoreCount} job{zeroScoreCount !== 1 ? "s" : ""} {zeroScoreCount === 1 ? "has" : "have"} a 0% match score. Consider re-scanning to verify the match score.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={() => matchMutation.mutate()}
              disabled={matchMutation.isPending}
              className="gap-1.5 sm:gap-2 text-xs sm:text-sm h-9 sm:h-8 px-3 sm:px-4 min-w-[100px] sm:min-w-0"
            >
              {matchMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 sm:h-3 sm:w-3 animate-spin" />
                  <span className="hidden sm:inline">Scanning...</span>
                  <span className="sm:hidden">Scanning</span>
                </>
              ) : (
                <>
                  <ScanSearch className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  <span className="hidden sm:inline">Re-scan {zeroScoreCount} Job{zeroScoreCount !== 1 ? "s" : ""}</span>
                  <span className="sm:hidden">Re-scan</span>
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
              className="h-9 w-9 sm:h-8 sm:w-8 p-0 flex-shrink-0 touch-manipulation"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}


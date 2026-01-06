import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, ScanSearch, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUnscannedJobsCount, matchJobs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export function UnscannedJobsNotification() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  // Fetch unscanned jobs count
  const { data: unscannedData, isLoading } = useQuery({
    queryKey: ["unscannedJobsCount"],
    queryFn: getUnscannedJobsCount,
    refetchInterval: 30000, // Check every 30 seconds
  });

  const unscannedCount = unscannedData?.count || 0;

  const matchMutation = useMutation({
    mutationFn: matchJobs,
    onSuccess: () => {
      toast({
        title: "Scanning Started",
        description: `Scanning ${unscannedCount} job(s) in the background. This may take a few minutes.`,
        variant: "default",
      });
      // Refetch unscanned count after a delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["unscannedJobsCount"] });
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

  // Don't show if dismissed, no unscanned jobs, or loading
  if (dismissed || unscannedCount === 0 || isLoading) {
    return null;
  }

  return (
    <Alert className="mb-4 border-amber-500/50 bg-amber-500/10">
      <AlertCircle className="h-4 w-4 text-amber-500" />
      <AlertTitle className="text-amber-500 font-semibold">
        Unscanned Jobs Detected
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {unscannedCount} job{unscannedCount !== 1 ? "s" : ""} {unscannedCount === 1 ? "has" : "have"} not been scanned for ATS analysis yet.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => matchMutation.mutate()}
              disabled={matchMutation.isPending}
              className="gap-2"
            >
              {matchMutation.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <ScanSearch className="h-3 w-3" />
                  Scan {unscannedCount} Job{unscannedCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
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


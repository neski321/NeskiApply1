import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Edit3, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getUntitledJobsCount } from "@/lib/api";
import { useState } from "react";

interface UntitledJobsNotificationProps {
  onFilterUntitled?: () => void;
}

export function UntitledJobsNotification({ onFilterUntitled }: UntitledJobsNotificationProps) {
  const [dismissed, setDismissed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["untitledJobsCount"],
    queryFn: getUntitledJobsCount,
    refetchInterval: 30000,
  });

  const count = data?.count ?? 0;

  if (dismissed || count === 0) return null;

  return (
    <Alert className="mb-4 border-amber-500/50 bg-amber-500/10">
      <Edit3 className="h-4 w-4 text-amber-500 flex-shrink-0" />
      <AlertTitle className="text-amber-500 font-semibold text-sm sm:text-base">
        Jobs Needing Title Correction
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs sm:text-sm text-muted-foreground flex-1">
            {count} job{count !== 1 ? "s" : ""} {count === 1 ? "has" : "have"} "Untitled Job" as the name. Click a job to open it and edit the title.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onFilterUntitled && (
              <Button
                size="sm"
                variant="outline"
                onClick={onFilterUntitled}
                className="gap-1.5 text-xs sm:text-sm h-9 sm:h-8 px-3 sm:px-4 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
              >
                <Edit3 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                Show untitled only
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
              className="h-9 w-9 sm:h-8 sm:w-8 p-0 flex-shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MatchRing } from "@/components/ui/match-ring";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Job } from "@shared/schema";
import { Building2, Calendar, MapPin, ChevronRight, ExternalLink, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateJob, deleteJob } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export function JobCard({ job }: { job: Job }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => updateJob(job.id, { status }),
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({
        title: "Status updated",
        description: `Job status updated to ${status}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: () => deleteJob(job.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({
        title: "Job deleted",
        description: `"${job.title}" has been removed`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleViewLink = () => {
    // Change status to "viewed" when link is opened (not "applied")
    updateStatusMutation.mutate("viewed");
    if (job.url) {
      window.open(job.url, "_blank");
    }
  };

  const handleToggleApplied = (checked: boolean) => {
    updateJob(job.id, { isApplied: checked }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({
        title: checked ? "Marked as applied" : "Unmarked as applied",
        description: `"${job.title}" ${checked ? "has been marked as applied" : "is no longer marked as applied"}`,
      });
    }).catch((error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    });
  };

  const handleViewAnalysis = () => {
    // Navigate to ATS Analyzer with this job's data pre-filled
    window.location.href = `/ats-analyzer?jobId=${job.id}`;
  };
  return (
    <Card className="group relative overflow-hidden border-border/50 bg-card/50 hover:bg-card/80 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 md:pb-16">
      <div className="p-4 md:p-5 flex items-start gap-4 md:gap-5">
        {/* Match Score */}
        <div className="flex-shrink-0 pt-1">
          <MatchRing score={job.matchScore || 0} size="md" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base sm:text-lg leading-tight group-hover:text-primary transition-colors">
                {job.title}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground mt-1">
                <div className="flex items-center gap-1 min-w-0">
                  <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{job.company}</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{job.location}</span>
                </div>
                {job.postedDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{job.postedDate}</span>
                  </div>
                )}
                {job.createdAt && (
                  <div className="flex items-center gap-1" title={new Date(job.createdAt).toLocaleString()}>
                    <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Scanned {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
              <Badge variant={job.status === "pending" ? "outline" : job.status === "viewed" ? "secondary" : "secondary"} className="capitalize font-mono text-xs">
                {job.status === "applied" ? "viewed" : job.status}
              </Badge>
              {job.isApplied && (
                <Badge variant="default" className="gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" />
                  Applied
                </Badge>
              )}
            </div>
          </div>

          {/* Tags */}
          {job.tags && job.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {job.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-md bg-muted/50 text-xs text-muted-foreground font-mono border border-transparent group-hover:border-primary/20 transition-colors">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Reasoning Preview - only show 1 line */}
          {job.matchReasoning && job.matchReasoning.length > 0 && (
            <div className="text-sm text-muted-foreground/80 line-clamp-1 italic pl-3 border-l-2 border-primary/30">
              "{job.matchReasoning[0]}"
            </div>
          )}
        </div>
      </div>

      {/* Actions - always visible on desktop, visible on mobile */}
      <div className="mt-4 pt-4 border-t border-border/50 md:border-0 md:mt-0 md:pt-0 md:absolute md:bottom-0 md:right-0 md:pr-5 md:pb-4 md:bg-gradient-to-l md:from-card md:via-card/90 md:to-transparent md:pl-12 flex flex-col sm:flex-row gap-2 px-4 pb-4">
        <Button 
          size="sm" 
          variant="secondary" 
          className="h-9 md:h-8 w-full sm:w-auto"
          onClick={handleViewAnalysis}
          disabled={updateStatusMutation.isPending || deleteJobMutation.isPending}
        >
          View Analysis
        </Button>
        <div className="flex items-center justify-center gap-2 h-9 md:h-8 px-3 rounded-md border border-border bg-background w-full sm:w-auto">
          <Checkbox
            id={`applied-${job.id}`}
            checked={job.isApplied || false}
            onCheckedChange={handleToggleApplied}
            disabled={updateStatusMutation.isPending || deleteJobMutation.isPending}
          />
          <label
            htmlFor={`applied-${job.id}`}
            className="text-sm font-medium cursor-pointer select-none"
          >
            Applied
          </label>
        </div>
        <Button 
          size="sm" 
          className="h-9 md:h-8 gap-1 w-full sm:w-auto"
          onClick={handleViewLink}
          disabled={updateStatusMutation.isPending || deleteJobMutation.isPending}
        >
          {job.status === "viewed" ? "View Again" : "View Link"} 
          <ExternalLink className="h-3 w-3" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-9 md:h-8 gap-1.5 w-full sm:w-auto border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground flex-shrink-0"
              disabled={updateStatusMutation.isPending || deleteJobMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Job</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{job.title}" at {job.company}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteJobMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteJobMutation.isPending}
              >
                {deleteJobMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}

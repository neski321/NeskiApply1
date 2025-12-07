import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MatchRing } from "@/components/ui/match-ring";
import type { Job } from "@shared/schema";
import { Building2, Calendar, MapPin, ChevronRight, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateJob } from "@/lib/api";
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

  const handleApply = () => {
    updateStatusMutation.mutate("applied");
    if (job.url) {
      window.open(job.url, "_blank");
    }
  };

  const handleViewAnalysis = () => {
    // Navigate to ATS Analyzer with this job's data pre-filled
    window.location.href = `/ats-analyzer?jobId=${job.id}`;
  };
  return (
    <Card className="group relative overflow-hidden border-border/50 bg-card/50 hover:bg-card/80 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      <div className="p-5 flex items-start gap-5">
        {/* Match Score */}
        <div className="flex-shrink-0 pt-1">
          <MatchRing score={job.matchScore || 0} size="md" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors truncate pr-4">
                {job.title}
              </h3>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <div className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {job.company}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {job.location}
                </div>
                {job.postedDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {job.postedDate}
                  </div>
                )}
              </div>
            </div>
            <Badge variant={job.status === "pending" ? "outline" : "secondary"} className="capitalize font-mono text-xs">
              {job.status}
            </Badge>
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

      {/* Actions Overlay - appears on hover or always visible on mobile */}
      <div className="absolute bottom-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-gradient-to-l from-card via-card/90 to-transparent pl-12">
        <Button 
          size="sm" 
          variant="secondary" 
          className="h-8"
          onClick={handleViewAnalysis}
          disabled={updateStatusMutation.isPending}
        >
          View Analysis
        </Button>
        <Button 
          size="sm" 
          className="h-8 gap-1"
          onClick={handleApply}
          disabled={updateStatusMutation.isPending || job.status === "applied"}
        >
          {job.status === "applied" ? "Applied" : "Apply Now"} 
          {job.status !== "applied" && <ExternalLink className="h-3 w-3" />}
        </Button>
      </div>
    </Card>
  );
}

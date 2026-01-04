import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MatchRing } from "@/components/ui/match-ring";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Job } from "@shared/schema";
import { 
  Building2, 
  Calendar, 
  MapPin, 
  ExternalLink, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  Briefcase,
  DollarSign,
  FileText,
  MessageSquare,
  AlertCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateJob, deleteJob } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
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

interface JobDetailModalProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JobDetailModal({ job, open, onOpenChange }: JobDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateJobMutation = useMutation({
    mutationFn: (data: Partial<Job>) => updateJob(job!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
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
    mutationFn: () => deleteJob(job!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({
        title: "Job deleted",
        description: `"${job!.title}" has been removed`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!job) return null;

  const handleToggleApplied = (checked: boolean) => {
    updateJobMutation.mutate({ isApplied: checked });
    toast({
      title: checked ? "Marked as applied" : "Unmarked as applied",
      description: `"${job.title}" ${checked ? "has been marked as applied" : "is no longer marked as applied"}`,
    });
  };

  const handleToggleInterview = (checked: boolean) => {
    updateJobMutation.mutate({ gotInterview: checked });
    toast({
      title: checked ? "Got interview!" : "Removed interview status",
      description: checked 
        ? `Congratulations! You got an interview for "${job.title}"`
        : `Removed interview status for "${job.title}"`,
    });
  };

  const handleToggleRejected = (checked: boolean) => {
    updateJobMutation.mutate({ rejected: checked });
    toast({
      title: checked ? "Marked as rejected" : "Removed rejection status",
      description: checked
        ? `"${job.title}" has been marked as rejected`
        : `Removed rejection status for "${job.title}"`,
    });
  };

  const handleViewLink = () => {
    updateJobMutation.mutate({ status: "viewed" });
    if (job.url) {
      window.open(job.url, "_blank");
    }
  };

  const handleViewAnalysis = () => {
    onOpenChange(false);
    window.location.href = `/ats-analyzer?jobId=${job.id}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl sm:text-2xl font-bold leading-tight pr-8">
                {job.title}
              </DialogTitle>
              <DialogDescription className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">{job.company}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span>{job.location}</span>
                </div>
                {job.postedDate && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>{job.postedDate}</span>
                  </div>
                )}
                {job.createdAt && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    <span>Scanned {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>
                  </div>
                )}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <MatchRing score={job.matchScore || 0} size="lg" />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={job.status === "pending" ? "outline" : "secondary"} className="capitalize font-mono text-xs">
              {job.status === "applied" ? "viewed" : job.status}
            </Badge>
            {job.isApplied && (
              <Badge variant="default" className="gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Applied
              </Badge>
            )}
            {job.gotInterview && (
              <Badge variant="default" className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700">
                <MessageSquare className="h-3 w-3" />
                Got Interview
              </Badge>
            )}
            {job.rejected && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertCircle className="h-3 w-3" />
                Rejected
              </Badge>
            )}
            {job.source && (
              <Badge variant="outline" className="text-xs">
                {job.source}
              </Badge>
            )}
          </div>

          {/* Job Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {job.salary && (
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Salary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base font-semibold">{job.salary}</p>
                </CardContent>
              </Card>
            )}
            {job.tags && job.tags.length > 0 && (
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Tags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {job.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Match Reasoning */}
          {job.matchReasoning && job.matchReasoning.length > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Match Reasoning
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {job.matchReasoning.map((reason, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Job Description */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Job Description</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
                  {job.description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Requirements */}
          {job.requirements && job.requirements.length > 0 && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {job.requirements.map((req, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Action Toggles */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold">Job Status</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Applied Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-card/30">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div>
                    <label htmlFor={`applied-${job.id}`} className="text-sm font-medium cursor-pointer">
                      Applied
                    </label>
                    <p className="text-xs text-muted-foreground">Mark if you've applied to this job</p>
                  </div>
                </div>
                <Checkbox
                  id={`applied-${job.id}`}
                  checked={job.isApplied || false}
                  onCheckedChange={handleToggleApplied}
                  disabled={updateJobMutation.isPending || deleteJobMutation.isPending}
                />
              </div>

              {/* Interview Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-card/30">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-emerald-500" />
                  <div>
                    <label htmlFor={`interview-${job.id}`} className="text-sm font-medium cursor-pointer">
                      Got Interview
                    </label>
                    <p className="text-xs text-muted-foreground">Mark if you received an interview</p>
                  </div>
                </div>
                <Checkbox
                  id={`interview-${job.id}`}
                  checked={job.gotInterview || false}
                  onCheckedChange={handleToggleInterview}
                  disabled={updateJobMutation.isPending || deleteJobMutation.isPending}
                />
              </div>

              {/* Rejected Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-card/30 sm:col-span-2">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <div>
                    <label htmlFor={`rejected-${job.id}`} className="text-sm font-medium cursor-pointer">
                      Rejected
                    </label>
                    <p className="text-xs text-muted-foreground">Mark if you were rejected for this position</p>
                  </div>
                </div>
                <Checkbox
                  id={`rejected-${job.id}`}
                  checked={job.rejected || false}
                  onCheckedChange={handleToggleRejected}
                  disabled={updateJobMutation.isPending || deleteJobMutation.isPending}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleViewAnalysis}
              className="flex-1 gap-2"
              disabled={updateJobMutation.isPending || deleteJobMutation.isPending}
            >
              <FileText className="h-4 w-4" />
              View Analysis
            </Button>
            {job.url && (
              <Button
                onClick={handleViewLink}
                variant="secondary"
                className="flex-1 gap-2"
                disabled={updateJobMutation.isPending || deleteJobMutation.isPending}
              >
                {job.status === "viewed" ? "View Again" : "View Link"}
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground flex-1 sm:flex-initial"
                  disabled={updateJobMutation.isPending || deleteJobMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Job</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{job.title}" at {job.company}? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteJobMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
                    disabled={deleteJobMutation.isPending}
                  >
                    {deleteJobMutation.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


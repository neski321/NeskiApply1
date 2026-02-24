import { Layout } from "@/components/layout/Layout";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInterviewJobs, getInterviewPreps, getSettings, setSetting } from "@/lib/api";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import type { Job } from "@shared/schema";
import { Mic, CalendarCheck, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function InterviewPrep() {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: interviewJobs = [], isLoading } = useQuery({
    queryKey: ["interviewJobs"],
    queryFn: getInterviewJobs,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const interviewPrepProvider = useMemo(() => {
    const interviewSetting = settings.find(s => s.key === "interview_prep_ai_provider");
    const mainSetting = settings.find(s => s.key === "ai_provider_preference");
    return interviewSetting?.value || mainSetting?.value || "auto";
  }, [settings]);

  const [aiProvider, setAiProvider] = useState<string>(interviewPrepProvider);

  useEffect(() => {
    setAiProvider(interviewPrepProvider);
  }, [interviewPrepProvider]);

  const saveProviderMutation = useMutation({
    mutationFn: (value: string) => setSetting("interview_prep_ai_provider", value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({
        title: "AI provider updated",
        description: "Interview prep questions will use the selected AI model.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleProviderChange = (value: string) => {
    setAiProvider(value);
    saveProviderMutation.mutate(value);
  };

  const handleJobClick = async (job: Job) => {
    try {
      const preps = await queryClient.fetchQuery({
        queryKey: ["interviewPreps", job.id],
        queryFn: () => getInterviewPreps(job.id),
      });
      if (preps && preps.length > 0) {
        const latest = [...preps].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        setLocation(`/interview-prep/session?jobId=${job.id}&resumeId=${latest.resumeId}&source=${latest.resumeSource}`);
        return;
      }
    } catch {
      // If the prep lookup fails for any reason, fall back to showing the job details modal.
    }
    setSelectedJob(job);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 md:gap-6 h-full w-full">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Mic className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              Interview Prep
            </h1>
            <p className="text-sm text-muted-foreground">
              Jobs you&apos;ve marked as &quot;Got Interview&quot;. Use this page to prepare and review before your interviews.
            </p>
          </div>

          <Card className="bg-card/50 border-border/50">
            <CardContent className="pt-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  AI Model for Interview Questions
                </Label>
                <Select value={aiProvider} onValueChange={handleProviderChange} disabled={saveProviderMutation.isPending}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Select AI model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Default (from Settings)</SelectItem>
                    <SelectItem value="perplexity">Perplexity Only</SelectItem>
                    <SelectItem value="gemini">Gemini Only</SelectItem>
                    <SelectItem value="openrouter">OpenRouter Only</SelectItem>
                    <SelectItem value="perplexity,gemini">Perplexity → Gemini</SelectItem>
                    <SelectItem value="perplexity,openrouter">Perplexity → OpenRouter</SelectItem>
                    <SelectItem value="gemini,openrouter">Gemini → OpenRouter</SelectItem>
                    <SelectItem value="perplexity,gemini,openrouter">Perplexity → Gemini → OpenRouter</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {aiProvider === "auto"
                    ? "Uses the Interview Prep AI Provider from Settings (AI Services tab)."
                    : "This model will be used to generate interview prep questions from job descriptions."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading interview jobs...</div>
        ) : interviewJobs.length === 0 ? (
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-10 w-10 text-muted-foreground" />
                <div>
                  <CardTitle>No interview jobs yet</CardTitle>
                  <CardDescription>
                    Mark jobs as &quot;Got Interview&quot; from the Job Feed or job details to see them here. 
                    This helps you keep track of upcoming interviews and prepare effectively.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Go to the <a href="/jobs" className="text-primary hover:underline">Job Feed</a> to find jobs 
                and check the &quot;Got Interview&quot; checkbox in the job details when you get an interview.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              {interviewJobs.length} job{interviewJobs.length !== 1 ? "s" : ""} with interviews
            </div>
            <div className="grid gap-4 pb-10">
              {interviewJobs.map((job) => (
                <JobCard key={job.id} job={job} onJobClick={handleJobClick} />
              ))}
            </div>
          </>
        )}
      </div>

      <JobDetailModal
        job={selectedJob}
        open={!!selectedJob}
        onOpenChange={(open) => !open && setSelectedJob(null)}
        onJobUpdate={(updatedJob) => setSelectedJob(updatedJob)}
        onStartInterviewPrep={(jobId, resumeId, source) => {
          setSelectedJob(null);
          setLocation(`/interview-prep/session?jobId=${jobId}&resumeId=${resumeId}&source=${source}`);
        }}
      />
    </Layout>
  );
}

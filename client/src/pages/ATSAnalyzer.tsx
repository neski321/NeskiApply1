import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MatchRing } from "@/components/ui/match-ring";
import { ArrowRight, Wand2, AlertTriangle, CheckCircle2, FileText, Search, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { analyzeJob, getResumes, getATSAnalysisByJobId, getJobs } from "@/lib/api";
import type { ATSAnalysis } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function ATSAnalyzer() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analysisResult, setAnalysisResult] = useState<ATSAnalysis | null>(null);
  
  // Get jobId from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const jobIdParam = urlParams.get("jobId");
  const jobId = jobIdParam ? parseInt(jobIdParam) : null;

  // Load existing analysis if jobId is provided
  const { data: existingAnalysis, isLoading: isLoadingAnalysis, error: analysisError } = useQuery({
    queryKey: ["atsAnalysis", jobId],
    queryFn: () => {
      if (!jobId) return null;
      return getATSAnalysisByJobId(jobId);
    },
    enabled: !!jobId,
    retry: false,
  });

  // Sync existing analysis data to state when it loads
  useEffect(() => {
    if (existingAnalysis) {
      setAnalysisResult(existingAnalysis);
      setJobTitle(existingAnalysis.jobTitle);
      setJobCompany(existingAnalysis.jobCompany || "");
      setJobDescription(existingAnalysis.jobDescription);
      toast({
        title: "Analysis loaded",
        description: "Showing existing analysis for this job.",
      });
    }
  }, [existingAnalysis]);

  // Load job details if analysis doesn't exist
  useEffect(() => {
    if (jobId && analysisError && analysisError.message.includes("not found")) {
      loadJobDetails(jobId);
    }
  }, [jobId, analysisError]);

  const loadJobDetails = async (jobId: number) => {
    try {
      const jobs = await getJobs({});
      const job = jobs.find(j => j.id === jobId);
      if (job) {
        setJobTitle(job.title);
        setJobCompany(job.company);
        setJobDescription(job.description);
        toast({
          title: "Analysis not found",
          description: "This job hasn't been analyzed yet. You can analyze it below.",
          variant: "default",
        });
      } else {
        throw new Error("Job not found");
      }
    } catch (error) {
      toast({
        title: "Job not found",
        description: "Could not load job details.",
        variant: "destructive",
      });
    }
  };

  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: getResumes,
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeJob,
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "Analysis Complete",
        description: "Your job description has been analyzed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = () => {
    if (!jobDescription) {
      toast({
        title: "Missing Job Description",
        description: "Please paste a job description to analyze.",
        variant: "destructive",
      });
      return;
    }

    analyzeMutation.mutate({
      jobTitle: jobTitle || "Untitled Job",
      jobCompany,
      jobDescription,
      jobId: jobId || undefined,
    });
  };

  const bestResume = analysisResult ? resumes.find(r => r.id === analysisResult.bestResumeId) : null;
  const suggestions = analysisResult?.suggestions as Array<{title: string; description: string; type: string}> || [];
  const comparisons = analysisResult?.resumeComparisons as Array<{resumeId: number; resumeName: string; score: number}> || [];

  return (
    <Layout>
      <div className="flex flex-col gap-8 pb-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wand2 className="h-8 w-8 text-primary" />
            ATS Optimizer
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Paste a job description below to check compatibility against your resumes and get AI-powered tailoring suggestions.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Input */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="bg-card/50 border-border/50 h-full flex flex-col">
              <CardHeader>
                <CardTitle>Job Details</CardTitle>
                <CardDescription>Paste the target job description here.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Job Title</Label>
                    <Input 
                      placeholder="e.g. Senior React Developer" 
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input 
                      placeholder="e.g. Tech Corp" 
                      value={jobCompany}
                      onChange={(e) => setJobCompany(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="space-y-2 flex-1 flex flex-col">
                  <Label>Job Description</Label>
                  <Textarea 
                    placeholder="Paste the full job description here..." 
                    className="flex-1 min-h-[300px] font-mono text-sm resize-none bg-background/50"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                  />
                </div>

                <Button 
                  size="lg" 
                  className="w-full mt-2 gap-2 shadow-[0_0_20px_-5px_var(--color-primary)]" 
                  onClick={handleAnalyze}
                  disabled={analyzeMutation.isPending || !jobDescription || resumes.length === 0}
                  variant={existingAnalysis ? "outline" : "default"}
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Analyzing with AI...
                    </>
                  ) : existingAnalysis ? (
                    <>
                      <Search className="h-4 w-4" /> Re-analyze Job
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" /> Analyze & Compare
                    </>
                  )}
                </Button>
                
                {existingAnalysis && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Viewing existing analysis below. Click "Re-analyze Job" to create a new analysis.
                  </p>
                )}
                
                {resumes.length === 0 && (
                  <p className="text-sm text-destructive text-center">
                    Please add at least one resume in the Resumes page first.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7 space-y-6">
            {isLoadingAnalysis ? (
              <div className="h-full min-h-[500px] rounded-xl border border-dashed border-border/50 bg-card/20 flex flex-col items-center justify-center text-center p-8 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div>
                  <h3 className="text-lg font-medium">Loading Analysis</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto mt-2">
                    Loading existing analysis for this job...
                  </p>
                </div>
              </div>
            ) : !analysisResult ? (
              <div className="h-full min-h-[500px] rounded-xl border border-dashed border-border/50 bg-card/20 flex flex-col items-center justify-center text-center p-8 gap-4">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-primary/50" />
                </div>
                <div>
                  <h3 className="text-lg font-medium">Ready to Analyze</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto mt-2">
                    Our AI will scan your resumes against the job description to find the best match and suggest keywords.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Best Match Banner */}
                <div className="rounded-xl bg-gradient-to-br from-primary/20 via-card to-card border border-primary/50 p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                  
                  <div className="flex items-center gap-6 relative z-10">
                    <MatchRing score={analysisResult.matchScore} size="lg" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/50">Recommended Resume</Badge>
                        <span className="text-xs text-muted-foreground">Matched against {resumes.length} resumes</span>
                      </div>
                      <h2 className="text-2xl font-bold">{bestResume?.name || "Unknown Resume"}</h2>
                      <p className="text-muted-foreground">
                        This resume has the strongest alignment with the technical requirements.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Analysis & Improvements */}
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-amber-500" />
                      Tailoring Suggestions
                    </CardTitle>
                    <CardDescription>
                      Follow these steps to increase your match score.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    
                    {/* Missing Keywords */}
                    {analysisResult.missingKeywords.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Critical Missing Keywords</Label>
                        <div className="flex flex-wrap gap-2">
                          {analysisResult.missingKeywords.map(keyword => (
                            <Badge key={keyword} variant="outline" className="border-destructive/50 text-destructive bg-destructive/5 gap-1 pl-1 pr-2 py-1">
                              <AlertTriangle className="h-3 w-3" /> {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actionable Steps */}
                    {suggestions.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Action Plan</Label>
                        <div className="space-y-3">
                          {suggestions.map((step, i) => (
                            <div key={i} className="flex gap-4 p-4 rounded-lg bg-background/50 border border-border/50">
                              <div className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                                {i + 1}
                              </div>
                              <div>
                                <h4 className="font-medium text-sm">{step.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </CardContent>
                </Card>

                {/* Other Resumes Comparison */}
                {comparisons.length > 0 && (
                  <Card className="bg-card/50 border-border/50">
                     <CardHeader className="pb-2">
                       <CardTitle className="text-base">Other Candidates</CardTitle>
                     </CardHeader>
                     <CardContent>
                       <div className="space-y-1">
                         {comparisons
                           .filter(comp => comp.resumeId !== analysisResult.bestResumeId)
                           .map(comp => (
                             <div key={comp.resumeId} className="flex items-center justify-between p-3 rounded-md hover:bg-accent/50 transition-colors">
                               <div className="flex items-center gap-3">
                                 <div className="p-2 rounded bg-muted text-muted-foreground">
                                   <FileText className="h-4 w-4" />
                                 </div>
                                 <div>
                                   <p className="font-medium text-sm">{comp.resumeName}</p>
                                 </div>
                               </div>
                               <div className="flex items-center gap-3">
                                 <span className="text-sm font-mono text-muted-foreground">
                                   {comp.score}%
                                 </span>
                               </div>
                             </div>
                           ))}
                       </div>
                     </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

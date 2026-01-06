import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getResumes, getJobs, optimizeResume, getATSAnalysisByJobId, type OptimizedResume, type OptimizeResumeResponse } from "@/lib/api";
import { FileText, Sparkles, Download, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Brain } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ResumeOptimizer() {
  const { toast } = useToast();
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [optimizationResult, setOptimizationResult] = useState<OptimizeResumeResponse | null>(null);

  const { data: resumes = [], isLoading: resumesLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: getResumes,
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => getJobs(),
  });

  // Fetch ATS analysis when job is selected
  const { data: atsAnalysis, isLoading: atsLoading } = useQuery({
    queryKey: ["atsAnalysis", selectedJobId, selectedResumeId],
    queryFn: async () => {
      if (!selectedJobId || !selectedResumeId) return null;
      try {
        const analysis = await getATSAnalysisByJobId(selectedJobId);
        // Only use if it's for the selected resume
        if (analysis && analysis.bestResumeId === selectedResumeId) {
          return analysis;
        }
        return null;
      } catch (error: any) {
        // Analysis not found or other error - that's okay
        if (error.message?.includes("not found") || error.message?.includes("404")) {
          return null;
        }
        // Re-throw unexpected errors
        throw error;
      }
    },
    enabled: !!selectedJobId && !!selectedResumeId,
    retry: false,
  });

  const optimizeMutation = useMutation({
    mutationFn: ({ resumeId, jobId, atsAnalysisId }: { resumeId: number; jobId: number; atsAnalysisId?: number }) =>
      optimizeResume(resumeId, jobId, atsAnalysisId),
    onSuccess: (data) => {
      setOptimizationResult(data);
      toast({
        title: "Resume optimized",
        description: "Your resume has been optimized for this job. Review the changes below.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Optimization failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOptimize = () => {
    if (!selectedResumeId || !selectedJobId) {
      toast({
        title: "Selection required",
        description: "Please select both a resume and a job to optimize for.",
        variant: "destructive",
      });
      return;
    }
    optimizeMutation.mutate({ 
      resumeId: selectedResumeId, 
      jobId: selectedJobId,
      atsAnalysisId: atsAnalysis?.id,
    });
  };

  const handleReset = () => {
    setOptimizationResult(null);
    setSelectedResumeId(null);
    setSelectedJobId(null);
  };

  const selectedResume = resumes.find((r) => r.id === selectedResumeId);
  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resume Optimizer</h1>
          <p className="text-muted-foreground mt-2">
            Optimize your resume for specific job applications using AI. Only restructures existing content.
          </p>
        </div>

        {!optimizationResult ? (
          <Card>
            <CardHeader>
              <CardTitle>Select Resume & Job</CardTitle>
              <CardDescription>
                Choose a resume to optimize and the job you're applying for
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Resume</label>
                  <Select
                    value={selectedResumeId?.toString() || ""}
                    onValueChange={(value) => setSelectedResumeId(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a resume" />
                    </SelectTrigger>
                    <SelectContent>
                      {resumesLoading ? (
                        <SelectItem value="loading" disabled>Loading resumes...</SelectItem>
                      ) : resumes.length === 0 ? (
                        <SelectItem value="none" disabled>No resumes found</SelectItem>
                      ) : (
                        resumes.map((resume) => (
                          <SelectItem key={resume.id} value={resume.id.toString()}>
                            {resume.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Job</label>
                  <Select
                    value={selectedJobId?.toString() || ""}
                    onValueChange={(value) => setSelectedJobId(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a job" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobsLoading ? (
                        <SelectItem value="loading" disabled>Loading jobs...</SelectItem>
                      ) : jobs.length === 0 ? (
                        <SelectItem value="none" disabled>No jobs found</SelectItem>
                      ) : (
                        jobs.map((job) => (
                          <SelectItem key={job.id} value={job.id.toString()}>
                            {job.title} - {job.company}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedResume && selectedJob && (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{selectedResume.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {selectedJob.title} at {selectedJob.company}
                      </span>
                    </div>
                  </div>

                  {atsLoading ? (
                    <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Checking for ATS analysis...</span>
                    </div>
                  ) : atsAnalysis ? (
                    <div className="rounded-lg border bg-primary/5 border-primary/20 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">ATS Analysis Found</span>
                        <Badge variant="secondary" className="ml-auto">
                          {atsAnalysis.matchScore}/100
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Optimization will use existing ATS analysis results to implement fixes.
                        {atsAnalysis.missingKeywords && atsAnalysis.missingKeywords.length > 0 && (
                          <span className="block mt-1">
                            Missing keywords: {atsAnalysis.missingKeywords.slice(0, 3).join(", ")}
                            {atsAnalysis.missingKeywords.length > 3 && ` +${atsAnalysis.missingKeywords.length - 3} more`}
                          </span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        No ATS analysis found for this job. Optimization will proceed without ATS analysis data.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleOptimize}
                disabled={!selectedResumeId || !selectedJobId || optimizeMutation.isPending}
                className="w-full"
                size="lg"
              >
                {optimizeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Optimizing...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Optimize Resume
                  </>
                )}
              </Button>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  This feature uses Gemini AI to restructure your resume. Only existing content is used - no new information is added.
                  The professional summary will be rewritten to match the job, and bullet points may be reordered for better relevance.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Optimization Results</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Compare the original and optimized versions side-by-side
                </p>
              </div>
              <Button variant="outline" onClick={handleReset}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Optimize Another
              </Button>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Job: {optimizationResult.job.title}</CardTitle>
                    <CardDescription>{optimizationResult.job.company}</CardDescription>
                    {optimizationResult.atsAnalysis && (
                      <div className="flex items-center gap-2 mt-2">
                        <Brain className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs text-muted-foreground">
                          Optimized using ATS Analysis (Match: {optimizationResult.atsAnalysis.matchScore}/100)
                        </span>
                      </div>
                    )}
                  </div>
                  <Badge variant="secondary">
                    {optimizationResult.optimizedResume.changes.length} changes
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="comparison" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="comparison">Side-by-Side Comparison</TabsTrigger>
                    <TabsTrigger value="changes">Changes Made</TabsTrigger>
                  </TabsList>

                  <TabsContent value="comparison" className="mt-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* Original Resume */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <h3 className="font-semibold">Original Resume</h3>
                        </div>
                        <ScrollArea className="h-[600px] rounded-lg border bg-muted/30 p-4">
                          <ResumeView resume={optimizationResult.originalResume} />
                        </ScrollArea>
                      </div>

                      {/* Optimized Resume */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <h3 className="font-semibold">Optimized Resume</h3>
                        </div>
                        <ScrollArea className="h-[600px] rounded-lg border bg-primary/5 p-4">
                          <OptimizedResumeView optimized={optimizationResult.optimizedResume} />
                        </ScrollArea>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="changes" className="mt-6">
                    <div className="space-y-4">
                      <h3 className="font-semibold">Summary of Changes</h3>
                      <div className="space-y-2">
                        {optimizationResult.optimizedResume.changes.map((change, index) => (
                          <div key={index} className="rounded-lg border p-4">
                            <div className="flex items-start gap-3">
                              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                              <div className="flex-1">
                                <div className="font-medium">{change.section}</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {change.description}
                                </div>
                                <Badge variant="outline" className="mt-2">
                                  {change.type.replace(/_/g, " ")}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <Separator className="my-6" />

                <div className="flex gap-4">
                  <Button size="lg" className="flex-1" disabled>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF (Coming Soon)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}

function ResumeView({ resume }: { resume: any }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h4 className="font-semibold mb-2">Professional Summary</h4>
        <p className="text-muted-foreground whitespace-pre-wrap">
          {resume.experience || "Not provided"}
        </p>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Technical Skills</h4>
        <div className="flex flex-wrap gap-2">
          {resume.skills.map((skill: string, index: number) => (
            <Badge key={index} variant="secondary">
              {skill}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Education</h4>
        <p className="text-muted-foreground whitespace-pre-wrap">
          {resume.education || "Not provided"}
        </p>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Experience</h4>
        <p className="text-muted-foreground whitespace-pre-wrap text-xs">
          {resume.rawContent.substring(0, 500)}...
        </p>
      </div>
    </div>
  );
}

function OptimizedResumeView({ optimized }: { optimized: OptimizedResume }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h4 className="font-semibold mb-2">Professional Summary</h4>
        <p className="text-muted-foreground whitespace-pre-wrap">
          {optimized.professionalSummary}
        </p>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Technical Skills</h4>
        {typeof optimized.technicalSkills === 'string' ? (
          <div className="bg-muted/50 rounded-lg p-4 border">
            <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
              {optimized.technicalSkills}
            </pre>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {optimized.technicalSkills.map((skill, index) => (
              <Badge key={index} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="font-semibold mb-2">Education</h4>
        <p className="text-muted-foreground whitespace-pre-wrap">
          {optimized.education || "Not provided"}
        </p>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Relevant Experience</h4>
        <div className="space-y-3">
          {optimized.relevantExperience.map((exp, index) => (
            <div key={index} className="border-l-2 border-primary/20 pl-3">
              <div className="font-medium">{exp.title}</div>
              <div className="text-xs text-muted-foreground">{exp.company}</div>
              <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                {exp.bullets.map((bullet, bulletIndex) => (
                  <li key={bulletIndex}>{bullet}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {optimized.projects && optimized.projects.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">Projects</h4>
          <div className="space-y-3">
            {optimized.projects.map((project, index) => (
              <div key={index} className="border-l-2 border-primary/20 pl-3">
                <div className="font-medium">{project.name}</div>
                <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                  {project.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


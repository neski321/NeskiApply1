import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FileText, Sparkles, Download, CheckCircle2, Brain, TrendingUp, TrendingDown, AlertTriangle, Save, ChevronDown, ChevronUp } from "lucide-react";
import type { OptimizeResumeResponse, OptimizedResume } from "@/lib/api";
import { downloadOptimizedResume } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface OptimizedResumeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: OptimizeResumeResponse;
}

export function OptimizedResumeModal({ open, onOpenChange, result }: OptimizedResumeModalProps) {
  const [isChangesOpen, setIsChangesOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  // Validate result data before rendering
  if (!result || !result.job || !result.originalResume || !result.optimizedResume) {
    return null; // Don't render if data is invalid
  }

  const handleDownload = async () => {
    if (!result.savedOptimizedResume?.id) {
      toast({
        title: "Cannot download",
        description: "This resume hasn't been saved yet.",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);
    try {
      await downloadOptimizedResume(result.savedOptimizedResume.id);
      toast({
        title: "Download started",
        description: "Your optimized resume is being downloaded.",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download resume",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl sm:text-2xl">Optimized Resume</DialogTitle>
              <DialogDescription className="sr-only">
                View your optimized resume for {result.job?.title || "this job"} at {result.job?.company || "this company"}
              </DialogDescription>
              <div className="mt-2 space-y-1">
                <div className="text-xs sm:text-sm text-muted-foreground">
                  <span className="font-medium">Job:</span> {result.job?.title || "Unknown"} at {result.job?.company || "Unknown"}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="text-xs truncate">
                    <span className="font-medium">Original Resume:</span> {result.originalResume?.name || "Unknown Resume"}
                  </span>
                </div>
                {result.atsAnalysis && (
                  <div className="flex items-center gap-2 mt-1">
                    <Brain className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs">
                      Using ATS Analysis (Match: {result.atsAnalysis.matchScore}/100)
                    </span>
                  </div>
                )}
                {result.savedOptimizedResume && (
                  <div className="flex items-center gap-2 mt-1">
                    <Save className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-xs text-emerald-600">
                      Saved - You can download this later from your saved optimized resumes
                    </span>
                  </div>
                )}
              </div>
            </div>
            <Badge variant="secondary" className="self-start sm:self-auto">
              {result.optimizedResume.changes.length} changes
            </Badge>
          </div>
        </DialogHeader>

        {/* Score Comparison */}
        {result.optimizedAnalysis && (
          <div className="mt-4 space-y-3">
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  ATS Score Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="grid grid-cols-3 gap-3 sm:gap-4 py-3 sm:py-2">
                  <div className="text-center space-y-1.5 sm:space-y-1">
                    <div className="text-[10px] sm:text-sm font-medium sm:font-normal text-muted-foreground uppercase sm:normal-case tracking-wide sm:tracking-normal mb-1 sm:mb-1">Original Score</div>
                    <div className="text-2xl sm:text-2xl font-bold">{result.optimizedAnalysis.originalScore}<span className="text-base sm:text-base text-muted-foreground">/100</span></div>
                  </div>
                  <div className="text-center space-y-1.5 sm:space-y-1 border-x border-border/50 px-1 sm:px-0">
                    <div className="text-[10px] sm:text-sm font-medium sm:font-normal text-muted-foreground uppercase sm:normal-case tracking-wide sm:tracking-normal mb-1 sm:mb-1">New Score</div>
                    <div className={`text-2xl sm:text-2xl font-bold flex items-center justify-center gap-1 ${
                      result.optimizedAnalysis.improved ? "text-emerald-600" : "text-amber-600"
                    }`}>
                      {result.optimizedAnalysis.newScore}<span className="text-base sm:text-base">/100</span>
                      {result.optimizedAnalysis.improved ? (
                        <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                      ) : (
                        <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5" />
                      )}
                    </div>
                  </div>
                  <div className="text-center space-y-1.5 sm:space-y-1">
                    <div className="text-[10px] sm:text-sm font-medium sm:font-normal text-muted-foreground uppercase sm:normal-case tracking-wide sm:tracking-normal mb-1 sm:mb-1">Change</div>
                    <div className={`text-2xl sm:text-2xl font-bold ${
                      result.optimizedAnalysis.scoreImprovement > 0 
                        ? "text-emerald-600" 
                        : result.optimizedAnalysis.scoreImprovement < 0
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}>
                      {result.optimizedAnalysis.scoreImprovement > 0 ? "+" : ""}
                      {result.optimizedAnalysis.scoreImprovement}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!result.optimizedAnalysis.improved && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Score Not Improved</AlertTitle>
                <AlertDescription>
                  The optimized resume did not achieve a higher ATS score than the original. 
                  This may indicate that the resume is already well-optimized for this position, 
                  or that manual tweaking is needed to further improve the match. Consider:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Adding more relevant keywords from the job description</li>
                    <li>Restructuring content to better highlight matching skills</li>
                    <li>Emphasizing experience that directly relates to job requirements</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {result.optimizedAnalysis.improved && (
              <Alert className="border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle className="text-emerald-900 dark:text-emerald-100">Score Improved!</AlertTitle>
                <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                  Great news! The optimized resume achieved a {result.optimizedAnalysis.scoreImprovement}-point improvement 
                  in the ATS score. The optimization successfully enhanced the resume's match with this job.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="mt-6">
          <Tabs defaultValue="comparison" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-auto">
              <TabsTrigger value="comparison" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                <span className="hidden sm:inline">Side-by-Side Comparison</span>
                <span className="sm:hidden">Compare</span>
              </TabsTrigger>
              <TabsTrigger value="changes" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                <span className="hidden sm:inline">Changes Made</span>
                <span className="sm:hidden">Changes</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="comparison" className="mt-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Original Resume */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <h3 className="font-semibold text-sm sm:text-base">Original Resume</h3>
                  </div>
                  <ScrollArea className="h-[400px] sm:h-[500px] md:h-[600px] rounded-lg border bg-muted/30 p-3 sm:p-4">
                    <ResumeView resume={result.originalResume} />
                  </ScrollArea>
                </div>

                {/* Optimized Resume */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm sm:text-base">Optimized Resume</h3>
                  </div>
                  <ScrollArea className="h-[400px] sm:h-[500px] md:h-[600px] rounded-lg border bg-primary/5 p-3 sm:p-4">
                    <OptimizedResumeView optimized={result.optimizedResume} />
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="changes" className="mt-6">
              <Collapsible open={isChangesOpen} onOpenChange={setIsChangesOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent mb-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Summary of Changes ({result.optimizedResume.changes.length})
                    </h3>
                    {isChangesOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2">
                    {result.optimizedResume.changes.map((change, index) => (
                      <div key={`change-${change.section}-${change.type}-${index}`} className="rounded-lg border p-4">
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
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>
          </Tabs>

          <Separator className="my-6" />

          <div className="flex gap-4">
            <Button 
              size="lg" 
              className="flex-1"
              onClick={handleDownload}
              disabled={isDownloading || !result.savedOptimizedResume}
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? "Downloading..." : "Download PDF"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
          {resume.skills && Array.isArray(resume.skills) && resume.skills.length > 0 ? (
            resume.skills.map((skill: string, index: number) => (
              <Badge key={`resume-skill-${skill}-${index}`} variant="secondary">
                {skill}
              </Badge>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">No skills listed</p>
          )}
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
              <Badge key={`opt-tech-skill-${skill}-${index}`} variant="secondary">
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
            <div key={`modal-exp-${exp.title}-${exp.company}-${index}`} className="border-l-2 border-primary/20 pl-3">
              <div className="font-medium">{exp.title}</div>
              <div className="text-xs text-muted-foreground">{exp.company}</div>
              <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                {exp.bullets.map((bullet, bulletIndex) => (
                  <li key={`modal-exp-${index}-bullet-${bulletIndex}`}>{bullet}</li>
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
              <div key={`modal-project-${project.name}-${index}`} className="border-l-2 border-primary/20 pl-3">
                <div className="font-medium">{project.name}</div>
                <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                  {project.bullets.map((bullet, bulletIndex) => (
                    <li key={`modal-project-${index}-bullet-${bulletIndex}`}>{bullet}</li>
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


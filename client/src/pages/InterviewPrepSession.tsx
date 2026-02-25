import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getJob, getResumes, getInterviewResumes, getInterviewPreps, generateInterviewPrep, answerInterviewQuestions, answerBehavioralQuestions, simplifyInterviewAnswers, type InterviewPrepMode } from "@/lib/api";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic, ArrowLeft, Loader2, MessageSquare, Code2, Zap, Maximize2, ChevronLeft, ChevronRight, List, LayoutGrid, Sparkles, Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Strip leftover markdown symbols so display is always clean plain text. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_]+?)__/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/^[-*•]\s+/gm, "  ")
    .replace(/\*\*/g, "")
    .replace(/^---+\s*$/gm, "")
    .replace(/^#+\s*$/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split prep content into segments for one-by-one view: by numbered items (1. 2.) or by double newline. */
function parsePrepSegments(content: string): string[] {
  const trimmed = stripMarkdown(content);
  if (!trimmed) return [];
  const numbered = trimmed.split(/\n(?=\d+[.)]\s)/m).map((s) => s.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered;
  const paragraphs = trimmed.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  return paragraphs.length >= 1 ? paragraphs : [trimmed];
}

const MODES: { id: InterviewPrepMode; label: string; description: string; icon: typeof MessageSquare }[] = [
  { id: "screening", label: "Screening", description: "First-round questions (recruiter + hiring manager), behavioral + light technical.", icon: MessageSquare },
  { id: "technical_deep_dive", label: "Technical Deep Dive", description: "Challenging technical questions, architecture, debugging, scenario-based.", icon: Code2 },
  { id: "pressure_test", label: "Pressure Test", description: "Skeptical senior interviewer, probing follow-ups, stress-test ownership & edge cases.", icon: Zap },
];

function useQueryParams() {
  const [location] = useLocation();
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function ExpandDialogBody({
  content,
  viewMode,
  setViewMode,
  oneByOneIndex,
  setOneByOneIndex,
}: {
  content: string;
  viewMode: "full" | "onebyone";
  setViewMode: (m: "full" | "onebyone") => void;
  oneByOneIndex: number;
  setOneByOneIndex: (n: number) => void;
}) {
  const cleaned = useMemo(() => stripMarkdown(content), [content]);
  const segments = useMemo(() => parsePrepSegments(content), [content]);
  const total = segments.length;
  const currentSegment = total > 0 ? segments[Math.min(oneByOneIndex, total - 1)] : "";
  const canPrev = oneByOneIndex > 0;
  const canNext = oneByOneIndex < total - 1;

  return (
    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "full" | "onebyone")} className="flex flex-col overflow-hidden min-h-0" style={{ maxHeight: "calc(85vh - 120px)" }}>
      <TabsList className="grid w-full grid-cols-2 mb-3 shrink-0">
        <TabsTrigger value="full" className="gap-2">
          <LayoutGrid className="h-4 w-4" />
          Full view
        </TabsTrigger>
        <TabsTrigger value="onebyone" className="gap-2">
          <List className="h-4 w-4" />
          One by one
        </TabsTrigger>
      </TabsList>
      <TabsContent value="full" className="mt-0 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="whitespace-pre-wrap text-foreground leading-relaxed">{cleaned}</p>
        </div>
      </TabsContent>
      <TabsContent value="onebyone" className="mt-0 overflow-hidden flex flex-col min-h-0 gap-3">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No segments to show.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                {oneByOneIndex + 1} of {total}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setOneByOneIndex(Math.max(0, oneByOneIndex - 1))}
                  disabled={!canPrev}
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setOneByOneIndex(Math.min(total - 1, oneByOneIndex + 1))}
                  disabled={!canNext}
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="overflow-y-auto rounded-xl border bg-card p-5 text-sm shadow-sm min-h-0">
              <p className="whitespace-pre-wrap text-foreground leading-relaxed">{currentSegment}</p>
            </div>
            {total > 1 && (
              <div className="flex gap-1 justify-center flex-wrap shrink-0 py-1">
                {segments.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setOneByOneIndex(i)}
                    className={cn(
                      "h-2 w-2 rounded-full transition-colors",
                      i === oneByOneIndex ? "bg-primary scale-125" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                    aria-label={`Go to question ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

export default function InterviewPrepSession() {
  const searchParams = useQueryParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedPrep, setExpandedPrep] = useState<{ label: string; content: string } | null>(null);
  const [viewMode, setViewMode] = useState<"full" | "onebyone">("full");
  const [oneByOneIndex, setOneByOneIndex] = useState(0);
  const [askedQuestionsText, setAskedQuestionsText] = useState("");
  const [answersContent, setAnswersContent] = useState<string | null>(null);
  const [behavioralQuestionsText, setBehavioralQuestionsText] = useState("");
  const [behavioralAnswersContent, setBehavioralAnswersContent] = useState<string | null>(null);

  const jobId = searchParams.get("jobId");
  const resumeId = searchParams.get("resumeId");
  const source = searchParams.get("source") as "resume" | "interview_resume" | null;

  const jobIdNum = jobId ? parseInt(jobId, 10) : null;
  const resumeIdNum = resumeId ? parseInt(resumeId, 10) : null;

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ["job", jobIdNum],
    queryFn: () => getJob(jobIdNum!),
    enabled: !!jobIdNum,
  });

  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: getResumes,
    enabled: !!jobIdNum,
  });

  const { data: interviewResumes = [] } = useQuery({
    queryKey: ["interviewResumes"],
    queryFn: getInterviewResumes,
    enabled: !!jobIdNum,
  });

  const resumeName =
    source && resumeIdNum
      ? source === "resume"
        ? resumes.find((r) => r.id === resumeIdNum)?.name
        : interviewResumes.find((r) => r.id === resumeIdNum)?.name
      : null;

  const { data: preps = [] } = useQuery({
    queryKey: ["interviewPreps", jobIdNum],
    queryFn: () => getInterviewPreps(jobIdNum!),
    enabled: !!jobIdNum,
  });

  const generateMutation = useMutation({
    mutationFn: ({ mode }: { mode: InterviewPrepMode }) =>
      generateInterviewPrep(jobIdNum!, resumeIdNum!, source!, mode),
    onSuccess: (_, { mode }) => {
      queryClient.invalidateQueries({ queryKey: ["interviewPreps", jobIdNum] });
      toast({
        title: "Interview prep generated",
        description: `${MODES.find((m) => m.id === mode)?.label ?? mode} questions saved.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const answerMutation = useMutation({
    mutationFn: () => answerInterviewQuestions(jobIdNum!, resumeIdNum!, source!, askedQuestionsText),
    onSuccess: (data) => {
      setAnswersContent(data.content);
      toast({
        title: "Answers generated",
        description: `Drafted answers for ${data.questionCount} question${data.questionCount === 1 ? "" : "s"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Answering failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const simplifyMutation = useMutation({
    mutationFn: () => simplifyInterviewAnswers(answersContent!),
    onSuccess: (data) => {
      setAnswersContent(data.content);
      toast({ title: "Answers simplified", description: "Rewrote in simpler, less technical language." });
    },
    onError: (error: Error) => {
      toast({ title: "Simplify failed", description: error.message, variant: "destructive" });
    },
  });

  const behavioralMutation = useMutation({
    mutationFn: () => answerBehavioralQuestions(jobIdNum!, resumeIdNum!, source!, behavioralQuestionsText),
    onSuccess: (data) => {
      setBehavioralAnswersContent(data.content);
      toast({
        title: "Behavioral answers generated",
        description: `Drafted behavioral answers for ${data.questionCount} question${data.questionCount === 1 ? "" : "s"}.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Behavioral answering failed", description: error.message, variant: "destructive" });
    },
  });

  const simplifyBehavioralMutation = useMutation({
    mutationFn: () => simplifyInterviewAnswers(behavioralAnswersContent!),
    onSuccess: (data) => {
      setBehavioralAnswersContent(data.content);
      toast({ title: "Answers simplified", description: "Rewrote in simpler language." });
    },
    onError: (error: Error) => {
      toast({ title: "Simplify failed", description: error.message, variant: "destructive" });
    },
  });

  if (!jobIdNum || !resumeIdNum || !source || (source !== "resume" && source !== "interview_resume")) {
    return (
      <Layout>
        <div className="p-4">
          <p className="text-muted-foreground">Missing job or resume. Start from Interview Prep and choose a job + resume.</p>
          <Button variant="link" className="px-0 mt-2" onClick={() => setLocation("/interview-prep")}>
            Back to Interview Prep
          </Button>
        </div>
      </Layout>
    );
  }

  if (jobLoading || !job) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto">
        <header className="flex items-start gap-4 rounded-xl border bg-card/50 px-5 py-4 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/interview-prep")} aria-label="Back" className="shrink-0 mt-0.5">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mic className="h-5 w-5" />
              </span>
              Interview Prep Session
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {job.title} at {job.company} · {resumeName ?? "Resume"}
            </p>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          {MODES.map(({ id, label, description, icon: Icon }) => {
            const forMode = preps.filter((p) => p.mode === id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const existing = forMode[0] ?? null;
            const isGenerating = generateMutation.isPending && generateMutation.variables?.mode === id;
            return (
              <Card key={id} className="flex flex-col overflow-hidden border-l-4 border-l-primary/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </span>
                    {label}
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3 pt-0">
                  <Button
                    size="sm"
                    onClick={() => generateMutation.mutate({ mode: id })}
                    disabled={isGenerating}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Generating...
                      </>
                    ) : (
                      "Generate questions"
                    )}
                  </Button>
                  {existing && (
                    <>
                      <div className="rounded-lg bg-muted/50 border p-3 text-sm overflow-hidden max-h-44">
                        <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed line-clamp-[8]">{stripMarkdown(existing.content)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => {
                          setExpandedPrep({ label, content: existing.content });
                          setViewMode("full");
                          setOneByOneIndex(0);
                        }}
                      >
                        <Maximize2 className="h-4 w-4" />
                        Expand view
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Answer asked questions</CardTitle>
            <CardDescription>
              Paste questions you’ve already been asked. The AI will draft strong, resume-based answers tailored to this job.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={askedQuestionsText}
              onChange={(e) => setAskedQuestionsText(e.target.value)}
              placeholder={"Paste questions here, one per line.\nExample:\nTell me about yourself\nWhy this company?\nDescribe a time you handled an outage"}
              className="min-h-[120px] leading-relaxed"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => answerMutation.mutate()}
                disabled={answerMutation.isPending || simplifyMutation.isPending || askedQuestionsText.trim().length === 0}
              >
                {answerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating answers...
                  </>
                ) : (
                  "Generate answers"
                )}
              </Button>
              {answersContent && (
                <Button
                  variant="secondary"
                  onClick={() => simplifyMutation.mutate()}
                  disabled={simplifyMutation.isPending || answerMutation.isPending}
                  className="gap-2"
                >
                  {simplifyMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Simplifying...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Simplify answers
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setAskedQuestionsText("");
                  setAnswersContent(null);
                }}
                disabled={(answerMutation.isPending || simplifyMutation.isPending) && askedQuestionsText.trim().length === 0 && !answersContent}
              >
                Clear
              </Button>
            </div>

            {answersContent && (
              <div className="grid gap-2">
                <div className="rounded-lg bg-muted/50 border p-3 text-sm overflow-hidden max-h-56">
                  <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed line-clamp-[10]">{stripMarkdown(answersContent)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    setExpandedPrep({ label: "Answer asked questions", content: answersContent });
                    setViewMode("onebyone");
                    setOneByOneIndex(0);
                  }}
                >
                  <Maximize2 className="h-4 w-4" />
                  Expand (optional one-by-one)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-pink-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-pink-500/10">
                <Heart className="h-4 w-4 text-pink-500" />
              </span>
              Behavioral / Company-aligned answers
            </CardTitle>
            <CardDescription>
              Paste the same or different questions. The AI will answer with a behavioral focus — soft skills, teamwork, leadership, and alignment with what this company values.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={behavioralQuestionsText}
              onChange={(e) => setBehavioralQuestionsText(e.target.value)}
              placeholder={"Paste questions here, one per line.\nExample:\nTell me about a time you resolved a conflict\nHow do you handle tight deadlines?\nWhy do you want to work here?"}
              className="min-h-[120px] leading-relaxed"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => behavioralMutation.mutate()}
                disabled={behavioralMutation.isPending || simplifyBehavioralMutation.isPending || behavioralQuestionsText.trim().length === 0}
              >
                {behavioralMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Generating behavioral answers...
                  </>
                ) : (
                  "Generate behavioral answers"
                )}
              </Button>
              {behavioralAnswersContent && (
                <Button
                  variant="secondary"
                  onClick={() => simplifyBehavioralMutation.mutate()}
                  disabled={simplifyBehavioralMutation.isPending || behavioralMutation.isPending}
                  className="gap-2"
                >
                  {simplifyBehavioralMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Simplifying...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Simplify answers
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setBehavioralQuestionsText("");
                  setBehavioralAnswersContent(null);
                }}
                disabled={(behavioralMutation.isPending || simplifyBehavioralMutation.isPending) && behavioralQuestionsText.trim().length === 0 && !behavioralAnswersContent}
              >
                Clear
              </Button>
            </div>

            {behavioralAnswersContent && (
              <div className="grid gap-2">
                <div className="rounded-lg bg-muted/50 border p-3 text-sm overflow-hidden max-h-56">
                  <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed line-clamp-[10]">{stripMarkdown(behavioralAnswersContent)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    setExpandedPrep({ label: "Behavioral / Company-aligned answers", content: behavioralAnswersContent });
                    setViewMode("onebyone");
                    setOneByOneIndex(0);
                  }}
                >
                  <Maximize2 className="h-4 w-4" />
                  Expand (optional one-by-one)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!expandedPrep} onOpenChange={(open) => !open && setExpandedPrep(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] !flex !flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>{expandedPrep?.label ?? "Interview prep"}</DialogTitle>
            </DialogHeader>
            <ExpandDialogBody
              content={expandedPrep?.content ?? ""}
              viewMode={viewMode}
              setViewMode={setViewMode}
              oneByOneIndex={oneByOneIndex}
              setOneByOneIndex={setOneByOneIndex}
            />
          </DialogContent>
        </Dialog>

        {preps.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Saved preps</CardTitle>
              <CardDescription>Click a mode above to regenerate. Latest per mode shown in cards.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {preps.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-1">
                    <span className="font-medium text-foreground capitalize">{p.mode.replace(/_/g, " ")}</span>
                    <span aria-hidden>·</span>
                    <span>{p.aiProvider ?? "AI"}{p.aiModel ? ` (${p.aiModel})` : ""}</span>
                    <span aria-hidden>·</span>
                    <span>{new Date(p.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

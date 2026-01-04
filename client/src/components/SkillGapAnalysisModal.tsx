import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, AlertCircle, Target, BookOpen, CheckCircle2 } from "lucide-react";
import type { DashboardStats } from "@/lib/api";

interface SkillGapAnalysisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: DashboardStats | null;
  isLoading?: boolean;
}

export function SkillGapAnalysisModal({
  open,
  onOpenChange,
  stats,
  isLoading,
}: SkillGapAnalysisModalProps) {
  const topMissingSkills = stats?.topMissingSkills || [];
  const totalJobs = stats?.totalJobs || 0;
  const highMatchJobs = stats?.highMatchJobs || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl md:text-2xl font-bold flex items-center gap-2">
            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
            <span>Skill Gap Analysis</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Identify missing skills that appear frequently in job postings to improve your resume and increase match scores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading skill gap analysis...
            </div>
          ) : topMissingSkills.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No skill gap data available yet. Start matching jobs to see which skills are most frequently missing from your resume.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-card/50 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Total Jobs Analyzed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-mono">{totalJobs}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Jobs scanned
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      High Match Jobs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-mono">{highMatchJobs}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totalJobs > 0
                        ? `${Math.round((highMatchJobs / totalJobs) * 100)}% match rate`
                        : "No matches yet"}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/50 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Missing Skills
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-mono">{topMissingSkills.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Skills to consider
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Top Missing Skills */}
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Top Missing Skills
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    These skills appear most frequently in job postings but are missing from your resume. 
                    Consider adding them to improve your match scores.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topMissingSkills.map((item, index) => {
                      const percentage = totalJobs > 0 
                        ? Math.round((item.count / totalJobs) * 100) 
                        : 0;
                      
                      return (
                        <div
                          key={item.skill}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 rounded-lg border border-border/50 bg-card/30 hover:bg-card/50 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm sm:text-base">{item.skill}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Missing from {item.count} {item.count === 1 ? "job" : "jobs"}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 flex-shrink-0">
                            <div className="text-left sm:text-right">
                              <div className="text-sm sm:text-base font-semibold">{percentage}%</div>
                              <div className="text-xs text-muted-foreground">of jobs</div>
                            </div>
                            <div className="w-20 sm:w-16 h-2 bg-muted rounded-full overflow-hidden flex-shrink-0">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Recommendations */}
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5 sm:space-y-3 text-xs sm:text-sm">
                    <li className="flex items-start gap-2 sm:gap-3">
                      <span className="text-primary mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                      <span>
                        <strong>Prioritize high-frequency skills:</strong> Focus on adding the top 3-5 missing skills 
                        that appear in the most job postings.
                      </span>
                    </li>
                    <li className="flex items-start gap-2 sm:gap-3">
                      <span className="text-primary mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                      <span>
                        <strong>Update your resume:</strong> Add these skills to your resume's skills section and 
                        highlight relevant experience where applicable.
                      </span>
                    </li>
                    <li className="flex items-start gap-2 sm:gap-3">
                      <span className="text-primary mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                      <span>
                        <strong>Re-analyze jobs:</strong> After updating your resume, re-analyze jobs to see 
                        improved match scores.
                      </span>
                    </li>
                    <li className="flex items-start gap-2 sm:gap-3">
                      <span className="text-primary mt-0.5 sm:mt-1 flex-shrink-0">•</span>
                      <span>
                        <strong>Track progress:</strong> Monitor this skill gap analysis regularly to see how 
                        your resume improvements affect your job match rates.
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


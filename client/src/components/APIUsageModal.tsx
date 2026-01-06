import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Search, Zap, Database, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ProviderUsage {
  dailyCount: number;
  dailyLimit: number;
  usagePercentage: number;
  minuteCount: number;
  minuteLimit: number;
}

interface JSearchUsage {
  monthlyCount: number;
  monthlyLimit: number;
  usagePercentage: number;
  hourlyCount: number;
  hourlyLimit: number;
  resetTime: string | Date;
}

interface N8nUsage {
  monthlyCount: number;
  monthlyLimit: number;
  usagePercentage: number;
  resetTime: string | Date;
}

interface APIUsage {
  dailyCount: number;
  dailyLimit: number;
  usagePercentage: number;
  resetTime: string | Date;
  minuteCount: number;
  minuteLimit: number;
  providers: {
    perplexity: ProviderUsage;
    gemini: ProviderUsage;
    jsearch: JSearchUsage;
    n8n: N8nUsage;
  };
}

interface APIUsageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiUsage: APIUsage | null;
  isLoading?: boolean;
}

export function APIUsageModal({
  open,
  onOpenChange,
  apiUsage,
  isLoading,
}: APIUsageModalProps) {
  if (!apiUsage) return null;

  const providers = [
    {
      name: "Perplexity",
      icon: Brain,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
      usage: apiUsage.providers.perplexity,
      type: "daily" as const,
      description: "AI-powered job matching and ATS analysis",
    },
    {
      name: "Gemini",
      icon: Zap,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      usage: apiUsage.providers.gemini,
      type: "daily" as const,
      description: "Google Gemini AI for resume optimization and job analysis",
    },
    {
      name: "OpenRouter",
      icon: Brain,
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
      borderColor: "border-cyan-500/20",
      usage: apiUsage.providers.openrouter,
      type: "daily" as const,
      description: "Multi-model AI gateway for flexible AI access",
    },
    {
      name: "JSearch",
      icon: Search,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
      usage: apiUsage.providers.jsearch,
      type: "monthly" as const,
      description: "Job search API for scraping job listings (200 requests/month). Usage tracking will begin properly on the 6th of each month.",
    },
    {
      name: "n8n",
      icon: Database,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      borderColor: "border-orange-500/20",
      usage: apiUsage.providers.n8n,
      type: "monthly" as const,
      description: "Automated job scraping workflow (1000 jobs/month)",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            API Usage Breakdown
          </DialogTitle>
          <DialogDescription className="text-sm">
            Track your API usage across all providers. Daily limits reset at midnight, JSearch and n8n reset monthly on the 6th.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading API usage...
            </div>
          ) : (
            <>
              {providers.map((provider) => {
                const Icon = provider.icon;
                const isMonthly = provider.type === "monthly";
                const usage = provider.usage as ProviderUsage | N8nUsage | JSearchUsage;
                
                return (
                  <Card
                    key={provider.name}
                    className={cn(
                      "bg-card/50 border-border/50",
                      provider.borderColor
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "p-2 rounded-lg",
                              provider.bgColor
                            )}
                          >
                            <Icon className={cn("h-5 w-5", provider.color)} />
                          </div>
                          <div>
                            <CardTitle className="text-base font-semibold">
                              {provider.name}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {provider.description}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            usage.usagePercentage >= 90
                              ? "destructive"
                              : usage.usagePercentage >= 75
                              ? "default"
                              : "secondary"
                          }
                        >
                          {usage.usagePercentage}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Usage Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {isMonthly
                              ? provider.name === "JSearch"
                                ? `${(usage as JSearchUsage).monthlyCount} / ${(usage as JSearchUsage).monthlyLimit} requests`
                                : `${(usage as N8nUsage).monthlyCount} / ${(usage as N8nUsage).monthlyLimit} jobs`
                              : `${(usage as ProviderUsage).dailyCount} / ${(usage as ProviderUsage).dailyLimit} calls`}
                          </span>
                          <span>
                            {isMonthly ? "This month" : "Today"}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
                          {(() => {
                            // Calculate precise percentage for progress bar (EXACT same logic as sidebar)
                            let count = 0;
                            let limit = 0;
                            
                            if (isMonthly) {
                              if (provider.name === "JSearch") {
                                const jsearchUsage = usage as JSearchUsage;
                                count = jsearchUsage.monthlyCount || 0;
                                limit = jsearchUsage.monthlyLimit || 0;
                              } else {
                                // n8n
                                const n8nUsage = usage as N8nUsage;
                                count = n8nUsage.monthlyCount || 0;
                                limit = n8nUsage.monthlyLimit || 0;
                              }
                            } else {
                              // Daily providers (Perplexity, Gemini)
                              const providerUsage = usage as ProviderUsage;
                              count = providerUsage.dailyCount || 0;
                              limit = providerUsage.dailyLimit || 0;
                            }
                            
                            // EXACT same calculation as sidebar
                            const precisePercentage = limit > 0 
                              ? Math.min(100, (count / limit) * 100)
                              : 0;
                            
                            // EXACT same visibility logic as sidebar
                            const displayWidth = precisePercentage > 0 && precisePercentage < 1
                              ? Math.max(precisePercentage, 0.5) // At least 0.5% for visibility if usage > 0
                              : Math.max(precisePercentage, 0);
                            
                            // Get the color class - use provider color directly
                            let colorClass = "";
                            if (usage.usagePercentage >= 90) {
                              colorClass = "bg-red-500";
                            } else if (usage.usagePercentage >= 75) {
                              colorClass = "bg-amber-500";
                            } else {
                              // Use provider-specific color
                              if (provider.name === "Perplexity") {
                                colorClass = "bg-purple-500";
                              } else if (provider.name === "Gemini") {
                                colorClass = "bg-blue-500";
                              } else if (provider.name === "JSearch") {
                                colorClass = "bg-green-500";
                              } else if (provider.name === "n8n") {
                                colorClass = "bg-orange-500";
                              } else {
                                colorClass = "bg-primary";
                              }
                            }
                            
                            // Debug for Perplexity
                            if (provider.name === "Perplexity") {
                              console.log(`[Modal Progress] ${provider.name}: count=${count}, limit=${limit}, percentage=${precisePercentage.toFixed(2)}%, displayWidth=${displayWidth.toFixed(2)}%, colorClass=${colorClass}`);
                            }
                            
                            return (
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  colorClass
                                )}
                                style={{ 
                                  width: `${displayWidth}%`,
                                }}
                              />
                            );
                          })()}
                        </div>
                      </div>

                      {/* Rate Limiting */}
                      {!isMonthly ? (
                        <div className="pt-2 border-t border-border/50">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Rate Limit (last minute)</span>
                            <span>
                              {(usage as ProviderUsage).minuteCount} /{" "}
                              {(usage as ProviderUsage).minuteLimit}
                            </span>
                          </div>
                        </div>
                      ) : provider.name === "JSearch" ? (
                        <div className="pt-2 border-t border-border/50">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Rate Limit (last hour)</span>
                            <span>
                              {(usage as JSearchUsage).hourlyCount} /{" "}
                              {(usage as JSearchUsage).hourlyLimit}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {/* Reset Time */}
                      <div className="pt-2 border-t border-border/50">
                        <div className="text-xs text-muted-foreground">
                          {isMonthly ? (
                            provider.name === "JSearch" ? (
                              <>
                                Resets{" "}
                                {formatDistanceToNow(
                                  new Date((usage as JSearchUsage).resetTime),
                                  { addSuffix: true }
                                )}{" "}
                                (6th of next month)
                              </>
                            ) : (
                              <>
                                Resets{" "}
                                {formatDistanceToNow(
                                  new Date((usage as N8nUsage).resetTime),
                                  { addSuffix: true }
                                )}{" "}
                                (6th of next month)
                              </>
                            )
                          ) : (
                            <>
                              Daily limit resets{" "}
                              {formatDistanceToNow(
                                new Date(apiUsage.resetTime),
                                { addSuffix: true }
                              )}{" "}
                              (midnight)
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Summary */}
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">
                    Usage Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>
                      • <strong>Perplexity & Gemini:</strong> Used for AI-powered
                      job matching and ATS analysis. Daily limits reset at midnight.
                    </p>
                    <p>
                      • <strong>JSearch:</strong> Used for scraping job listings
                      from various sources. Monthly limit of 200 requests (hard limit).
                      Rate limit: 1000 requests/hour. Resets on the 6th of each month.
                      Request counting: 1 page = 1 request, 2-10 pages = 2x, 10+ pages = 3x.
                    </p>
                    <p>
                      • <strong>n8n:</strong> Automated workflow for job scraping.
                      Monthly limit of 1000 jobs, resets on the 6th of each
                      month.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


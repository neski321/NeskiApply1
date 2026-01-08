import { Layout } from "@/components/layout/Layout";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { SkillGapAnalysisModal } from "@/components/SkillGapAnalysisModal";
import { UnscannedJobsNotification } from "@/components/UnscannedJobsNotification";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, Filter, RefreshCcw, Search, TrendingUp, Activity, CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getJobs, getStats, syncJobs, getSettings } from "@/lib/api";
import type { Job } from "@shared/schema";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [appliedFilter, setAppliedFilter] = useState<string>("unapplied"); // "all", "applied", "unapplied" - default to unapplied to hide applied jobs
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showSkillGapModal, setShowSkillGapModal] = useState(false);
  
  // Fetch settings to get high priority match threshold
  // Refetch on mount to ensure we get the latest settings
  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    refetchOnMount: true,
  });

  // Get high priority match threshold from settings, default to 80
  const highPriorityThreshold = useMemo(() => {
    const thresholdSetting = settings.find(s => s.key === "high_priority_match_threshold");
    return thresholdSetting ? parseInt(thresholdSetting.value) : 80;
  }, [settings]);
  
  // Fetch all jobs (without applied filter) to check if high priority matches exist and for replacement logic
  const { data: allJobsUnfiltered = [] } = useQuery({
    queryKey: ["jobs", "all"],
    queryFn: () => getJobs(),
  });

  // Fetch real data with applied filter
  const { data: allJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs", appliedFilter],
    queryFn: () => {
      const filters: { isApplied?: boolean } = {};
      if (appliedFilter === "applied") {
        filters.isApplied = true;
      } else if (appliedFilter === "unapplied") {
        filters.isApplied = false;
      }
      // "all" means no filter, but we still want to exclude applied by default
      // Actually, "all" should show everything, but we'll handle that in the UI
      return getJobs(filters);
    },
  });

  // Filter jobs based on high priority threshold
  const jobs = useMemo(() => {
    return allJobs.filter(j => j.matchScore && j.matchScore >= highPriorityThreshold);
  }, [allJobs, highPriorityThreshold]);

  // When showing applied jobs, also get unapplied jobs to fill remaining spots
  const unappliedJobsForReplacement = useMemo(() => {
    if (appliedFilter !== "applied") return [];
    const unapplied = allJobsUnfiltered.filter(
      j => !j.isApplied && j.matchScore && j.matchScore >= highPriorityThreshold
    );
    return unapplied.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }, [allJobsUnfiltered, appliedFilter, highPriorityThreshold]);

  // Check if there are any high priority matches at all (regardless of applied status)
  const hasHighPriorityMatches = useMemo(() => {
    return allJobsUnfiltered.some(j => j.matchScore && j.matchScore >= highPriorityThreshold);
  }, [allJobsUnfiltered, highPriorityThreshold]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });

  // Sync jobs mutation
  const syncMutation = useMutation({
    mutationFn: syncJobs,
    onSuccess: (data) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      
      toast({
        title: "Sync Started",
        description: `Scraping jobs for ${data.jobTitles} titles in ${data.locations} locations. Results will appear shortly.`,
        variant: "default",
        className: "border-emerald-500/50 text-emerald-500",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get top jobs with replacement logic for applied filter
  const topJobs = useMemo(() => {
    if (appliedFilter === "applied") {
      // When showing applied jobs, show them first, then fill remaining spots with unapplied high-scoring jobs
      const appliedJobsSorted = jobs
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      
      // Fill remaining spots (up to 5 total) with unapplied jobs
      const remainingSpots = 5 - appliedJobsSorted.length;
      const replacementJobs = unappliedJobsForReplacement.slice(0, remainingSpots);
      
      return [...appliedJobsSorted, ...replacementJobs].slice(0, 5);
    } else {
      // For "unapplied" or "all", just show top 5 by score
      return jobs
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
        .slice(0, 5);
    }
  }, [jobs, appliedFilter, unappliedJobsForReplacement]);

  // Generate chart data from last 7 days
  const generateChartData = () => {
    // Get the last 7 days in chronological order (oldest to newest)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i)); // Start from 6 days ago, go to today
      date.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison
      return date;
    });

    // Create chart data with actual dates in chronological order
    const chartData = last7Days.map(date => {
      const dayJobs = jobs.filter(j => {
        const jobDate = new Date(j.createdAt);
        jobDate.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison
        return jobDate.getTime() === date.getTime();
      });

      // Format date for display (e.g., "Jan 15" or "Mon 15")
      const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
      const dayNumber = date.getDate();
      const monthName = date.toLocaleDateString("en-US", { month: "short" });
      
      return {
        date: `${dayName} ${dayNumber}`, // e.g., "Mon 15"
        fullDate: date.toISOString().split('T')[0], // For tooltip
        matches: dayJobs.length,
        sortKey: date.getTime() // For sorting
      };
    });

    // Ensure chronological order (oldest to newest, left to right)
    return chartData.sort((a, b) => a.sortKey - b.sortKey);
  };

  const chartData = generateChartData();

  const handleSync = () => {
    syncMutation.mutate();
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        {/* Unscanned Jobs Notification */}
        <UnscannedJobsNotification />
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Mission Control</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {statsLoading ? (
                "Loading..."
              ) : stats ? (
                `Welcome back! ${stats.todayJobs} new ${stats.todayJobs === 1 ? 'job' : 'jobs'} found today. ${stats.highMatchJobs} high-match ${stats.highMatchJobs === 1 ? 'opportunity' : 'opportunities'} available.`
              ) : (
                "Welcome back!"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
             <Button 
               variant="outline" 
               className="gap-2 h-9 text-sm sm:text-base" 
               onClick={handleSync}
               disabled={syncMutation.isPending}
             >
              <RefreshCcw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{syncMutation.isPending ? "Syncing..." : "Sync Now"}</span>
              <span className="sm:hidden">{syncMutation.isPending ? "Sync..." : "Sync"}</span>
             </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Loading...</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">...</div>
                </CardContent>
              </Card>
            ))
          ) : stats ? (
            <>
              <Card className="bg-card/50 border-border/50 backdrop-blur-sm hover:bg-card/80 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Jobs Scanned</CardTitle>
                  <Activity className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{stats.totalJobs.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span className="text-emerald-500 font-medium">+{stats.todayJobs} today</span>
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-card/50 border-border/50 backdrop-blur-sm hover:bg-card/80 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Links Viewed</CardTitle>
                  <CheckCircle className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{stats.linksViewed || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span className="text-emerald-500 font-medium">{stats.appliedJobs || 0} actually applied</span>
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-card/50 border-border/50 backdrop-blur-sm hover:bg-card/80 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Interviews</CardTitle>
                  <Clock className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{stats.interviewJobs || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span className="text-emerald-500 font-medium">{stats.interviewRate} interview rate</span>
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-card/50 border-border/50 backdrop-blur-sm hover:bg-card/80 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Rejections</CardTitle>
                  <XCircle className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{stats.rejectedJobs || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span className="text-muted-foreground">{stats.pendingJobs} pending</span>
                  </p>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Main Feed Area */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6 min-w-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                High Priority Matches
              </h2>
              <div className="flex items-center gap-2">
                <Select value={appliedFilter} onValueChange={setAppliedFilter}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="All jobs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unapplied">Not Applied (Default)</SelectItem>
                    <SelectItem value="applied">Applied Only</SelectItem>
                    <SelectItem value="all">All Jobs</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  View All
                </Button>
              </div>
            </div>

            {jobsLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading jobs...</div>
            ) : topJobs.length === 0 ? (
              <div className="text-center py-12">
                {hasHighPriorityMatches && appliedFilter === "applied" ? (
                  <>
                    <p className="text-muted-foreground">No applied high-priority matches found.</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      You have high-priority matches available! Switch to "All Jobs" or "Not Applied" to view them. 
                      After you've actually applied to a job (submitted your application), come back and check the "Applied" checkbox to track it.
                    </p>
                  </>
                ) : (
                  <>
                <p className="text-muted-foreground">No high-priority matches found yet.</p>
                <p className="text-sm text-muted-foreground mt-2">Jobs with {highPriorityThreshold}%+ match score will appear here.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-forwards">
                {topJobs.map((job) => (
                  <JobCard key={job.id} job={job} onJobClick={setSelectedJob} />
                ))}
              </div>
            )}
          </div>
          
          <JobDetailModal 
            job={selectedJob} 
            open={!!selectedJob} 
            onOpenChange={(open) => !open && setSelectedJob(null)} 
          />
          
          <SkillGapAnalysisModal
            open={showSkillGapModal}
            onOpenChange={setShowSkillGapModal}
            stats={stats || null}
            isLoading={statsLoading}
          />

          {/* Right Column: Charts & Quick Filters */}
          <div className="space-y-4 md:space-y-6 min-w-0">
             <Card className="bg-card/50 border-border/50">
               <CardHeader>
                 <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                   <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
                   <span className="truncate">Application Velocity</span>
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="h-[180px] sm:h-[200px] w-full min-h-0">
                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={chartData}>
                       <defs>
                         <linearGradient id="colorMatches" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                           <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                         </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                       <XAxis 
                         dataKey="date" 
                         stroke="hsl(var(--muted-foreground))" 
                         fontSize={10} 
                         tickLine={false} 
                         axisLine={false}
                       />
                       <Tooltip 
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                          itemStyle={{ color: 'hsl(var(--foreground))' }}
                          labelFormatter={(value, payload) => {
                            if (payload && payload[0] && payload[0].payload?.fullDate) {
                              const date = new Date(payload[0].payload.fullDate);
                              return date.toLocaleDateString("en-US", { 
                                weekday: "long", 
                                month: "long", 
                                day: "numeric" 
                              });
                            }
                            return value;
                          }}
                       />
                       <Area type="monotone" dataKey="matches" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorMatches)" strokeWidth={2} />
                     </AreaChart>
                   </ResponsiveContainer>
                 </div>
               </CardContent>
             </Card>

             <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="text-base">Top Missing Skills</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {statsLoading ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">Loading skills...</div>
                  ) : stats && stats.topMissingSkills && stats.topMissingSkills.length > 0 ? (
                    <>
                      {stats.topMissingSkills.map(item => (
                        <div key={item.skill} className="flex items-center justify-between text-sm">
                          <span>{item.skill}</span>
                          <span className="text-muted-foreground font-mono">{item.count} {item.count === 1 ? 'job' : 'jobs'}</span>
                        </div>
                      ))}
                      <Button 
                        variant="outline" 
                        className="w-full mt-2 text-xs h-8"
                        onClick={() => setShowSkillGapModal(true)}
                      >
                        View Skill Gap Analysis
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No missing skills data yet. Match some jobs to see skill gaps.
                    </div>
                  )}
                </CardContent>
             </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

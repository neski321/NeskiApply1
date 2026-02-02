import { Layout } from "@/components/layout/Layout";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { ZeroScoreJobsNotification } from "@/components/ZeroScoreJobsNotification";
import { InvalidAPIKeyNotification } from "@/components/InvalidAPIKeyNotification";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, Filter, ArrowUpDown, Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getJobs } from "@/lib/api";
import { useState, useMemo, useEffect } from "react";
import type { Job } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function JobFeed() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minMatchScore, setMinMatchScore] = useState<number | undefined>(undefined);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [appliedFilter, setAppliedFilter] = useState<string>("unapplied"); // "all", "applied", "unapplied" - default to unapplied to hide applied jobs
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<string>("recently-scanned"); // "recently-scanned", "match-score", "oldest", "company", "recently-applied"
  const [titleFilter, setTitleFilter] = useState(""); // Filter by job title/role only (e.g. senior, jr, web developer) - separate from general search
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Quick title presets: value is what we match in the title (we also match common abbreviations)
  const TITLE_PRESETS = [
    { label: "Senior", value: "senior", aliases: ["sr", "sr."] },
    { label: "Junior", value: "junior", aliases: ["jr", "jr."] },
    { label: "Web Developer", value: "web developer", aliases: ["web dev"] },
    { label: "Lead", value: "lead", aliases: [] },
  ] as const;

  // Auto-switch to "recently-applied" sort when applied filter is selected
  useEffect(() => {
    if (appliedFilter === "applied" && sortBy !== "recently-applied" && sortBy !== "match-score" && sortBy !== "oldest" && sortBy !== "company") {
      setSortBy("recently-applied");
    } else if (appliedFilter !== "applied" && sortBy === "recently-applied") {
      // Switch back to default when applied filter is removed
      setSortBy("recently-scanned");
    }
  }, [appliedFilter, sortBy]);

  const effectiveSortBy = sortBy;

  // Fetch all jobs
  const { data: allJobs = [], isLoading } = useQuery({
    queryKey: ["jobs", statusFilter, minMatchScore, appliedFilter],
    queryFn: () => {
      const filters: { status?: string; minMatchScore?: number; isApplied?: boolean } = {};
      if (statusFilter !== "all") {
        filters.status = statusFilter;
      }
      if (minMatchScore !== undefined) {
        filters.minMatchScore = minMatchScore;
      }
      // Default behavior: hide applied jobs unless explicitly filtering for them
      if (appliedFilter === "applied") {
        filters.isApplied = true;
      } else if (appliedFilter === "unapplied") {
        filters.isApplied = false;
      }
      // "all" means show everything (including applied), but this is only when user explicitly selects it
      return getJobs(filters);
    },
  });

  // Helper: does job title match the title filter? (title-only; supports presets with aliases)
  const titleMatchesFilter = (job: Job, filter: string): boolean => {
    if (!filter.trim()) return true;
    const raw = filter.trim().toLowerCase();
    const title = (job.title || "").toLowerCase();
    const preset = TITLE_PRESETS.find(p => p.value === raw || p.aliases.some(a => raw === a.toLowerCase()));
    if (preset) {
      return title.includes(preset.value) || preset.aliases.some(a => title.includes(a));
    }
    return title.includes(raw);
  };

  // Client-side search, source filtering, and title-only filtering
  const filteredJobs = useMemo(() => {
    let filtered = allJobs;

    // Filter by source
    if (sourceFilter !== "all") {
      filtered = filtered.filter((job) => {
        if (sourceFilter === "jsearch") {
          return job.source === "JSearch";
        }
        if (sourceFilter === "n8n") {
          return job.source?.toLowerCase().includes("n8n") || job.source === "n8n";
        }
        return true;
      });
    }

    // Filter by job title/role only (separate from general search - title-only)
    if (titleFilter.trim()) {
      const terms = titleFilter.split(",").map(t => t.trim()).filter(Boolean);
      filtered = filtered.filter((job) =>
        terms.length === 0
          ? true
          : terms.some(term => titleMatchesFilter(job, term))
      );
    }

    // Filter by search query (title, company, location, tags, description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((job) => {
        const titleMatch = job.title?.toLowerCase().includes(query);
        const companyMatch = job.company?.toLowerCase().includes(query);
        const locationMatch = job.location?.toLowerCase().includes(query);
        const tagsMatch = job.tags?.some(tag => tag.toLowerCase().includes(query));
        const descriptionMatch = job.description?.toLowerCase().includes(query);
        return titleMatch || companyMatch || locationMatch || tagsMatch || descriptionMatch;
      });
    }

    return filtered;
  }, [allJobs, searchQuery, sourceFilter, titleFilter]);

  // Sort jobs based on selected sort option
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      switch (effectiveSortBy) {
        case "recently-scanned":
          // Sort by creation date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        
        case "recently-applied":
          // Sort by appliedAt date (most recently applied first)
          // Jobs without appliedAt go to the end
          if (!a.appliedAt && !b.appliedAt) {
            // Both don't have appliedAt, sort by creation date (newest first)
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          if (!a.appliedAt) return 1; // a goes to end
          if (!b.appliedAt) return -1; // b goes to end
          // Both have appliedAt, sort by most recent first
          return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
        
        case "match-score":
          // Sort by match score (highest first), then by creation date (newest first)
      if (a.matchScore && b.matchScore) {
        if (b.matchScore !== a.matchScore) {
          return b.matchScore - a.matchScore;
        }
      } else if (a.matchScore && !b.matchScore) {
        return -1;
      } else if (!a.matchScore && b.matchScore) {
        return 1;
      }
          // If match scores are equal or both missing, sort by creation date
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        
        case "oldest":
          // Sort by creation date (oldest first)
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        
        case "company":
          // Sort by company name (A-Z)
          const companyA = (a.company || "").toLowerCase();
          const companyB = (b.company || "").toLowerCase();
          if (companyA !== companyB) {
            return companyA.localeCompare(companyB);
          }
          // If companies are equal, sort by creation date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        
        default:
          // Default to recently scanned
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [filteredJobs, effectiveSortBy]);

  const clearFilters = () => {
    setStatusFilter("all");
    setMinMatchScore(undefined);
    setSourceFilter("all");
    setAppliedFilter("all");
    setSearchQuery("");
    setTitleFilter("");
    setSortBy("recently-scanned");
  };

  const hasActiveFilters = statusFilter !== "all" || minMatchScore !== undefined || sourceFilter !== "all" || appliedFilter !== "all" || searchQuery.trim() !== "" || titleFilter.trim() !== "";

  return (
    <Layout>
      <div className="flex flex-col gap-4 md:gap-6 h-full w-full">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl sm:text-2xl font-bold">Job Feed</h1>
          <InvalidAPIKeyNotification />
          <ZeroScoreJobsNotification />
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input 
                placeholder="Search by title, company, location, or skill..." 
                className="pl-9 bg-card/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px]">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recently-scanned">Recently Scanned</SelectItem>
                  {appliedFilter === "applied" && (
                    <SelectItem value="recently-applied">Recently Applied</SelectItem>
                  )}
                  <SelectItem value="match-score">Match Score</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="company">Company (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && (
                    <span className="ml-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                      {[statusFilter !== "all", minMatchScore !== undefined, sourceFilter !== "all", appliedFilter !== "all", titleFilter.trim() !== ""].filter(Boolean).length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] max-w-80" align="end">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Status</h4>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="applied">Applied</SelectItem>
                        <SelectItem value="interview">Interview</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Minimum Match Score</h4>
                    <Select 
                      value={minMatchScore?.toString() || "all"} 
                      onValueChange={(value) => setMinMatchScore(value === "all" ? undefined : parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any score" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any Score</SelectItem>
                        <SelectItem value="90">90%+</SelectItem>
                        <SelectItem value="80">80%+</SelectItem>
                        <SelectItem value="70">70%+</SelectItem>
                        <SelectItem value="60">60%+</SelectItem>
                        <SelectItem value="50">50%+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Source</h4>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        <SelectItem value="jsearch">JSearch</SelectItem>
                        <SelectItem value="n8n">n8n</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Applied Status</h4>
                    <Select value={appliedFilter} onValueChange={setAppliedFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All jobs" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unapplied">Not Applied (Default)</SelectItem>
                        <SelectItem value="applied">Applied Only</SelectItem>
                        <SelectItem value="all">All Jobs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {hasActiveFilters && (
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={clearFilters}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            </div>
          </div>

          {/* Job title / role filter - separate from general search and from status/source filters */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Briefcase className="h-4 w-4" />
              <span>Job title / role</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TITLE_PRESETS.map((preset) => {
                const isActive = titleFilter.trim().toLowerCase() === preset.value || preset.aliases.some(a => titleFilter.trim().toLowerCase() === a.toLowerCase());
                return (
                  <Button
                    key={preset.value}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className="h-8"
                    onClick={() => setTitleFilter(isActive ? "" : preset.value)}
                  >
                    {preset.label}
                  </Button>
                );
              })}
              <Input
                placeholder="e.g. senior, jr, web developer"
                className="h-8 w-48 bg-card/50 border-border/50 focus:border-primary/50"
                value={titleFilter}
                onChange={(e) => setTitleFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setTitleFilter("")}
              />
              {titleFilter.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => setTitleFilter("")}
                >
                  Clear title
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Shows only jobs whose title contains the word(s). Separate from the search bar above.
            </p>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {statusFilter !== "all" && (
                <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  Status: {statusFilter}
                </span>
              )}
              {minMatchScore !== undefined && (
                <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  Match: {minMatchScore}%+
                </span>
              )}
              {sourceFilter !== "all" && (
                <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  Source: {sourceFilter === "jsearch" ? "JSearch" : sourceFilter === "n8n" ? "n8n" : sourceFilter}
                </span>
              )}
              {appliedFilter !== "all" && (
                <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  {appliedFilter === "applied" ? "Applied" : "Not Applied"}
                </span>
              )}
              {titleFilter.trim() && (
                <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  Title: "{titleFilter.trim()}"
                </span>
              )}
              {searchQuery.trim() && (
                <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md">
                  Search: "{searchQuery}"
                </span>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading jobs...</div>
        ) : sortedJobs.length === 0 ? (
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle>No jobs found</CardTitle>
              <CardDescription>
                {hasActiveFilters 
                  ? "Try adjusting your filters or search query."
                  : "No jobs in the database yet. Jobs will appear here once they're added."}
              </CardDescription>
            </CardHeader>
            {hasActiveFilters && (
              <CardContent>
                <Button variant="outline" onClick={clearFilters}>
                  Clear All Filters
                </Button>
              </CardContent>
            )}
          </Card>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              Showing {sortedJobs.length} {sortedJobs.length === 1 ? "job" : "jobs"}
              {hasActiveFilters && ` (filtered from ${allJobs.length} total)`}
            </div>
            <div className="grid gap-4 pb-10">
              {sortedJobs.map((job) => (
                <JobCard key={job.id} job={job} onJobClick={setSelectedJob} />
              ))}
            </div>
          </>
        )}
      </div>
      
      <JobDetailModal 
        job={selectedJob} 
        open={!!selectedJob} 
        onOpenChange={(open) => !open && setSelectedJob(null)} 
      />
    </Layout>
  );
}

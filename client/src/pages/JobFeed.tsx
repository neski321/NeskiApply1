import { Layout } from "@/components/layout/Layout";
import { JobCard } from "@/components/jobs/JobCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, Filter, ArrowUpDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getJobs } from "@/lib/api";
import { useState, useMemo } from "react";
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
  const [appliedFilter, setAppliedFilter] = useState<string>("all"); // "all", "applied", "unapplied"
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<string>("recently-scanned"); // "recently-scanned", "match-score", "oldest", "company"

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
      if (appliedFilter === "applied") {
        filters.isApplied = true;
      } else if (appliedFilter === "unapplied") {
        filters.isApplied = false;
      }
      return getJobs(filters);
    },
  });

  // Client-side search and source filtering
  const filteredJobs = useMemo(() => {
    let filtered = allJobs;

    // Filter by source
    if (sourceFilter !== "all") {
      filtered = filtered.filter((job) => {
        if (sourceFilter === "jsearch") {
          return job.source === "JSearch";
        }
        if (sourceFilter === "n8n") {
          // Match "n8n" or "n8n (Indeed)", "n8n (LinkedIn)", etc.
          return job.source?.toLowerCase().includes("n8n") || job.source === "n8n";
        }
        return true;
      });
    }

    // Filter by search query
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
  }, [allJobs, searchQuery, sourceFilter]);

  // Sort jobs based on selected sort option
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      switch (sortBy) {
        case "recently-scanned":
          // Sort by creation date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        
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
  }, [filteredJobs, sortBy]);

  const clearFilters = () => {
    setStatusFilter("all");
    setMinMatchScore(undefined);
    setSourceFilter("all");
    setAppliedFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters = statusFilter !== "all" || minMatchScore !== undefined || sourceFilter !== "all" || appliedFilter !== "all" || searchQuery.trim() !== "";

  return (
    <Layout>
      <div className="flex flex-col gap-4 md:gap-6 h-full w-full">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl sm:text-2xl font-bold">Job Feed</h1>
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
                      {[statusFilter !== "all", minMatchScore !== undefined, sourceFilter !== "all", appliedFilter !== "all"].filter(Boolean).length}
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
                        <SelectItem value="all">All Jobs</SelectItem>
                        <SelectItem value="applied">Applied</SelectItem>
                        <SelectItem value="unapplied">Not Applied</SelectItem>
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
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

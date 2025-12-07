import { Layout } from "@/components/layout/Layout";
import { JobCard } from "@/components/jobs/JobCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, Filter } from "lucide-react";
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
  const [showFilters, setShowFilters] = useState(false);

  // Fetch all jobs
  const { data: allJobs = [], isLoading } = useQuery({
    queryKey: ["jobs", statusFilter, minMatchScore],
    queryFn: () => {
      const filters: { status?: string; minMatchScore?: number } = {};
      if (statusFilter !== "all") {
        filters.status = statusFilter;
      }
      if (minMatchScore !== undefined) {
        filters.minMatchScore = minMatchScore;
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
        } else if (sourceFilter === "linkedin-24h") {
          return job.source === "ActiveJobsDB-24h";
        } else if (sourceFilter === "linkedin-7d") {
          return job.source === "ActiveJobsDB-7d";
        } else if (sourceFilter === "linkedin") {
          return job.source === "ActiveJobsDB-24h" || job.source === "ActiveJobsDB-7d";
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

  // Sort jobs by match score (highest first), then by creation date (newest first)
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      // First sort by match score (if available)
      if (a.matchScore && b.matchScore) {
        if (b.matchScore !== a.matchScore) {
          return b.matchScore - a.matchScore;
        }
      } else if (a.matchScore && !b.matchScore) {
        return -1;
      } else if (!a.matchScore && b.matchScore) {
        return 1;
      }
      
      // Then sort by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filteredJobs]);

  const clearFilters = () => {
    setStatusFilter("all");
    setMinMatchScore(undefined);
    setSourceFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters = statusFilter !== "all" || minMatchScore !== undefined || sourceFilter !== "all" || searchQuery.trim() !== "";

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-full">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Job Feed</h1>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by title, company, location, or skill..." 
                className="pl-9 bg-card/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {hasActiveFilters && (
                    <span className="ml-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                      {[statusFilter !== "all", minMatchScore !== undefined, sourceFilter !== "all"].filter(Boolean).length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
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
                        <SelectItem value="linkedin">ActiveJobsDB (All)</SelectItem>
                        <SelectItem value="linkedin-24h">ActiveJobsDB (24h)</SelectItem>
                        <SelectItem value="linkedin-7d">ActiveJobsDB (7d)</SelectItem>
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
                  Source: {sourceFilter === "jsearch" ? "JSearch" : sourceFilter === "linkedin" ? "ActiveJobsDB (All)" : sourceFilter === "linkedin-24h" ? "ActiveJobsDB (24h)" : "ActiveJobsDB (7d)"}
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

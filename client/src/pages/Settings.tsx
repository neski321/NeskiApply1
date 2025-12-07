import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Check, Play } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSettings, setSetting, triggerCronJob } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// TEMPORARILY DISABLED: ActiveJobsDB API is not working
const ACTIVEJOBSDB_ENABLED = false;

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    jobTitles: "",
    countryCode: "CA",
    datePosted: "week",
    workFromHome: false,
    employmentTypes: "",
    excludedKeywords: "",
    autoApplyEnabled: false,
    autoApplyThreshold: "85",
    discordNotifications: true,
    headlessMode: true,
    aiProviderPreference: "auto",
    jobSearchProviderPreference: "auto",
    perplexityApiKey: "",
    geminiApiKey: "",
    jsearchApiKey: "",
    jsearchRapidApiHost: "",
    linkedinApiKey: "",
    linkedinRapidApiHost: "",
    linkedinTimePeriod: "both",
    linkedinLocationFilter: "",
    discordWebhook: "",
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  useEffect(() => {
    if (settings.length > 0) {
      const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
      
      // Handle backward compatibility: convert old country name to ISO code
      let countryCodes = settingsMap.country_codes || "";
      if (!countryCodes) {
        const oldCountry = settingsMap.country || "";
        // Convert common country names to ISO codes
        const countryNameToCode: Record<string, string> = {
          "canada": "CA",
          "united states": "US",
          "usa": "US",
          "united kingdom": "GB",
          "uk": "GB",
          "australia": "AU",
        };
        const normalizedCountry = oldCountry.toLowerCase().trim();
        if (countryNameToCode[normalizedCountry]) {
          countryCodes = countryNameToCode[normalizedCountry];
        } else if (oldCountry) {
          // If it's already a 2-letter code, use it
          countryCodes = oldCountry.length === 2 ? oldCountry.toUpperCase() : "CA";
        }
      }
      
      // Map old posted_at_max_age_days to JSearch date_posted format
      let datePosted = settingsMap.date_posted || "week";
      if (settingsMap.posted_at_max_age_days && !settingsMap.date_posted) {
        const days = parseInt(settingsMap.posted_at_max_age_days, 10);
        if (days === 0 || days === 1) datePosted = "today";
        else if (days === 3) datePosted = "3days";
        else if (days === 7) datePosted = "week";
        else if (days >= 30) datePosted = "month";
        else datePosted = "week";
      }
      
      // Use first country code if multiple provided (JSearch uses single country)
      const primaryCountryCode = countryCodes ? countryCodes.split(",")[0].trim().toUpperCase() : "CA";
      
      // Reset job search provider preference if ActiveJobsDB is disabled and preference is set to "linkedin"
      let jobSearchProviderPreference = settingsMap.job_search_provider_preference || "auto";
      if (!ACTIVEJOBSDB_ENABLED && jobSearchProviderPreference === "linkedin") {
        jobSearchProviderPreference = "jsearch"; // Fallback to JSearch only
      }
      
      setFormData({
        jobTitles: settingsMap.job_titles || "Software Developer Intern, Backend Developer Co-op, Entry Level Application Developer",
        countryCode: primaryCountryCode || "CA",
        datePosted: datePosted,
        workFromHome: settingsMap.work_from_home === "true",
        employmentTypes: settingsMap.employment_types || "",
        excludedKeywords: settingsMap.excluded_keywords || "Senior, Lead, Principal, 5+ years",
        autoApplyEnabled: settingsMap.auto_apply_enabled === "true",
        autoApplyThreshold: settingsMap.auto_apply_threshold || "85",
        discordNotifications: settingsMap.discord_notifications === "true",
        headlessMode: settingsMap.headless_mode === "true",
        aiProviderPreference: settingsMap.ai_provider_preference || "auto",
        jobSearchProviderPreference: jobSearchProviderPreference,
        perplexityApiKey: settingsMap.perplexity_api_key || "",
        geminiApiKey: settingsMap.gemini_api_key || "",
        jsearchApiKey: settingsMap.jsearch_api_key || "",
        jsearchRapidApiHost: settingsMap.jsearch_rapidapi_host || "",
        linkedinApiKey: settingsMap.linkedin_api_key || "",
        linkedinRapidApiHost: settingsMap.linkedin_rapidapi_host || "",
        linkedinTimePeriod: settingsMap.linkedin_time_period || "both",
        linkedinLocationFilter: settingsMap.linkedin_location_filter || "",
        discordWebhook: settingsMap.discord_webhook || "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const promises = Object.entries(data).map(([key, value]) => 
        setSetting(key, value)
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({
        title: "Settings Saved",
        description: "Your configuration has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cronMutation = useMutation({
    mutationFn: triggerCronJob,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({
        title: "Cron Job Triggered",
        description: data.message || "Daily scraping job has been started.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = async () => {
    setIsSaving(true);
    
    const settingsToSave = {
      job_titles: formData.jobTitles,
      country_codes: formData.countryCode, // JSearch uses single country, but we store as country_codes for compatibility
      date_posted: formData.datePosted,
      work_from_home: formData.workFromHome.toString(),
      employment_types: formData.employmentTypes,
      excluded_keywords: formData.excludedKeywords,
      auto_apply_enabled: formData.autoApplyEnabled.toString(),
      auto_apply_threshold: formData.autoApplyThreshold,
      discord_notifications: formData.discordNotifications.toString(),
      headless_mode: formData.headlessMode.toString(),
      ai_provider_preference: formData.aiProviderPreference,
      job_search_provider_preference: formData.jobSearchProviderPreference,
      perplexity_api_key: formData.perplexityApiKey,
      gemini_api_key: formData.geminiApiKey,
      jsearch_api_key: formData.jsearchApiKey,
      jsearch_rapidapi_host: formData.jsearchRapidApiHost,
      linkedin_api_key: formData.linkedinApiKey,
      linkedin_rapidapi_host: formData.linkedinRapidApiHost,
      linkedin_time_period: formData.linkedinTimePeriod,
      linkedin_location_filter: formData.linkedinLocationFilter,
      discord_webhook: formData.discordWebhook,
    };

    await saveMutation.mutateAsync(settingsToSave);
    setIsSaving(false);
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8 pb-10">
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div>
            <h1 className="text-2xl font-bold">Configuration</h1>
            <p className="text-muted-foreground mt-1">
              Manage API keys, search parameters, and automation rules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={() => cronMutation.mutate()} 
              disabled={cronMutation.isPending}
            >
              <Play className={`h-4 w-4 ${cronMutation.isPending ? "animate-pulse" : ""}`} />
              {cronMutation.isPending ? "Running..." : "Run Cron Job Now"}
            </Button>
            <Button className="gap-2" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Saved!" : "Save Changes"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="job-search" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="job-search">Job Search</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
          </TabsList>

          {/* Job Search Tab */}
          <TabsContent value="job-search" className="space-y-6 mt-6">
            {/* Provider Preference */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Job Search Provider Preference</CardTitle>
                <CardDescription>
                  Choose which job search APIs to use for fetching jobs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Provider Selection
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Required</span>
                  </Label>
                  <Select
                    value={formData.jobSearchProviderPreference}
                    onValueChange={(value) => setFormData({ ...formData, jobSearchProviderPreference: value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (JSearch{ACTIVEJOBSDB_ENABLED ? " + ActiveJobsDB" : ""})</SelectItem>
                      <SelectItem value="jsearch">JSearch Only</SelectItem>
                      {ACTIVEJOBSDB_ENABLED && <SelectItem value="linkedin">ActiveJobsDB Only</SelectItem>}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.jobSearchProviderPreference === "auto" 
                      ? `Automatically uses JSearch${ACTIVEJOBSDB_ENABLED ? " and ActiveJobsDB" : ""} APIs to fetch jobs from multiple sources.`
                      : formData.jobSearchProviderPreference === "jsearch"
                      ? "Only uses JSearch API. No ActiveJobsDB jobs will be fetched."
                      : "Only uses ActiveJobsDB API. No JSearch jobs will be fetched."}
                    {!ACTIVEJOBSDB_ENABLED && formData.jobSearchProviderPreference === "linkedin" && (
                      <span className="text-destructive"> ActiveJobsDB is currently disabled.</span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* JSearch API Section */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>JSearch API Parameters</CardTitle>
                <CardDescription>
                  Configure search parameters for JSearch API. These map directly to JSearch API query parameters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Job Titles (query)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: query</span>
                    <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Required</span>
                  </Label>
                  <Input 
                    value={formData.jobTitles}
                    onChange={(e) => setFormData({ ...formData, jobTitles: e.target.value })}
                    placeholder="Software Developer, Backend Developer, Full Stack Developer"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated job titles. These will be combined into a search query. <strong>Required for JSearch API.</strong>
                  </p>
                </div>
              
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Country Code (country)
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: country</span>
                      <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Required</span>
                    </Label>
                    <Input 
                      value={formData.countryCode}
                      onChange={(e) => setFormData({ ...formData, countryCode: e.target.value.toUpperCase() })}
                      placeholder="CA"
                      className="font-mono"
                      maxLength={2}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      2-letter ISO country code. Examples: CA (Canada), US (USA), GB (UK), AU (Australia). <strong>Required for JSearch API.</strong>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Date Posted (date_posted)
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: date_posted</span>
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                    </Label>
                    <select
                      value={formData.datePosted}
                      onChange={(e) => setFormData({ ...formData, datePosted: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="all">All time</option>
                      <option value="today">Today</option>
                      <option value="3days">Last 3 days</option>
                      <option value="week">Last week</option>
                      <option value="month">Last month</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Filter jobs by posting date. Default: week. Optional parameter.
                    </p>
                  </div>
                </div>
              
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      Work From Home (work_from_home)
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: work_from_home</span>
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Only return remote/work from home jobs
                    </p>
                  </div>
                  <Switch 
                    checked={formData.workFromHome}
                    onCheckedChange={(checked) => setFormData({ ...formData, workFromHome: checked })}
                  />
                </div>
              
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Employment Types (employment_types)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: employment_types</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    value={formData.employmentTypes}
                    onChange={(e) => setFormData({ ...formData, employmentTypes: e.target.value })}
                    placeholder="FULLTIME, CONTRACTOR, PARTTIME, INTERN"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated employment types: FULLTIME, CONTRACTOR, PARTTIME, INTERN. Leave empty for all types. Optional parameter.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* ActiveJobsDB API Section */}
            {ACTIVEJOBSDB_ENABLED && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>ActiveJobsDB API Parameters</CardTitle>
                <CardDescription>
                  Configure search parameters for ActiveJobsDB API. These map directly to ActiveJobsDB API query parameters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Job Titles (title_filter)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: title_filter</span>
                    <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Required</span>
                  </Label>
                  <Input 
                    value={formData.jobTitles}
                    onChange={(e) => setFormData({ ...formData, jobTitles: e.target.value })}
                    placeholder="Software Developer, Backend Developer, Full Stack Developer"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated job titles. These will be used as title_filter. Titles are automatically quoted for phrase matching. <strong>Required for ActiveJobsDB API.</strong>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Time Period
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Which Jobs to Fetch</span>
                    <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Required</span>
                  </Label>
                  <Select
                    value={formData.linkedinTimePeriod}
                    onValueChange={(value) => setFormData({ ...formData, linkedinTimePeriod: value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select time period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">Last 24 Hours</SelectItem>
                      <SelectItem value="7d">Last 7 Days</SelectItem>
                      <SelectItem value="both">Both (24h + 7d)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose which time period to fetch jobs from. "Both" will fetch from both 24-hour and 7-day endpoints. <strong>Required for ActiveJobsDB API.</strong>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Location Filter (location_filter)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: location_filter</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    type="text" 
                    placeholder="Canada, Toronto, United States OR New York" 
                    value={formData.linkedinLocationFilter}
                    onChange={(e) => setFormData({ ...formData, linkedinLocationFilter: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Filter jobs by location. Use full names (e.g., "United States" not "US"). You can use OR to search multiple locations: "Dubai OR Netherlands OR Belgium". Leave empty to use country code from JSearch parameters. Optional parameter.
                  </p>
                </div>
              </CardContent>
            </Card>
            )}

            {/* Common Filters */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Common Filters</CardTitle>
                <CardDescription>
                  Filters that apply to all job search APIs (client-side filtering).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Excluded Keywords
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Client-side filter</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    value={formData.excludedKeywords}
                    onChange={(e) => setFormData({ ...formData, excludedKeywords: e.target.value })}
                    className="text-destructive/80"
                    placeholder="Senior, Lead, Principal, 5+ years"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated keywords. Jobs with titles or descriptions containing these will be excluded (filtered client-side after API results are received). Optional parameter.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-6 mt-6">
            {/* AI Services Section */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>AI Services</CardTitle>
                <CardDescription>Configure AI providers for resume analysis and job matching.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    AI Provider Preference
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Choose AI Service</span>
                  </Label>
                  <select
                    value={formData.aiProviderPreference}
                    onChange={(e) => setFormData({ ...formData, aiProviderPreference: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="auto">Auto (Perplexity → Gemini fallback)</option>
                    <option value="perplexity">Perplexity Only</option>
                    <option value="gemini">Gemini Only</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {formData.aiProviderPreference === "auto" 
                      ? "Automatically uses Perplexity first, falls back to Gemini if Perplexity fails."
                      : formData.aiProviderPreference === "perplexity"
                      ? "Always uses Perplexity. No fallback to Gemini."
                      : "Always uses Gemini. No fallback to Perplexity."}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/50"></div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Perplexity API Key
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Primary for ATS Analysis</span>
                  </Label>
                  <Input 
                    type="password" 
                    placeholder="........................" 
                    value={formData.perplexityApiKey}
                    onChange={(e) => setFormData({ ...formData, perplexityApiKey: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Primary AI service for analyzing resumes against job descriptions. Used when preference is "Auto" or "Perplexity Only".
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Gemini API Key (Backup)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Fallback for ATS Analysis</span>
                  </Label>
                  <Input 
                    type="password" 
                    placeholder="........................" 
                    value={formData.geminiApiKey}
                    onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Backup AI service used when Perplexity is unavailable or when preference is "Gemini Only". Get your API key from{" "}
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      Google AI Studio
                    </a>
                    .
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* JSearch API Section */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>JSearch API</CardTitle>
                <CardDescription>Configure JSearch API for job scraping from multiple sources.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    JSearch API Key (RapidAPI)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Required</span>
                  </Label>
                  <Input 
                    type="password" 
                    placeholder="Your RapidAPI key for JSearch" 
                    value={formData.jsearchApiKey}
                    onChange={(e) => setFormData({ ...formData, jsearchApiKey: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    JSearch API (via RapidAPI) provides access to job listings from multiple sources. Get your API key from{" "}
                    <a href="https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      RapidAPI JSearch
                    </a>
                    . Limited to 5 jobs per day to manage API credits.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    JSearch RapidAPI Host
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    type="text" 
                    placeholder="jsearch.p.rapidapi.com" 
                    value={formData.jsearchRapidApiHost}
                    onChange={(e) => setFormData({ ...formData, jsearchRapidApiHost: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    RapidAPI host for JSearch API. Leave empty to use default: "jsearch.p.rapidapi.com". Only change if you're using a different RapidAPI endpoint.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* ActiveJobsDB API Section */}
            {ACTIVEJOBSDB_ENABLED && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>ActiveJobsDB API</CardTitle>
                <CardDescription>Configure ActiveJobsDB API for scraping active job postings from ATS platforms.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    ActiveJobsDB API Key (RapidAPI)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Required</span>
                  </Label>
                  <Input 
                    type="password" 
                    placeholder="Your RapidAPI key for ActiveJobsDB" 
                    value={formData.linkedinApiKey}
                    onChange={(e) => setFormData({ ...formData, linkedinApiKey: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    ActiveJobsDB API (via RapidAPI) provides access to active job postings from ATS platforms from the past 24 hours and 7 days. Get your API key from{" "}
                    <a href="https://rapidapi.com/hub" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      RapidAPI Hub
                    </a>
                    . Search for "ActiveJobsDB" API.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    ActiveJobsDB RapidAPI Host
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    type="text" 
                    placeholder="active-jobs-db.p.rapidapi.com" 
                    value={formData.linkedinRapidApiHost}
                    onChange={(e) => setFormData({ ...formData, linkedinRapidApiHost: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    RapidAPI host for ActiveJobsDB API. Leave empty to use default: "active-jobs-db.p.rapidapi.com". Only change if you're using a different RapidAPI endpoint.
                  </p>
                </div>
              </CardContent>
            </Card>
            )}
          </TabsContent>

          {/* Automation Tab */}
          <TabsContent value="automation" className="space-y-6 mt-6">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Automation & Notifications</CardTitle>
                <CardDescription>Set thresholds for auto-applying and notifications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Enable Auto-Apply</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically submit applications for high-match jobs
                    </p>
                  </div>
                  <Switch 
                    checked={formData.autoApplyEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, autoApplyEnabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Auto-Apply Threshold</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically submit applications for matches above this percentage
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                     <Input
                       type="number"
                       className="w-20 h-9"
                       min="0"
                       max="100"
                       value={formData.autoApplyThreshold}
                       onChange={(e) => setFormData({ ...formData, autoApplyThreshold: e.target.value })}
                       disabled={!formData.autoApplyEnabled}
                     />
                     <span className="font-mono font-bold text-primary">%</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Discord Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send webhook alerts for new high-quality matches
                    </p>
                  </div>
                  <Switch 
                    checked={formData.discordNotifications}
                    onCheckedChange={(checked) => setFormData({ ...formData, discordNotifications: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Headless Browser Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Run scrapers in background (faster)
                    </p>
                  </div>
                  <Switch 
                    checked={formData.headlessMode}
                    onCheckedChange={(checked) => setFormData({ ...formData, headlessMode: checked })}
                  />
                </div>

                <div className="pt-4 border-t border-border/50">
                  <div className="space-y-2">
                    <Label>Discord Webhook URL</Label>
                    <Input 
                      type="password" 
                      placeholder="https://discord.com/api/webhooks/..." 
                      value={formData.discordWebhook}
                      onChange={(e) => setFormData({ ...formData, discordWebhook: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Discord webhook URL for notifications. Get your webhook URL from Discord Server Settings → Integrations → Webhooks.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

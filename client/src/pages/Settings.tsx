import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Save, Check, Play, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSettings, setSetting, triggerCronJob, testDiscordWebhook, rescheduleCronJob, checkRequiredSettings } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";


export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [isSaving, setIsSaving] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [requiredSettingsStatus, setRequiredSettingsStatus] = useState<{
    configured: boolean;
    missing: string[];
    hasPerplexity: boolean;
    hasGemini: boolean;
    hasDiscord: boolean;
  } | null>(null);
  
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
    discordNotificationThreshold: "70",
    cronEnabled: false,
    cronScheduleTime: "09:00",
    cronTimezone: "America/Toronto",
    headlessMode: true,
    aiProviderPreference: "auto",
    jobSearchProviderPreference: "auto",
    perplexityApiKey: "",
    geminiApiKey: "",
    jsearchApiKey: "",
    jsearchRapidApiHost: "",
    adzunaAppId: "",
    adzunaAppKey: "",
    adzunaMaxDaysOld: "",
    adzunaSalaryMin: "",
    adzunaSalaryMax: "",
    adzunaFullTime: false,
    adzunaPartTime: false,
    adzunaContract: false,
    adzunaPermanent: false,
    adzunaDistance: "",
    adzunaWhatAnd: "",
    adzunaWhatPhrase: "",
    adzunaWhatExclude: "",
    adzunaTitleOnly: "",
    discordWebhook: "",
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  // Check if this is an onboarding flow
  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1]);
    setIsOnboarding(params.get("onboarding") === "true");
  }, [location]);

  // Check required settings status
  const { data: requiredSettings } = useQuery({
    queryKey: ["requiredSettings"],
    queryFn: checkRequiredSettings,
    refetchInterval: 5000, // Check every 5 seconds when on onboarding
    enabled: isOnboarding || requiredSettingsStatus?.configured === false,
  });

  useEffect(() => {
    if (requiredSettings) {
      setRequiredSettingsStatus(requiredSettings);
    }
  }, [requiredSettings]);

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
      
      // Reset job search provider preference to valid options
      let jobSearchProviderPreference = settingsMap.job_search_provider_preference || "auto";
      if (jobSearchProviderPreference !== "auto" && jobSearchProviderPreference !== "jsearch" && jobSearchProviderPreference !== "adzuna") {
        jobSearchProviderPreference = "auto"; // Fallback to auto
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
        discordNotificationThreshold: settingsMap.discord_notification_threshold || "70",
        cronEnabled: settingsMap.cron_enabled === "true",
        cronScheduleTime: settingsMap.cron_schedule_time || "09:00",
        cronTimezone: settingsMap.cron_timezone || "America/Toronto",
        headlessMode: settingsMap.headless_mode === "true",
        aiProviderPreference: settingsMap.ai_provider_preference || "auto",
        jobSearchProviderPreference: jobSearchProviderPreference,
        perplexityApiKey: settingsMap.perplexity_api_key || "",
        geminiApiKey: settingsMap.gemini_api_key || "",
        jsearchApiKey: settingsMap.jsearch_api_key || "",
        jsearchRapidApiHost: settingsMap.jsearch_rapidapi_host || "",
        adzunaAppId: settingsMap.adzuna_app_id || "",
        adzunaAppKey: settingsMap.adzuna_app_key || "",
        adzunaMaxDaysOld: settingsMap.adzuna_max_days_old || "",
        adzunaSalaryMin: settingsMap.adzuna_salary_min || "",
        adzunaSalaryMax: settingsMap.adzuna_salary_max || "",
        adzunaFullTime: settingsMap.adzuna_full_time === "true",
        adzunaPartTime: settingsMap.adzuna_part_time === "true",
        adzunaContract: settingsMap.adzuna_contract === "true",
        adzunaPermanent: settingsMap.adzuna_permanent === "true",
        adzunaDistance: settingsMap.adzuna_distance || "",
        adzunaWhatAnd: settingsMap.adzuna_what_and || "",
        adzunaWhatPhrase: settingsMap.adzuna_what_phrase || "",
        adzunaWhatExclude: settingsMap.adzuna_what_exclude || "",
        adzunaTitleOnly: settingsMap.adzuna_title_only || "",
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

  const discordTestMutation = useMutation({
    mutationFn: testDiscordWebhook,
    onSuccess: (data) => {
      toast({
        title: "Discord Webhook Test",
        description: data.message || "Test notification sent successfully!",
        variant: "default",
        className: "border-emerald-500/50 text-emerald-500",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Discord Webhook Test Failed",
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
      discord_notification_threshold: formData.discordNotificationThreshold,
      cron_enabled: formData.cronEnabled.toString(),
      cron_schedule_time: formData.cronScheduleTime,
      cron_timezone: formData.cronTimezone,
      headless_mode: formData.headlessMode.toString(),
      ai_provider_preference: formData.aiProviderPreference,
      job_search_provider_preference: formData.jobSearchProviderPreference,
      perplexity_api_key: formData.perplexityApiKey,
      gemini_api_key: formData.geminiApiKey,
      jsearch_api_key: formData.jsearchApiKey,
      jsearch_rapidapi_host: formData.jsearchRapidApiHost,
      adzuna_app_id: formData.adzunaAppId,
      adzuna_app_key: formData.adzunaAppKey,
      adzuna_max_days_old: formData.adzunaMaxDaysOld,
      adzuna_salary_min: formData.adzunaSalaryMin,
      adzuna_salary_max: formData.adzunaSalaryMax,
      adzuna_full_time: formData.adzunaFullTime.toString(),
      adzuna_part_time: formData.adzunaPartTime.toString(),
      adzuna_contract: formData.adzunaContract.toString(),
      adzuna_permanent: formData.adzunaPermanent.toString(),
      adzuna_distance: formData.adzunaDistance,
      adzuna_what_and: formData.adzunaWhatAnd,
      adzuna_what_phrase: formData.adzunaWhatPhrase,
      adzuna_what_exclude: formData.adzunaWhatExclude,
      adzuna_title_only: formData.adzunaTitleOnly,
      discord_webhook: formData.discordWebhook,
    };

    await saveMutation.mutateAsync(settingsToSave);
    
    // Reschedule cron job if schedule settings changed
    try {
      await rescheduleCronJob();
    } catch (error) {
      console.error("Failed to reschedule cron job:", error);
      // Don't fail the save if cron reschedule fails
    }
    
    // Refresh required settings status after saving
    if (isOnboarding) {
      queryClient.invalidateQueries({ queryKey: ["requiredSettings"] });
    }
    
    setIsSaving(false);
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-10 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold">Configuration</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Manage API keys, search parameters, and automation rules.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
            <Button 
              variant="outline" 
              className="gap-2 text-sm sm:text-base" 
              onClick={() => cronMutation.mutate()} 
              disabled={cronMutation.isPending}
            >
              <Play className={`h-4 w-4 ${cronMutation.isPending ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">{cronMutation.isPending ? "Running..." : "Run Cron Job Now"}</span>
              <span className="sm:hidden">{cronMutation.isPending ? "Running..." : "Run Cron"}</span>
            </Button>
            <Button className="gap-2 text-sm sm:text-base" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Saved!" : "Save Changes"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="job-search" className="w-full">
          <TabsList className="grid w-full grid-cols-3 text-xs sm:text-sm">
            <TabsTrigger value="job-search" className="text-xs sm:text-sm">Job Search</TabsTrigger>
            <TabsTrigger value="api-keys" className="text-xs sm:text-sm">API Keys</TabsTrigger>
            <TabsTrigger value="automation" className="text-xs sm:text-sm">Automation</TabsTrigger>
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
                      <SelectItem value="auto">Auto (JSearch + Adzuna)</SelectItem>
                      <SelectItem value="jsearch">JSearch Only</SelectItem>
                      <SelectItem value="adzuna">Adzuna Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.jobSearchProviderPreference === "auto" 
                      ? `Automatically uses JSearch and Adzuna APIs to fetch jobs from multiple sources.`
                      : formData.jobSearchProviderPreference === "jsearch"
                      ? "Only uses JSearch API. Adzuna will be skipped."
                      : formData.jobSearchProviderPreference === "adzuna"
                      ? "Only uses Adzuna API. JSearch will be skipped."
                      : "Select a job search provider preference."}
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
                    {isOnboarding && !requiredSettingsStatus?.hasPerplexity && !requiredSettingsStatus?.hasGemini && (
                      <span className="text-[10px] font-normal text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Missing</span>
                    )}
                  </Label>
                  <Input 
                    type="password" 
                    placeholder="Enter your Perplexity API key" 
                    value={formData.perplexityApiKey}
                    onChange={(e) => setFormData({ ...formData, perplexityApiKey: e.target.value })}
                    className={isOnboarding && !requiredSettingsStatus?.hasPerplexity && !requiredSettingsStatus?.hasGemini ? "border-amber-500 focus:border-amber-500" : ""}
                  />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Primary AI service for analyzing resumes against job descriptions. Used when preference is "Auto" or "Perplexity Only".
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>How to get your API key:</strong> Visit{" "}
                      <a 
                        href="https://www.perplexity.ai/settings/api" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-primary underline hover:text-primary/80"
                      >
                        Perplexity API Settings
                      </a>
                      {" "}and create a new API key. Free tier includes 5 requests per minute and 200 requests per day.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Gemini API Key (Backup)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Fallback for ATS Analysis</span>
                    {isOnboarding && !requiredSettingsStatus?.hasPerplexity && !requiredSettingsStatus?.hasGemini && (
                      <span className="text-[10px] font-normal text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Required if no Perplexity</span>
                    )}
                  </Label>
                  <Input 
                    type="password" 
                    placeholder="Enter your Gemini API key" 
                    value={formData.geminiApiKey}
                    onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                    className={isOnboarding && !requiredSettingsStatus?.hasPerplexity && !requiredSettingsStatus?.hasGemini ? "border-amber-500 focus:border-amber-500" : ""}
                  />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Backup AI service used when Perplexity is unavailable or when preference is "Gemini Only".
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>How to get your API key:</strong> Visit{" "}
                      <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-primary underline hover:text-primary/80"
                      >
                        Google AI Studio
                      </a>
                      {" "}and click "Create API Key". Free tier includes generous usage limits. You'll need a Google account to access.
                    </p>
                  </div>
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

            {/* Adzuna API Section */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Adzuna API</CardTitle>
                <CardDescription>Configure Adzuna API for job scraping from multiple sources.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adzunaAppId">Adzuna App ID</Label>
                  <Input
                    id="adzunaAppId"
                    placeholder="Your Adzuna App ID" 
                    value={formData.adzunaAppId}
                    onChange={(e) => setFormData({ ...formData, adzunaAppId: e.target.value })}
                  />
                  <CardDescription className="text-xs">
                    Your Adzuna application ID. Get your credentials from{" "}
                    <a href="https://developer.adzuna.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      Adzuna Developer Portal
                    </a>
                    .
                  </CardDescription>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adzunaAppKey">Adzuna App Key</Label>
                  <Input
                    id="adzunaAppKey"
                    type="password"
                    placeholder="Your Adzuna App Key" 
                    value={formData.adzunaAppKey}
                    onChange={(e) => setFormData({ ...formData, adzunaAppKey: e.target.value })}
                  />
                  <CardDescription className="text-xs">
                    Your Adzuna application key. Both App ID and App Key are required for Adzuna API access.
                  </CardDescription>
                </div>
              </CardContent>
            </Card>

            {/* Adzuna API Parameters Section */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Adzuna API Parameters</CardTitle>
                <CardDescription>
                  Configure search parameters for Adzuna API. These map directly to Adzuna API query parameters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Max Days Old (max_days_old)
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: max_days_old</span>
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                    </Label>
                    <Input
                      type="number"
                      placeholder="7"
                      value={formData.adzunaMaxDaysOld}
                      onChange={(e) => setFormData({ ...formData, adzunaMaxDaysOld: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum age of job postings in days. Leave empty to include all jobs.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Distance (km) (distance)
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: distance</span>
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                    </Label>
                    <Input
                      type="number"
                      placeholder="5"
                      value={formData.adzunaDistance}
                      onChange={(e) => setFormData({ ...formData, adzunaDistance: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Distance in kilometers from location center. Default: 5km.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Minimum Salary (salary_min)
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: salary_min</span>
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                    </Label>
                    <Input
                      type="number"
                      placeholder="50000"
                      value={formData.adzunaSalaryMin}
                      onChange={(e) => setFormData({ ...formData, adzunaSalaryMin: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum salary filter. Currency depends on country.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Maximum Salary (salary_max)
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: salary_max</span>
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                    </Label>
                    <Input
                      type="number"
                      placeholder="100000"
                      value={formData.adzunaSalaryMax}
                      onChange={(e) => setFormData({ ...formData, adzunaSalaryMax: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum salary filter. Currency depends on country.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Job Type Filters</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="adzunaFullTime"
                        checked={formData.adzunaFullTime}
                        onCheckedChange={(checked) => setFormData({ ...formData, adzunaFullTime: checked })}
                      />
                      <Label htmlFor="adzunaFullTime" className="text-sm">Full Time</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="adzunaPartTime"
                        checked={formData.adzunaPartTime}
                        onCheckedChange={(checked) => setFormData({ ...formData, adzunaPartTime: checked })}
                      />
                      <Label htmlFor="adzunaPartTime" className="text-sm">Part Time</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="adzunaContract"
                        checked={formData.adzunaContract}
                        onCheckedChange={(checked) => setFormData({ ...formData, adzunaContract: checked })}
                      />
                      <Label htmlFor="adzunaContract" className="text-sm">Contract</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="adzunaPermanent"
                        checked={formData.adzunaPermanent}
                        onCheckedChange={(checked) => setFormData({ ...formData, adzunaPermanent: checked })}
                      />
                      <Label htmlFor="adzunaPermanent" className="text-sm">Permanent</Label>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Filter jobs by employment type. You can select multiple types.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Keywords - All Must Match (what_and)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: what_and</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input
                    placeholder="javascript react typescript"
                    value={formData.adzunaWhatAnd}
                    onChange={(e) => setFormData({ ...formData, adzunaWhatAnd: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Space-separated keywords. All keywords must be found in the job.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Exact Phrase (what_phrase)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: what_phrase</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input
                    placeholder="senior software engineer"
                    value={formData.adzunaWhatPhrase}
                    onChange={(e) => setFormData({ ...formData, adzunaWhatPhrase: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    An entire phrase that must be found in the description or title.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Exclude Keywords (what_exclude)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: what_exclude</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input
                    placeholder="senior lead principal"
                    value={formData.adzunaWhatExclude}
                    onChange={(e) => setFormData({ ...formData, adzunaWhatExclude: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Space-separated keywords to exclude from search results.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Title Only Search (title_only)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: title_only</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input
                    placeholder="developer engineer"
                    value={formData.adzunaTitleOnly}
                    onChange={(e) => setFormData({ ...formData, adzunaTitleOnly: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Space-separated keywords to search only in job titles.
                  </p>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          {/* Automation Tab */}
          <TabsContent value="automation" className="space-y-6 mt-6">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Configure Discord notifications for job matches. Adjust the threshold to control when you receive notifications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1">
                    <Label className="text-base">Notification Threshold</Label>
                    <p className="text-sm text-muted-foreground">
                      Discord notifications will be sent for jobs with match scores at or above this percentage
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-20 h-9"
                      min="0"
                      max="100"
                      value={formData.discordNotificationThreshold}
                      onChange={(e) => setFormData({ ...formData, discordNotificationThreshold: e.target.value })}
                      disabled={!formData.discordNotifications}
                    />
                    <span className="font-mono font-bold text-primary">%</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Discord Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable Discord webhook notifications for jobs matching the threshold above
                    </p>
                  </div>
                  <Switch 
                    checked={formData.discordNotifications}
                    onCheckedChange={(checked) => setFormData({ ...formData, discordNotifications: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Automatic Job Scraping Schedule</CardTitle>
                <CardDescription>
                  Configure when the automatic daily job scraping runs. The server must be running for scheduled jobs to execute.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border/50">
                  <div className="space-y-0.5 flex-1">
                    <Label className="text-base">Enable Automatic Scraping</Label>
                    <p className="text-sm text-muted-foreground">
                      Turn on automatic daily job scraping at your scheduled time. You must activate this for scheduled jobs to run.
                    </p>
                  </div>
                  <Switch 
                    checked={formData.cronEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, cronEnabled: checked })}
                  />
                </div>

                {!formData.cronEnabled && (
                  <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    <p className="text-sm text-amber-500">
                      <strong>Automatic scraping is disabled.</strong> Enable the toggle above to activate scheduled job scraping. 
                      You can still trigger manual scraping using the "Run Cron Job Now" button.
                    </p>
                  </div>
                )}

                <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                  <p className="text-sm text-muted-foreground">
                    <strong>Note:</strong> The cron job runs on the server, so your server process must be running continuously for scheduled jobs to execute. 
                    If you close the server, scheduled jobs will not run until you restart it. The system checks every 15 minutes to see if it's time to run your scheduled job.
                  </p>
                </div>

                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!formData.cronEnabled ? "opacity-50 pointer-events-none" : ""}`}>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Schedule Time
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">24-hour format</span>
                    </Label>
                    <Input 
                      type="time"
                      value={formData.cronScheduleTime}
                      onChange={(e) => setFormData({ ...formData, cronScheduleTime: e.target.value })}
                      className="font-mono"
                      disabled={!formData.cronEnabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Time when daily job scraping runs (24-hour format, e.g., 09:00 for 9:00 AM)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Timezone
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Required</span>
                    </Label>
                    <select
                      value={formData.cronTimezone}
                      onChange={(e) => setFormData({ ...formData, cronTimezone: e.target.value })}
                      disabled={!formData.cronEnabled}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="America/Toronto">Eastern Time (America/Toronto)</option>
                      <option value="America/New_York">Eastern Time (America/New_York)</option>
                      <option value="America/Chicago">Central Time (America/Chicago)</option>
                      <option value="America/Denver">Mountain Time (America/Denver)</option>
                      <option value="America/Los_Angeles">Pacific Time (America/Los_Angeles)</option>
                      <option value="America/Vancouver">Pacific Time (America/Vancouver)</option>
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="Europe/Paris">Paris (CET/CEST)</option>
                      <option value="Europe/Berlin">Berlin (CET/CEST)</option>
                      <option value="Asia/Tokyo">Tokyo (JST)</option>
                      <option value="Asia/Shanghai">Shanghai (CST)</option>
                      <option value="Australia/Sydney">Sydney (AEDT/AEST)</option>
                      <option value="UTC">UTC</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Timezone for the scheduled time
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Other Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
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
                    <Label className="flex items-center gap-2">
                      Discord Webhook URL
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Required</span>
                      {isOnboarding && !requiredSettingsStatus?.hasDiscord && (
                        <span className="text-[10px] font-normal text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Missing</span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        type="password" 
                        placeholder="https://discord.com/api/webhooks/..." 
                        value={formData.discordWebhook}
                        onChange={(e) => setFormData({ ...formData, discordWebhook: e.target.value })}
                        className={`flex-1 ${isOnboarding && !requiredSettingsStatus?.hasDiscord ? "border-amber-500 focus:border-amber-500" : ""}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => discordTestMutation.mutate()}
                        disabled={discordTestMutation.isPending || !formData.discordWebhook}
                      >
                        {discordTestMutation.isPending ? "Testing..." : "Test"}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Discord webhook URL for receiving job match notifications. You'll receive notifications when jobs match your resume with a score above your threshold.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>How to get your webhook URL:</strong>
                      </p>
                      <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1 ml-2">
                        <li>Open your Discord server (or create a new one)</li>
                        <li>Go to <strong>Server Settings</strong> → <strong>Integrations</strong> → <strong>Webhooks</strong></li>
                        <li>Click <strong>"New Webhook"</strong> or <strong>"Create Webhook"</strong></li>
                        <li>Give it a name (e.g., "Job Notifications") and select a channel</li>
                        <li>Click <strong>"Copy Webhook URL"</strong> and paste it here</li>
                        <li>Click <strong>"Test"</strong> to verify it's working</li>
                      </ol>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Note:</strong> You need to be a server administrator or have "Manage Webhooks" permission to create webhooks.
                      </p>
                    </div>
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

import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, Check, Play, AlertCircle, CheckCircle2, ExternalLink, Info, X, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSettings, setSetting, setSettingsBatch, triggerCronJob, testDiscordWebhook, testReminder, rescheduleCronJob, checkRequiredSettings } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";


export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [showN8nNotice, setShowN8nNotice] = useState(() => {
    // Check localStorage to see if notice has been dismissed
    if (typeof window !== "undefined") {
      return localStorage.getItem("n8n-notice-dismissed") !== "true";
    }
    return true;
  });
  const [showCronConfirm, setShowCronConfirm] = useState(false);
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
    highPriorityMatchThreshold: "80",
    jobScrapingLimit: "10",
    cronEnabled: false,
    cronScheduleTime: "09:00",
    cronTimezone: "America/Toronto",
    reminderEnabled: false,
    reminderTime: "16:00",
    reminderMatchThreshold: "70",
    headlessMode: true,
    aiProviderPreference: "auto",
    interviewPrepAiProvider: "auto",
    perplexityApiKey: "",
    perplexityModel: "sonar-pro",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    openrouterApiKey: "",
    openrouterModel: "mistralai/mistral-small-3.1-24b-instruct:free",
    resumeOptimizationProvider: "perplexity",
    jsearchApiKey: "",
    jsearchRapidApiHost: "",
    jsearchLanguage: "",
    jsearchJobRequirements: "",
    jsearchRadius: "",
    jsearchExcludeJobPublishers: "",
    discordWebhook: "",
    // Apify LinkedIn Jobs Scraper (up to 3 positions, sum of limits <= 31/day)
    apifyApiToken: "",
    apifyPosition1: "",
    apifyMaxItems1: "10",
    apifyPosition2: "",
    apifyMaxItems2: "10",
    apifyPosition3: "",
    apifyMaxItems3: "11",
    apifyCountry: "US",
    apifyLocation: "",
    apifyParseCompanyDetails: false,
    apifySaveOnlyUniqueItems: true,
    apifyFollowApplyRedirects: false,
    apifyUseCommonFilters: true,
    apifySearchIntervalSeconds: "60",
  });

  // Store original form data to compare against
  const originalFormDataRef = useRef<typeof formData | null>(null);
  const isSavingRef = useRef(false); // Track if we're currently saving to prevent race conditions

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
    // Don't update formData if we're currently saving (to prevent race condition)
    if (isSavingRef.current) {
      return;
    }
    
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
      
      const loadedFormData = {
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
        highPriorityMatchThreshold: settingsMap.high_priority_match_threshold || "80",
        jobScrapingLimit: settingsMap.job_scraping_limit || "10",
        cronEnabled: settingsMap.cron_enabled === "true",
        cronScheduleTime: settingsMap.cron_schedule_time || "09:00",
        cronTimezone: settingsMap.cron_timezone || "America/Toronto",
        reminderEnabled: settingsMap.reminder_enabled === "true",
        reminderTime: settingsMap.reminder_time || "16:00",
        reminderMatchThreshold: settingsMap.reminder_match_threshold || "70",
        headlessMode: settingsMap.headless_mode === "true",
        aiProviderPreference: settingsMap.ai_provider_preference || "auto",
        interviewPrepAiProvider: settingsMap.interview_prep_ai_provider || settingsMap.ai_provider_preference || "auto",
        perplexityApiKey: settingsMap.perplexity_api_key || "",
        perplexityModel: settingsMap.perplexity_model || "sonar-pro",
        geminiApiKey: settingsMap.gemini_api_key || "",
        geminiModel: settingsMap.gemini_model || "gemini-2.5-flash",
        openrouterApiKey: settingsMap.openrouter_api_key || "",
        openrouterModel: settingsMap.openrouter_model || "mistralai/mistral-small-3.1-24b-instruct:free",
        resumeOptimizationProvider: settingsMap.resume_optimization_provider || "gemini",
        jsearchApiKey: settingsMap.jsearch_api_key || "",
        jsearchRapidApiHost: settingsMap.jsearch_rapidapi_host || "",
        jsearchLanguage: settingsMap.jsearch_language || "",
        jsearchJobRequirements: settingsMap.jsearch_job_requirements || "",
        jsearchRadius: settingsMap.jsearch_radius || "",
        jsearchExcludeJobPublishers: settingsMap.jsearch_exclude_job_publishers || "",
        discordWebhook: settingsMap.discord_webhook || "",
        apifyApiToken: settingsMap.apify_api_token || "",
        apifyPosition1: settingsMap.apify_position_1 || (settingsMap.apify_position?.split(",")[0]?.trim() ?? "") || "",
        apifyMaxItems1: settingsMap.apify_max_items_1 || "10",
        apifyPosition2: settingsMap.apify_position_2 || (settingsMap.apify_position?.split(",")[1]?.trim() ?? "") || "",
        apifyMaxItems2: settingsMap.apify_max_items_2 || "10",
        apifyPosition3: settingsMap.apify_position_3 || (settingsMap.apify_position?.split(",")[2]?.trim() ?? "") || "",
        apifyMaxItems3: settingsMap.apify_max_items_3 || "11",
        apifyCountry: settingsMap.apify_country || "US",
        apifyLocation: settingsMap.apify_location || "",
        apifyParseCompanyDetails: settingsMap.apify_parse_company_details === "true",
        apifySaveOnlyUniqueItems: settingsMap.apify_save_only_unique_items !== "false",
        apifyFollowApplyRedirects: settingsMap.apify_follow_apply_redirects === "true",
        apifyUseCommonFilters: settingsMap.apify_use_common_filters !== "false",
        apifySearchIntervalSeconds: settingsMap.apify_search_interval_seconds || "60",
      };
      
      // Only update formData on initial load (when originalFormDataRef is null)
      // or when formData matches originalFormDataRef (meaning no unsaved changes)
      // This prevents overwriting user edits when settings are refetched after save
      if (!originalFormDataRef.current) {
        // Initial load - set both formData and ref
        setFormData(loadedFormData);
        originalFormDataRef.current = loadedFormData;
      } else {
        // Check if formData matches the original (no unsaved changes)
        const formDataStr = JSON.stringify(formData);
        const originalStr = JSON.stringify(originalFormDataRef.current);
        const hasUnsavedChanges = formDataStr !== originalStr;
        
        if (!hasUnsavedChanges) {
          // No unsaved changes - safe to update both formData and ref
          // This happens when settings are refetched after save
          setFormData(loadedFormData);
          originalFormDataRef.current = loadedFormData;
        } else {
          // User has unsaved changes - only update the ref, preserve formData
          // The ref is used for comparison in hasChanges
          originalFormDataRef.current = loadedFormData;
        }
      }
    }
  }, [settings]);

  // Apify limits must sum to <= 31
  const apifyLimitSumInvalid = useMemo(() => {
    const sum = parseInt(formData.apifyMaxItems1 || "0", 10) + parseInt(formData.apifyMaxItems2 || "0", 10) + parseInt(formData.apifyMaxItems3 || "0", 10);
    return sum > 31;
  }, [formData.apifyMaxItems1, formData.apifyMaxItems2, formData.apifyMaxItems3]);

  // Check if form data has changed from original
  const hasChanges = useMemo(() => {
    if (!originalFormDataRef.current) return false;
    
    const original = originalFormDataRef.current;
    const current = formData;
    
    // Compare all fields
    return (
      original.jobTitles !== current.jobTitles ||
      original.countryCode !== current.countryCode ||
      original.datePosted !== current.datePosted ||
      original.workFromHome !== current.workFromHome ||
      original.employmentTypes !== current.employmentTypes ||
      original.excludedKeywords !== current.excludedKeywords ||
      original.autoApplyEnabled !== current.autoApplyEnabled ||
      original.autoApplyThreshold !== current.autoApplyThreshold ||
      original.discordNotifications !== current.discordNotifications ||
      original.discordNotificationThreshold !== current.discordNotificationThreshold ||
      original.highPriorityMatchThreshold !== current.highPriorityMatchThreshold ||
      original.jobScrapingLimit !== current.jobScrapingLimit ||
      original.cronEnabled !== current.cronEnabled ||
      original.cronScheduleTime !== current.cronScheduleTime ||
      original.cronTimezone !== current.cronTimezone ||
      original.reminderEnabled !== current.reminderEnabled ||
      original.reminderTime !== current.reminderTime ||
      original.reminderMatchThreshold !== current.reminderMatchThreshold ||
      original.headlessMode !== current.headlessMode ||
      original.aiProviderPreference !== current.aiProviderPreference ||
      original.interviewPrepAiProvider !== current.interviewPrepAiProvider ||
      original.perplexityApiKey !== current.perplexityApiKey ||
      original.perplexityModel !== current.perplexityModel ||
      original.geminiApiKey !== current.geminiApiKey ||
      original.geminiModel !== current.geminiModel ||
      original.openrouterApiKey !== current.openrouterApiKey ||
      original.openrouterModel !== current.openrouterModel ||
      original.resumeOptimizationProvider !== current.resumeOptimizationProvider ||
      original.jsearchApiKey !== current.jsearchApiKey ||
      original.jsearchRapidApiHost !== current.jsearchRapidApiHost ||
      original.jsearchLanguage !== current.jsearchLanguage ||
      original.jsearchJobRequirements !== current.jsearchJobRequirements ||
      original.jsearchRadius !== current.jsearchRadius ||
      original.jsearchExcludeJobPublishers !== current.jsearchExcludeJobPublishers ||
      original.discordWebhook !== current.discordWebhook ||
      original.apifyApiToken !== current.apifyApiToken ||
      original.apifyPosition1 !== current.apifyPosition1 ||
      original.apifyMaxItems1 !== current.apifyMaxItems1 ||
      original.apifyPosition2 !== current.apifyPosition2 ||
      original.apifyMaxItems2 !== current.apifyMaxItems2 ||
      original.apifyPosition3 !== current.apifyPosition3 ||
      original.apifyMaxItems3 !== current.apifyMaxItems3 ||
      original.apifyCountry !== current.apifyCountry ||
      original.apifyLocation !== current.apifyLocation ||
      original.apifyParseCompanyDetails !== current.apifyParseCompanyDetails ||
      original.apifySaveOnlyUniqueItems !== current.apifySaveOnlyUniqueItems ||
      original.apifyFollowApplyRedirects !== current.apifyFollowApplyRedirects ||
      original.apifyUseCommonFilters !== current.apifyUseCommonFilters ||
      original.apifySearchIntervalSeconds !== current.apifySearchIntervalSeconds
    );
  }, [formData]);

  const saveMutation = useMutation({
    mutationFn: async (data: { settings: Record<string, string>; savedFormData: typeof formData }) => {
      // Use batch endpoint to save all settings in a single API call
      // This prevents hitting rate limits (100 requests per 15 minutes)
      // Instead of ~34 API calls per save, we now make just 1 API call
      await setSettingsBatch(data.settings);
      return data.savedFormData; // Return the form data that was saved
    },
    onSuccess: (savedFormData) => {
      // Update both formData and originalFormDataRef to keep them in sync
      // This ensures hasChanges works correctly after save
      setFormData(savedFormData);
      originalFormDataRef.current = savedFormData;
      
      // Mark that we're no longer saving (after updating state)
      setTimeout(() => {
        isSavingRef.current = false;
      }, 0);
      
      // Invalidate queries after a short delay to allow state updates to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["settings"] });
        // Invalidate jobs queries so Dashboard refetches with new threshold
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }, 200);
      
      toast({
        title: "Settings Saved",
        description: "Your configuration has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      // Mark that we're no longer saving on error
      isSavingRef.current = false;
      
      toast({
        title: "Error saving settings",
        description: error.message || "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const cronMutation = useMutation({
    mutationFn: (options?: { skipApifyLimit?: boolean }) => triggerCronJob(options),
    onSuccess: (data) => {
      setShowCronConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({
        title: "Cron Job Triggered",
        description: data?.skipApifyLimit
          ? "Daily scraping started. Apify 31/day limit bypassed for this manual run."
          : (data.message || "Daily scraping job has been started."),
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

  const reminderTestMutation = useMutation({
    mutationFn: testReminder,
    onSuccess: (data) => {
      toast({
        title: "Reminder Test",
        description: data.message || "Test reminder sent successfully!",
        variant: "default",
        className: "border-emerald-500/50 text-emerald-500",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Reminder Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-save mutation for reminder settings
  const saveReminderSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await setSetting(key, value);
      // Reschedule reminder cron when reminder settings change
      if (key === "reminder_enabled" || key === "reminder_time" || key === "reminder_match_threshold") {
        await rescheduleCronJob();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save setting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = async () => {
    // Prevent multiple concurrent saves
    if (saveMutation.isPending || isSavingRef.current) {
      return;
    }
    if (apifyLimitSumInvalid) {
      toast({
        title: "Invalid Apify limits",
        description: "Sum of position limits must be 31 or less.",
        variant: "destructive",
      });
      return;
    }
    
    // Mark that we're saving to prevent race conditions
    isSavingRef.current = true;
    
    // Capture the current formData before saving
    const currentFormData = { ...formData };
    
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
      high_priority_match_threshold: formData.highPriorityMatchThreshold,
      job_scraping_limit: formData.jobScrapingLimit,
      cron_enabled: formData.cronEnabled.toString(),
      cron_schedule_time: formData.cronScheduleTime,
      cron_timezone: formData.cronTimezone,
      reminder_enabled: formData.reminderEnabled.toString(),
      reminder_time: formData.reminderTime,
      reminder_match_threshold: formData.reminderMatchThreshold,
      headless_mode: formData.headlessMode.toString(),
      ai_provider_preference: formData.aiProviderPreference,
      interview_prep_ai_provider: formData.interviewPrepAiProvider,
      perplexity_api_key: formData.perplexityApiKey,
      perplexity_model: formData.perplexityModel,
      gemini_api_key: formData.geminiApiKey,
      gemini_model: formData.geminiModel,
      openrouter_api_key: formData.openrouterApiKey,
      openrouter_model: formData.openrouterModel,
      resume_optimization_provider: formData.resumeOptimizationProvider,
      jsearch_api_key: formData.jsearchApiKey,
      jsearch_rapidapi_host: formData.jsearchRapidApiHost,
      jsearch_language: formData.jsearchLanguage,
      jsearch_job_requirements: formData.jsearchJobRequirements,
      jsearch_radius: formData.jsearchRadius,
      jsearch_exclude_job_publishers: formData.jsearchExcludeJobPublishers,
      discord_webhook: formData.discordWebhook,
      apify_api_token: formData.apifyApiToken,
      apify_position_1: formData.apifyPosition1,
      apify_max_items_1: formData.apifyMaxItems1,
      apify_position_2: formData.apifyPosition2,
      apify_max_items_2: formData.apifyMaxItems2,
      apify_position_3: formData.apifyPosition3,
      apify_max_items_3: formData.apifyMaxItems3,
      apify_country: formData.apifyCountry,
      apify_location: formData.apifyLocation,
      apify_parse_company_details: formData.apifyParseCompanyDetails.toString(),
      apify_save_only_unique_items: formData.apifySaveOnlyUniqueItems.toString(),
      apify_follow_apply_redirects: formData.apifyFollowApplyRedirects.toString(),
      apify_use_common_filters: formData.apifyUseCommonFilters.toString(),
      apify_search_interval_seconds: formData.apifySearchIntervalSeconds,
    };

    try {
      // Save settings with the current formData to update the ref correctly
      await saveMutation.mutateAsync({ 
        settings: settingsToSave,
        savedFormData: currentFormData 
      });
      
      // Reschedule cron jobs if schedule settings changed
      try {
        await rescheduleCronJob(); // This reschedules both scraping and reminder cron jobs
      } catch (error) {
        console.error("Failed to reschedule cron job:", error);
        // Don't fail the save if cron reschedule fails
      }
      
      // Refresh required settings status after saving
      if (isOnboarding) {
        queryClient.invalidateQueries({ queryKey: ["requiredSettings"] });
      }
    } catch (error) {
      // Mark that we're no longer saving on error
      isSavingRef.current = false;
      
      // Error is already handled in mutation's onError
      console.error("Failed to save settings:", error);
    }
  };
  
  // Reset mutation success state when formData changes (user makes new changes)
  useEffect(() => {
    if (saveMutation.isSuccess && hasChanges) {
      saveMutation.reset();
    }
  }, [hasChanges, saveMutation.isSuccess]);

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
              onClick={() => setShowCronConfirm(true)} 
              disabled={cronMutation.isPending}
            >
              <Play className={`h-4 w-4 ${cronMutation.isPending ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">{cronMutation.isPending ? "Running..." : "Run Cron Job Now"}</span>
              <span className="sm:hidden">{cronMutation.isPending ? "Running..." : "Run Cron"}</span>
            </Button>
            <AlertDialog open={showCronConfirm} onOpenChange={setShowCronConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Run Cron Job</AlertDialogTitle>
                  <AlertDialogDescription>
                    This manual run will bypass the Apify 31 jobs/day limit. Your Apify usage may increase. Continue?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => cronMutation.mutate({ skipApifyLimit: true })} disabled={cronMutation.isPending}>
                    {cronMutation.isPending ? "Running..." : "Continue"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button 
              className="gap-2 text-sm sm:text-base" 
              onClick={handleSave} 
              disabled={saveMutation.isPending || !hasChanges || apifyLimitSumInvalid}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saveMutation.isSuccess ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
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

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Language (language)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: language</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    value={formData.jsearchLanguage}
                    onChange={(e) => setFormData({ ...formData, jsearchLanguage: e.target.value })}
                    placeholder="en, fr, de, es, etc."
                    className="font-mono text-xs"
                    maxLength={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    ISO 639 language code (e.g., "en" for English, "fr" for French). Leave empty to use the primary language in the specified country. Optional parameter.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Job Requirements (job_requirements)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: job_requirements</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    value={formData.jsearchJobRequirements}
                    onChange={(e) => setFormData({ ...formData, jsearchJobRequirements: e.target.value })}
                    placeholder="under_3_years_experience, more_than_3_years_experience, no_experience, no_degree"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated job requirements: under_3_years_experience, more_than_3_years_experience, no_experience, no_degree. Leave empty for all. Optional parameter.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Radius (radius)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: radius</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    type="number"
                    value={formData.jsearchRadius}
                    onChange={(e) => setFormData({ ...formData, jsearchRadius: e.target.value })}
                    placeholder="5"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Return jobs within a certain distance from location specified in query (in km). Optional parameter.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Exclude Job Publishers (exclude_job_publishers)
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: exclude_job_publishers</span>
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                  </Label>
                  <Input 
                    value={formData.jsearchExcludeJobPublishers}
                    onChange={(e) => setFormData({ ...formData, jsearchExcludeJobPublishers: e.target.value })}
                    placeholder="BeeBe, Dice"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list of job publishers to exclude (e.g., "BeeBe,Dice"). Leave empty to include all publishers. Optional parameter.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Apify LinkedIn Jobs Scraper Parameters */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Apify LinkedIn Jobs Scraper</CardTitle>
                <CardDescription>
                  Search parameters for Apify LinkedIn Jobs Scraper. Configure your API token in the API Keys tab. Up to 3 job titles, each with its own limit. Total limit per day is 31 (hard cap). Sum of limits must be ≤ 31.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  {[
                    { pos: "apifyPosition1" as const, max: "apifyMaxItems1" as const, label: "1" },
                    { pos: "apifyPosition2" as const, max: "apifyMaxItems2" as const, label: "2" },
                    { pos: "apifyPosition3" as const, max: "apifyMaxItems3" as const, label: "3" },
                  ].map(({ pos, max, label }) => (
                    <div key={label} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                      <div className="flex-1 space-y-1 min-w-0">
                        <Label className="text-sm">Position {label}</Label>
                        <Input
                          value={formData[pos]}
                          onChange={(e) => setFormData({ ...formData, [pos]: e.target.value })}
                          placeholder="web developer"
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-sm">Limit</Label>
                        <Input
                          type="number"
                          min="0"
                          max="31"
                          value={formData[max]}
                          onChange={(e) => setFormData({ ...formData, [max]: e.target.value })}
                          placeholder="10"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const sum = parseInt(formData.apifyMaxItems1 || "0", 10) + parseInt(formData.apifyMaxItems2 || "0", 10) + parseInt(formData.apifyMaxItems3 || "0", 10);
                  return sum > 31 ? (
                    <p className="text-sm text-destructive font-medium">
                      Sum of limits ({sum}) exceeds 31. Please reduce to 31 or less.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Total: {sum}/31 jobs per day</p>
                  );
                })()}

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Interval Between Searches (seconds)
                  </Label>
                  <Input 
                    type="number"
                    min="0"
                    max="86400"
                    value={formData.apifySearchIntervalSeconds}
                    onChange={(e) => setFormData({ ...formData, apifySearchIntervalSeconds: e.target.value })}
                    placeholder="60"
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    Wait time between each position search (seconds). Applies between 2nd, 3rd, etc. positions only. Max 24h (86400). Default: 60. Use 0 for no delay.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Country
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: country</span>
                    </Label>
                    <Input 
                      value={formData.apifyCountry}
                      onChange={(e) => setFormData({ ...formData, apifyCountry: e.target.value.toUpperCase() })}
                      placeholder="US"
                      className="font-mono"
                      maxLength={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      2-letter ISO country code (e.g., US, CA, GB). Uses Job Search country if left empty.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Location
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: location (optional)</span>
                    </Label>
                    <Input 
                      value={formData.apifyLocation}
                      onChange={(e) => setFormData({ ...formData, apifyLocation: e.target.value })}
                      placeholder="San Francisco"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      Parse Company Details
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: parseCompanyDetails</span>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Scrape additional company information (slower)
                    </p>
                  </div>
                  <Switch 
                    checked={formData.apifyParseCompanyDetails}
                    onCheckedChange={(checked) => setFormData({ ...formData, apifyParseCompanyDetails: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      Save Only Unique Items
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: saveOnlyUniqueItems</span>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Avoid duplicate job listings
                    </p>
                  </div>
                  <Switch 
                    checked={formData.apifySaveOnlyUniqueItems}
                    onCheckedChange={(checked) => setFormData({ ...formData, apifySaveOnlyUniqueItems: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      Follow Apply Redirects
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">API: followApplyRedirects</span>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Follow redirects when extracting apply URLs
                    </p>
                  </div>
                  <Switch 
                    checked={formData.apifyFollowApplyRedirects}
                    onCheckedChange={(checked) => setFormData({ ...formData, apifyFollowApplyRedirects: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Use Common Filters</Label>
                    <p className="text-sm text-muted-foreground">
                      Apply excluded keywords and other common filters to Apify results. Off = no filtering.
                    </p>
                  </div>
                  <Switch 
                    checked={formData.apifyUseCommonFilters}
                    onCheckedChange={(checked) => setFormData({ ...formData, apifyUseCommonFilters: checked })}
                  />
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

            {/* n8n Scraping Notice */}
            {showN8nNotice && (
              <Alert className="bg-primary/5 border-primary/20 relative">
                <Info className="h-4 w-4 text-primary" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setShowN8nNotice(false);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("n8n-notice-dismissed", "true");
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
                <AlertTitle className="text-base font-semibold pr-8">n8n Job Scraping Configuration</AlertTitle>
                <AlertDescription className="mt-2 space-y-2">
                  <p className="text-sm">
                    <strong>Important:</strong> n8n job scraping is not configured automatically after account setup. 
                    To activate the n8n workflow for your account, please reach out to the developer.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => window.open("https://neskines-o.vercel.app/", "_blank")}
                    >
                      Contact Developer
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Visit{" "}
                      <a 
                        href="https://neskines-o.vercel.app/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                      >
                        neskines-o.vercel.app
                      </a>
                      {" "}to get in touch
                    </span>
                  </div>
                </AlertDescription>
              </Alert>
            )}
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
                    <optgroup label="Single Provider">
                      <option value="perplexity">Perplexity Only</option>
                      <option value="gemini">Gemini Only</option>
                      <option value="openrouter">OpenRouter Only</option>
                    </optgroup>
                    <optgroup label="Two Providers">
                      <option value="perplexity,gemini">Perplexity → Gemini</option>
                      <option value="perplexity,openrouter">Perplexity → OpenRouter</option>
                      <option value="gemini,openrouter">Gemini → OpenRouter</option>
                    </optgroup>
                    <optgroup label="All Providers">
                      <option value="auto">Auto (Perplexity → Gemini → OpenRouter)</option>
                    </optgroup>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {formData.aiProviderPreference === "auto" || formData.aiProviderPreference === "perplexity,gemini,openrouter"
                      ? "Automatically uses Perplexity first, falls back to Gemini then OpenRouter if needed."
                      : formData.aiProviderPreference === "perplexity"
                      ? "Always uses Perplexity. No fallback to other providers."
                      : formData.aiProviderPreference === "gemini"
                      ? "Always uses Gemini. No fallback to other providers."
                      : formData.aiProviderPreference === "openrouter"
                      ? "Always uses OpenRouter. No fallback to other providers."
                      : formData.aiProviderPreference === "perplexity,gemini"
                      ? "Uses Perplexity first, falls back to Gemini if Perplexity fails."
                      : formData.aiProviderPreference === "perplexity,openrouter"
                      ? "Uses Perplexity first, falls back to OpenRouter if Perplexity fails."
                      : formData.aiProviderPreference === "gemini,openrouter"
                      ? "Uses Gemini first, falls back to OpenRouter if Gemini fails."
                      : "Automatically uses Perplexity first, falls back to Gemini then OpenRouter if needed."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Interview Prep AI Provider
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">For interview questions</span>
                  </Label>
                  <select
                    value={formData.interviewPrepAiProvider}
                    onChange={(e) => setFormData({ ...formData, interviewPrepAiProvider: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <optgroup label="Use Default">
                      <option value="auto">Same as AI Provider Preference above</option>
                    </optgroup>
                    <optgroup label="Single Provider">
                      <option value="perplexity">Perplexity Only</option>
                      <option value="gemini">Gemini Only</option>
                      <option value="openrouter">OpenRouter Only</option>
                    </optgroup>
                    <optgroup label="Two Providers">
                      <option value="perplexity,gemini">Perplexity → Gemini</option>
                      <option value="perplexity,openrouter">Perplexity → OpenRouter</option>
                      <option value="gemini,openrouter">Gemini → OpenRouter</option>
                    </optgroup>
                    <optgroup label="All Providers">
                      <option value="perplexity,gemini,openrouter">Perplexity → Gemini → OpenRouter</option>
                    </optgroup>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    AI model used to generate interview prep questions. Choose which provider(s) to use when creating practice questions from job descriptions.
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

                {formData.perplexityApiKey && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Perplexity Model
                      <span className="text-[10px] font-normal text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-semibold">PRO MODELS USE CREDITS</span>
                    </Label>
                    <select
                      value={formData.perplexityModel}
                      onChange={(e) => setFormData({ ...formData, perplexityModel: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="sonar">Sonar - Fast (Free tier)</option>
                      <option value="sonar-pro">Sonar Pro - Best Quality (Uses credits)</option>
                      <option value="sonar-reasoning">Sonar Reasoning - Advanced (Uses credits)</option>
                    </select>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        Pro Models Use Credits Faster
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Sonar Pro</strong> and <strong>Sonar Reasoning</strong> are premium models that consume credits at a higher rate than the free <strong>Sonar</strong> model.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Sonar</strong> (free) is recommended for most use cases. Only use Pro models if you need the highest quality and have sufficient credits.
                      </p>
                    </div>
                  </div>
                )}

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

                {formData.geminiApiKey && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Gemini Model
                      <span className="text-[10px] font-normal text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-semibold">PRO MODELS USE CREDITS</span>
                    </Label>
                    <select
                      value={formData.geminiModel}
                      onChange={(e) => setFormData({ ...formData, geminiModel: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash - Fast (Free tier)</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro - Best Quality (Uses credits)</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash - Fast (Free tier)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro - High Quality (Uses credits)</option>
                    </select>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        Pro Models Use Credits Faster
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Gemini Pro</strong> models consume credits at a higher rate than the free <strong>Flash</strong> models.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Flash</strong> models are recommended for most use cases. Only use Pro models if you need the highest quality and have sufficient credits.
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-border/50"></div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    OpenRouter API Key
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Access 100+ AI Models</span>
                  </Label>
                  <Input 
                    type="password" 
                    placeholder="Enter your OpenRouter API key" 
                    value={formData.openrouterApiKey}
                    onChange={(e) => setFormData({ ...formData, openrouterApiKey: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    OpenRouter provides access to 100+ AI models including Claude, GPT-4, Llama, and more. Get your API key from{" "}
                    <a 
                      href="https://openrouter.ai/keys" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-primary underline hover:text-primary/80"
                    >
                      OpenRouter API Keys
                    </a>
                    . Many free models available (look for <code className="bg-muted px-1 py-0.5 rounded text-[10px]">:free</code> suffix).
                  </p>
                </div>

                {formData.openrouterApiKey && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      OpenRouter Model
                      <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-semibold">FREE MODELS ONLY</span>
                    </Label>
                    <select
                      value={formData.openrouterModel}
                      onChange={(e) => setFormData({ ...formData, openrouterModel: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="mistralai/mistral-small-3.1-24b-instruct:free">Mistral Small 3.1 24B - Fast & Reliable (Recommended)</option>
                      <option value="meta-llama/llama-3.2-3b-instruct:free">Llama 3.2 3B Instruct - Lightweight (128K context)</option>
                      <option value="arcee-ai/trinity-large-preview:free">Arcee Trinity Large - 400B, Creative & Agentic (128K context)</option>
                      <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B Instruct - Multilingual (128K context)</option>
                      <option value="google/gemma-3-4b-it:free">Gemma 3 4B - Multimodal (128K context)</option>
                      <option value="google/gemma-3n-e2b-it:free">Gemma 3n E2B - Efficient (32K context)</option>
                    </select>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        Important: FREE Models Only (Not Available in Direct APIs)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        These models aren't available through direct APIs (no Gemini/Perplexity duplicates). All end with <code className="bg-muted px-1 py-0.5 rounded text-[10px]">:free</code> and are 100% free.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Strict Limits:</strong> 50 requests/day (enforced). Usage is blocked immediately when limit is reached.
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                        App will automatically refuse requests once daily limit is hit - no overages possible!
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-border/50"></div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Resume Optimization AI Provider
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">For Resume Optimizer</span>
                  </Label>
                  <select
                    value={formData.resumeOptimizationProvider}
                    onChange={(e) => setFormData({ ...formData, resumeOptimizationProvider: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="gemini">Gemini (Recommended)</option>
                    <option value="perplexity">Perplexity</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {formData.resumeOptimizationProvider === "gemini" 
                      ? "Uses Google Gemini AI for resume optimization. Best for creative restructuring and natural language generation."
                      : formData.resumeOptimizationProvider === "perplexity" 
                      ? "Uses Perplexity AI for resume optimization. Best for accurate ATS analysis and keyword matching."
                      : "Uses OpenRouter for resume optimization. Provides access to multiple AI models for more flexibility."}
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
                    . Limited to <strong>10 jobs per day</strong> to manage API credits.
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

            {/* Apify API Token */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Apify API</CardTitle>
                <CardDescription>
                  API token for Apify LinkedIn Jobs Scraper. Configure search parameters (positions, limits, country, location) in the Job Search tab.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Apify API Token
                    <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Required for Apify</span>
                  </Label>
                  <Input 
                    type="password" 
                    placeholder="Enter your Apify API token" 
                    value={formData.apifyApiToken}
                    onChange={(e) => setFormData({ ...formData, apifyApiToken: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API token from{" "}
                    <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      Apify Console
                    </a>
                    . Leave empty to skip Apify scraping.
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
                <CardTitle>Display Settings</CardTitle>
                <CardDescription>Configure how jobs are displayed in the dashboard and feed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1">
                    <Label className="text-base">High Priority Match Threshold</Label>
                    <p className="text-sm text-muted-foreground">
                      Jobs with match scores at or above this percentage will appear in the "High Priority Matches" section on the dashboard
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-20 h-9"
                      min="0"
                      max="100"
                      value={formData.highPriorityMatchThreshold}
                      onChange={(e) => setFormData({ ...formData, highPriorityMatchThreshold: e.target.value })}
                    />
                    <span className="font-mono font-bold text-primary">%</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1">
                      <Label className="text-base">Job Scraping Limit</Label>
                      <p className="text-sm text-muted-foreground">
                        Maximum number of jobs to scrape per sync (applies to JSearch API). Default is 5 to manage API credits efficiently.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-20 h-9"
                        min="1"
                        max="500"
                        value={formData.jobScrapingLimit}
                        onChange={(e) => setFormData({ ...formData, jobScrapingLimit: e.target.value })}
                      />
                      <span className="text-sm text-muted-foreground">jobs</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle>Daily Reminder Notifications</CardTitle>
                <CardDescription>
                  Get a daily Discord reminder to apply to unapplied jobs. Configure the time and match score threshold.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border/50">
                  <div className="space-y-0.5 flex-1">
                    <Label className="text-base">Enable Daily Reminders</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive a daily Discord notification reminding you to apply to unapplied jobs. Requires Discord notifications to be enabled.
                    </p>
                  </div>
                  <Switch 
                    checked={formData.reminderEnabled}
                    onCheckedChange={(checked) => {
                      setFormData({ ...formData, reminderEnabled: checked });
                      // Auto-save when toggled
                      saveReminderSettingMutation.mutate({ 
                        key: "reminder_enabled", 
                        value: checked.toString() 
                      });
                    }}
                    disabled={!formData.discordNotifications || saveReminderSettingMutation.isPending}
                  />
                </div>

                {!formData.discordNotifications && (
                  <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    <p className="text-sm text-amber-500">
                      <strong>Discord notifications must be enabled</strong> for reminders to work. Enable Discord notifications in the section above.
                    </p>
                  </div>
                )}

                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!formData.reminderEnabled || !formData.discordNotifications ? "opacity-50 pointer-events-none" : ""}`}>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Reminder Time
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">24-hour format</span>
                    </Label>
                    <Input
                      type="time"
                      value={formData.reminderTime}
                      onChange={(e) => {
                        setFormData({ ...formData, reminderTime: e.target.value });
                        // Auto-save when changed
                        saveReminderSettingMutation.mutate({ 
                          key: "reminder_time", 
                          value: e.target.value 
                        });
                      }}
                      className="font-mono"
                      disabled={!formData.reminderEnabled || !formData.discordNotifications || saveReminderSettingMutation.isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      Time when daily reminder is sent (24-hour format, e.g., 16:00 for 4:00 PM). Default: 4:00 PM.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Minimum Match Score
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">For reminders</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-20 h-9"
                        min="0"
                        max="100"
                        value={formData.reminderMatchThreshold}
                        onChange={(e) => {
                          setFormData({ ...formData, reminderMatchThreshold: e.target.value });
                          // Auto-save when changed (with debounce would be better, but this works)
                          const value = e.target.value;
                          setTimeout(() => {
                            saveReminderSettingMutation.mutate({ 
                              key: "reminder_match_threshold", 
                              value: value 
                            });
                          }, 500); // Small delay to avoid too many saves while typing
                        }}
                        disabled={!formData.reminderEnabled || !formData.discordNotifications || saveReminderSettingMutation.isPending}
                      />
                      <span className="font-mono font-bold text-primary">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Only count jobs with match scores at or above this percentage in the reminder. Default: 70%.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                  <p className="text-sm text-muted-foreground">
                    <strong>How it works:</strong> At the configured time, you'll receive a Discord notification showing how many unapplied jobs you have. 
                    The reminder will only count jobs that haven't been marked as applied and haven't been rejected.
                  </p>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1">
                      <Label className="text-base">Test Reminder</Label>
                      <p className="text-sm text-muted-foreground">
                        Send a test reminder notification to your Discord channel to verify it's working correctly.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => reminderTestMutation.mutate()}
                      disabled={reminderTestMutation.isPending || !formData.reminderEnabled || !formData.discordNotifications}
                    >
                      {reminderTestMutation.isPending ? "Testing..." : "Test Reminder"}
                    </Button>
                  </div>
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

import { Link, useLocation } from "wouter";
import { NAV_ITEMS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Bot, Menu, LogOut, Shield } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAPIUsage, getJobs } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { APIUsageModal } from "@/components/APIUsageModal";
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler";

type ProviderKey = "perplexity" | "gemini" | "openrouter" | "jsearch" | "n8n";

interface ProviderDisplay {
  key: ProviderKey;
  name: string;
  usage: {
    dailyCount: number;
    dailyLimit: number;
    usagePercentage: number;
    resetTime?: Date;
    // For JSearch, these are monthly instead of daily
    monthlyCount?: number;
    monthlyLimit?: number;
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showAPIUsageModal, setShowAPIUsageModal] = useState(false);
  const [currentProviderIndex, setCurrentProviderIndex] = useState(0);

  // Fetch API usage
  const { data: apiUsage } = useQuery({
    queryKey: ["apiUsage"],
    queryFn: getAPIUsage,
    refetchInterval: 60000, // Refetch every minute
  });

  // Prefetch Job Feed and Dashboard queries so they're ready when user navigates
  useEffect(() => {
    if (!user) return;
    queryClient.prefetchQuery({
      queryKey: ["jobs", "all", undefined, "unapplied"],
      queryFn: () => getJobs({ isApplied: false }),
      staleTime: 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["jobs", "all"],
      queryFn: () => getJobs(),
      staleTime: 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["jobs", "unapplied", false],
      queryFn: () => getJobs({ isApplied: false }),
      staleTime: 60_000,
    });
  }, [user, queryClient]);

  // Build list of available providers with their usage data
  const availableProviders = useMemo<ProviderDisplay[]>(() => {
    if (!apiUsage?.providers) return [];
    
    const providers: ProviderDisplay[] = [];
    
    // Add Perplexity
    if (apiUsage.providers.perplexity) {
      providers.push({
        key: "perplexity",
        name: "Perplexity",
        usage: {
          dailyCount: apiUsage.providers.perplexity.dailyCount,
          dailyLimit: apiUsage.providers.perplexity.dailyLimit,
          usagePercentage: apiUsage.providers.perplexity.usagePercentage,
          resetTime: apiUsage.providers.perplexity.resetTime,
        },
      });
    }
    
    // Add Gemini
    if (apiUsage.providers.gemini) {
      providers.push({
        key: "gemini",
        name: "Gemini",
        usage: {
          dailyCount: apiUsage.providers.gemini.dailyCount,
          dailyLimit: apiUsage.providers.gemini.dailyLimit,
          usagePercentage: apiUsage.providers.gemini.usagePercentage,
          resetTime: apiUsage.providers.gemini.resetTime,
        },
      });
    }
    
    // Add OpenRouter
    if (apiUsage.providers.openrouter) {
      providers.push({
        key: "openrouter",
        name: "OpenRouter",
        usage: {
          dailyCount: apiUsage.providers.openrouter.dailyCount,
          dailyLimit: apiUsage.providers.openrouter.dailyLimit,
          usagePercentage: apiUsage.providers.openrouter.usagePercentage,
          resetTime: apiUsage.providers.openrouter.resetTime,
        },
      });
    }
    
    // Add Apify (daily limit: 31 jobs)
    if (apiUsage.providers.apify) {
      providers.push({
        key: "apify",
        name: "Apify",
        usage: {
          dailyCount: apiUsage.providers.apify.dailyCount,
          dailyLimit: apiUsage.providers.apify.dailyLimit,
          usagePercentage: apiUsage.providers.apify.usagePercentage,
          resetTime: apiUsage.resetTime,
        },
      });
    }
    
    // Add JSearch (uses monthly limits, not daily)
    if (apiUsage.providers.jsearch) {
      const jsearch = apiUsage.providers.jsearch as any; // JSearchUsage has different structure
      providers.push({
        key: "jsearch",
        name: "JSearch",
        usage: {
          dailyCount: jsearch.monthlyCount || 0, // Use monthly as daily for display
          dailyLimit: jsearch.monthlyLimit || 200, // Use monthly limit
          usagePercentage: jsearch.usagePercentage || 0,
          resetTime: jsearch.resetTime,
          monthlyCount: jsearch.monthlyCount,
          monthlyLimit: jsearch.monthlyLimit,
        },
      });
    }
    
    // n8n usage hidden for now
    // if (apiUsage.providers.n8n) { ... }

    return providers;
  }, [apiUsage]);

  // Reset index if it's out of bounds when providers change
  useEffect(() => {
    if (availableProviders.length > 0 && currentProviderIndex >= availableProviders.length) {
      setCurrentProviderIndex(0);
    }
  }, [availableProviders.length, currentProviderIndex]);

  // Rotate through providers every 5 seconds (paused when modal is open)
  useEffect(() => {
    if (availableProviders.length === 0 || availableProviders.length === 1) return;
    if (showAPIUsageModal) return; // Pause rotation when modal is open
    
    const interval = setInterval(() => {
      setCurrentProviderIndex((prev) => (prev + 1) % availableProviders.length);
    }, 5000); // Rotate every 5 seconds

    return () => clearInterval(interval);
  }, [availableProviders.length, showAPIUsageModal]);

  // Get current provider being displayed
  const currentProvider = availableProviders.length > 0 
    ? availableProviders[currentProviderIndex] || availableProviders[0]
    : null;

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      setLocation("/login");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive",
      });
    }
  };

  const NavContent = () => (
    <>
      <div className="p-6 border-b border-sidebar-border flex items-center gap-3">
        <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center border border-primary/50">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-mono font-bold text-lg tracking-tight text-sidebar-primary-foreground">NeskiApply<span className="text-primary">.AI</span></h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">v2.5.0_beta</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group cursor-pointer",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.label}
              </div>
            </Link>
          );
        })}
        {user?.role === "admin" && (
          <Link href="/admin" onClick={() => setIsMobileOpen(false)}>
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group cursor-pointer",
                location === "/admin"
                  ? "bg-sidebar-accent text-sidebar-primary-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Shield className={cn("h-4 w-4 transition-colors", location === "/admin" ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              Admin Panel
            </div>
          </Link>
        )}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div 
          className="rounded-lg bg-card/50 border border-border p-3 space-y-2 cursor-pointer hover:bg-card/70 transition-all duration-300"
          onClick={() => setShowAPIUsageModal(true)}
        >
          {currentProvider ? (
            <>
              <div className="flex justify-between items-center text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">API Usage</span>
                  <span className="text-primary font-semibold">{currentProvider.name}</span>
                  {availableProviders.length > 1 && (
                    <span className="text-[10px] text-muted-foreground/70">
                      ({currentProviderIndex + 1}/{availableProviders.length})
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground">
                  {currentProvider.usage.usagePercentage.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                {(() => {
                  const precisePercentage = currentProvider.usage.dailyLimit > 0 
                    ? Math.min(100, (currentProvider.usage.dailyCount / currentProvider.usage.dailyLimit) * 100)
                    : 0;
                  
                  // Ensure minimum visibility for small percentages
                  const displayWidth = precisePercentage > 0 && precisePercentage < 1
                    ? Math.max(precisePercentage, 0.5) // At least 0.5% for visibility if usage > 0
                    : Math.max(precisePercentage, 0);
                  
                  return (
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500 ease-out",
                        currentProvider.usage.usagePercentage >= 90 
                          ? "bg-red-500" 
                          : currentProvider.usage.usagePercentage >= 75
                          ? "bg-amber-500"
                          : "bg-primary"
                      )}
                      style={{ 
                        width: `${displayWidth}%`,
                      }}
                    />
                  );
                })()}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {currentProvider.key === "jsearch" || currentProvider.key === "n8n" ? (
                  <>
                    {currentProvider.usage.monthlyCount || currentProvider.usage.dailyCount} / {currentProvider.usage.monthlyLimit || currentProvider.usage.dailyLimit} this month
                    {currentProvider.usage.resetTime && (
                      <> • Resets {formatDistanceToNow(new Date(currentProvider.usage.resetTime), { addSuffix: true })}</>
                    )}
                  </>
                ) : (
                  <>
                    {currentProvider.usage.dailyCount} / {currentProvider.usage.dailyLimit} today
                    {currentProvider.usage.resetTime && (
                      <> • Resets {formatDistanceToNow(new Date(currentProvider.usage.resetTime), { addSuffix: true })}</>
                    )}
                  </>
                )}
              </div>
              {availableProviders.length > 1 && (
                <div className="flex gap-1 justify-center pt-1">
                  {availableProviders.map((_, index) => (
                    <div
                      key={index}
                      className={cn(
                        "h-1 w-1 rounded-full transition-all duration-300",
                        index === currentProviderIndex
                          ? "bg-primary w-3"
                          : "bg-muted-foreground/30"
                      )}
                    />
                  ))}
                </div>
              )}
              <div className="text-[10px] text-primary/70 mt-1">
                Click to view all providers →
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>API Usage</span>
                <span>...</span>
              </div>
              <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-muted" style={{ width: "0%" }} />
              </div>
              <div className="text-[10px] text-muted-foreground">
                Loading...
              </div>
            </>
          )}
        </div>
        
        <APIUsageModal
          open={showAPIUsageModal}
          onOpenChange={setShowAPIUsageModal}
          apiUsage={apiUsage || null}
          isLoading={!apiUsage}
        />
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 px-1">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-xs ring-2 ring-background">
              {user?.username?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.username || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">Logged in</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {isLoggingOut ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full bg-background text-foreground font-sans overflow-hidden selection:bg-primary/20 selection:text-primary">
      <GlobalErrorHandler />
      {/* Sidebar Desktop */}
      <aside className="w-64 hidden md:flex flex-col border-r border-sidebar-border bg-sidebar/50 backdrop-blur-xl">
        <NavContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header Mobile */}
        <header className="h-14 flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 md:hidden z-10">
           <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-mono font-bold">NeskiApply.AI</span>
           </div>
           
           <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
             <SheetTrigger asChild>
               <Button variant="ghost" size="icon" className="h-9 w-9">
                 <Menu className="h-5 w-5" />
               </Button>
             </SheetTrigger>
             <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar border-r border-sidebar-border overflow-y-auto">
               <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
               <SheetDescription className="sr-only">
                 Access all pages and features of the application
               </SheetDescription>
               <NavContent />
             </SheetContent>
           </Sheet>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 scroll-smooth -webkit-overflow-scrolling-touch">
          <div className="max-w-6xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

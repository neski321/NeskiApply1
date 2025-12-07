import { Link, useLocation } from "wouter";
import { NAV_ITEMS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Bot, Menu, LogOut, Shield } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { getAPIUsage } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();
  const { toast } = useToast();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Fetch API usage
  const { data: apiUsage } = useQuery({
    queryKey: ["apiUsage"],
    queryFn: getAPIUsage,
    refetchInterval: 60000, // Refetch every minute
  });

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
        <div className="rounded-lg bg-card/50 border border-border p-3 space-y-2">
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>API Usage</span>
            <span>
              {apiUsage ? `${apiUsage.usagePercentage}%` : "..."}
            </span>
          </div>
          <div className="h-1 w-full bg-muted/50 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all",
                apiUsage && apiUsage.usagePercentage >= 90 
                  ? "bg-red-500" 
                  : apiUsage && apiUsage.usagePercentage >= 75
                  ? "bg-amber-500"
                  : "bg-primary"
              )}
              style={{ width: apiUsage ? `${apiUsage.usagePercentage}%` : "0%" }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground">
            {apiUsage ? (
              <>
                {apiUsage.dailyCount} / {apiUsage.dailyLimit} today
                {apiUsage.resetTime && (
                  <> • Resets {formatDistanceToNow(new Date(apiUsage.resetTime), { addSuffix: true })}</>
                )}
              </>
            ) : (
              "Loading..."
            )}
          </div>
        </div>
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
      {/* Sidebar Desktop */}
      <aside className="w-64 hidden md:flex flex-col border-r border-sidebar-border bg-sidebar/50 backdrop-blur-xl">
        <NavContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header Mobile */}
        <header className="h-14 border-b border-border bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 md:hidden">
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
             <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar border-r border-sidebar-border">
               <NavContent />
             </SheetContent>
           </Sheet>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-6xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

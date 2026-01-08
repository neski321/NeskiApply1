import { useEffect } from "react";
import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Only redirect if we're sure the user is not authenticated
    // Give more time to allow auth state to update after login (especially for Railway)
    if (!isLoading && !isAuthenticated) {
      console.log("[ProtectedRoute] Not authenticated, redirecting to signup");
      const timer = setTimeout(() => {
        setLocation("/signup");
      }, 500); // Increased delay to give more time for auth check
      return () => clearTimeout(timer);
    } else if (isAuthenticated) {
      console.log("[ProtectedRoute] Authenticated, allowing access");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  return <>{children}</>;
}


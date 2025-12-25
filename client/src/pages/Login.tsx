import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, ArrowRight, Sparkles } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isLoggingIn, loginError } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please enter both username and password");
      return;
    }

    try {
      const loginResult = await login({ username, password });
      console.log("[Login] Login API call successful:", loginResult);
      
      // Wait for session cookie to be set and propagated
      // This is especially important on Railway where network latency can cause issues
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Refetch auth status to ensure session is recognized
      console.log("[Login] Refetching auth status...");
      const authResult = await queryClient.refetchQueries({ queryKey: ["auth"] });
      console.log("[Login] Auth refetch result:", authResult);
      
      // Check auth status one more time before redirecting
      const authData = await queryClient.getQueryData<{ authenticated: boolean; user: any }>(["auth"]);
      console.log("[Login] Current auth data:", authData);
      
      if (!authData?.authenticated) {
        console.warn("[Login] Still not authenticated after refetch, waiting more...");
        await new Promise(resolve => setTimeout(resolve, 500));
        await queryClient.refetchQueries({ queryKey: ["auth"] });
      }
      
      toast({
        title: "Welcome back!",
        description: "You've been successfully logged in.",
      });
      
      // Use a delay before redirect to ensure state is fully updated
      setTimeout(() => {
        console.log("[Login] Redirecting to dashboard...");
        setLocation("/");
      }, 200);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to login";
      setError(errorMessage);
      toast({
        title: "Login failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo/Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
              <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Welcome Back</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Sign in to continue to your job application dashboard
          </p>
        </div>

        <Card className="border-border/50 shadow-xl bg-card/50 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoggingIn}
                  className="h-11"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoggingIn}
                  className="h-11"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Don't have an account? </span>
              <button
                onClick={() => setLocation("/signup")}
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


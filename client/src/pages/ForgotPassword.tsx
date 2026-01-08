import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Server returned ${response.status}: ${text.substring(0, 100)}`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to request password reset");
      }

      setIsSuccess(true);
      toast({
        title: "Reset link sent",
        description: data.message,
      });

      // Automatically open the reset URL in a new tab
      if (data.resetUrl) {
        // Open in new tab
        window.open(data.resetUrl, "_blank");
        toast({
          title: "Reset link opened",
          description: "The password reset page has been opened in a new tab.",
          variant: "default",
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to request password reset";
      toast({
        title: "Request failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Check Your Email</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              If an account with that username exists, a password reset link has been sent.
            </p>
          </div>

          <Card className="border-border/50 shadow-xl bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Please check your email for the password reset link. The link will expire in 1 hour.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/login")}
                    className="flex-1"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Button>
                  <Button
                    onClick={() => {
                      setIsSuccess(false);
                      setUsername("");
                    }}
                    className="flex-1"
                  >
                    Request Another
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Reset Password</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Enter your username to receive a password reset link
          </p>
        </div>

        <Card className="border-border/50 shadow-xl bg-card/50 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Forgot Password</CardTitle>
            <CardDescription>
              We'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  disabled={isLoading}
                  className="h-11"
                  autoComplete="username"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => setLocation("/login")}
                className="text-sm text-primary hover:underline font-medium flex items-center justify-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


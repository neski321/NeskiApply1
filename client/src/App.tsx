import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import JobFeed from "@/pages/JobFeed";
import Resumes from "@/pages/Resumes";
import Settings from "@/pages/Settings";
import Activity from "@/pages/Activity";
import ATSAnalyzer from "@/pages/ATSAnalyzer";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import { useAuth } from "@/hooks/use-auth";

function AuthRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return null;
  }
  
  if (isAuthenticated) {
    return <Redirect to="/" />;
  }
  
  return null;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login">
        <AuthRedirect />
        <Login />
      </Route>
      <Route path="/signup">
        <AuthRedirect />
        <Signup />
      </Route>
      
      {/* Protected routes */}
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/jobs">
        <ProtectedRoute>
          <JobFeed />
        </ProtectedRoute>
      </Route>
      <Route path="/ats-analyzer">
        <ProtectedRoute>
          <ATSAnalyzer />
        </ProtectedRoute>
      </Route>
      <Route path="/resumes">
        <ProtectedRoute>
          <Resumes />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/activity">
        <ProtectedRoute>
          <Activity />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

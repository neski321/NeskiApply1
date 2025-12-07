import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import JobFeed from "@/pages/JobFeed";
import Resumes from "@/pages/Resumes";
import Settings from "@/pages/Settings";
import Activity from "@/pages/Activity";
import ATSAnalyzer from "@/pages/ATSAnalyzer";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/jobs" component={JobFeed} />
      <Route path="/ats-analyzer" component={ATSAnalyzer} />
      <Route path="/resumes" component={Resumes} />
      <Route path="/settings" component={Settings} />
      <Route path="/activity" component={Activity} />
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

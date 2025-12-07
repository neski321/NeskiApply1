import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, XCircle, Clock, Upload, Send, AlertCircle, FileText, Briefcase, Wand2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getActivityLogs } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import type { ActivityLog } from "@shared/schema";

const getIconForType = (type: string) => {
  switch (type) {
    case "success":
      return CheckCircle;
    case "error":
      return XCircle;
    case "warning":
      return AlertCircle;
    case "info":
    default:
      return Clock;
  }
};

const getColorForType = (type: string) => {
  switch (type) {
    case "success":
      return "text-emerald-500";
    case "error":
      return "text-red-500";
    case "warning":
      return "text-amber-500";
    case "info":
    default:
      return "text-blue-500";
  }
};

const getIconForMessage = (message: string) => {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("resume")) return FileText;
  if (lowerMessage.includes("job") || lowerMessage.includes("scrap")) return Briefcase;
  if (lowerMessage.includes("match") || lowerMessage.includes("analy")) return Wand2;
  if (lowerMessage.includes("applied")) return CheckCircle;
  if (lowerMessage.includes("discord") || lowerMessage.includes("sent")) return Send;
  return Clock;
};

export default function Activity() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: () => getActivityLogs(200),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const groupedLogs = logs.reduce((acc, log) => {
    const date = new Date(log.createdAt).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(log);
    return acc;
  }, {} as Record<string, ActivityLog[]>);

  const sortedDates = Object.keys(groupedLogs).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">System Activity Log</h1>
          <div className="text-sm text-muted-foreground">
            {logs.length} {logs.length === 1 ? "event" : "events"} logged
          </div>
        </div>
        
        <Card className="bg-card/50 border-border/50 flex-1">
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading activity logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No activity yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Activity logs will appear here as you use the system (scraping jobs, matching resumes, etc.).
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-8">
                  {sortedDates.map((date) => {
                    const dateLogs = groupedLogs[date];
                    const isToday = new Date(date).toDateString() === new Date().toDateString();
                    const isYesterday = new Date(date).toDateString() === 
                      new Date(Date.now() - 86400000).toDateString();
                    
                    return (
                      <div key={date} className="space-y-4">
                        <div className="sticky top-0 bg-card/80 backdrop-blur-sm z-10 pb-2 border-b border-border">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                            {isToday ? "Today" : isYesterday ? "Yesterday" : new Date(date).toLocaleDateString("en-US", { 
                              weekday: "long", 
                              year: "numeric", 
                              month: "long", 
                              day: "numeric" 
                            })}
                          </h3>
                        </div>
                        <div className="space-y-4">
                          {dateLogs.map((log) => {
                            const Icon = getIconForMessage(log.message) || getIconForType(log.type);
                            const color = getColorForType(log.type);
                            
                            return (
                              <div key={log.id} className="flex items-start gap-4 group">
                                <div className={`mt-0.5 p-1 rounded-full bg-background border border-border ${color}`}>
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <p className="text-sm font-medium leading-none">{log.message}</p>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

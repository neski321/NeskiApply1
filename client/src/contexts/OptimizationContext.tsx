import React, { createContext, useContext, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, FileText } from "lucide-react";
import { useLocation } from "wouter";

interface OptimizationJob {
  jobId: number;
  jobTitle: string;
  jobCompany: string;
  status: "optimizing" | "completed" | "error";
  error?: string;
  resultId?: number;
  modalClosed?: boolean; // Track if user closed modal
}

interface OptimizationContextType {
  currentOptimization: OptimizationJob | null;
  startOptimization: (jobId: number, jobTitle: string, jobCompany: string) => void;
  notifyModalClosed: () => void; // Called when modal closes during optimization
  completeOptimization: (resultId: number) => void;
  failOptimization: (error: string) => void;
  clearOptimization: () => void;
}

const OptimizationContext = createContext<OptimizationContextType | undefined>(undefined);

export function OptimizationProvider({ children }: { children: React.ReactNode }) {
  const [currentOptimization, setCurrentOptimization] = useState<OptimizationJob | null>(null);
  const { toast, dismiss } = useToast();
  const [, setLocation] = useLocation();
  const [optimizingToastId, setOptimizingToastId] = useState<string | undefined>();

  const startOptimization = useCallback((jobId: number, jobTitle: string, jobCompany: string) => {
    const job: OptimizationJob = {
      jobId,
      jobTitle,
      jobCompany,
      status: "optimizing",
      modalClosed: false,
    };
    
    setCurrentOptimization(job);
    // Don't show notification yet - only when modal is closed
  }, []);

  const notifyModalClosed = useCallback(() => {
    if (!currentOptimization || currentOptimization.status !== "optimizing") return;
    
    // User closed modal during optimization - show persistent notification
    setCurrentOptimization({
      ...currentOptimization,
      modalClosed: true,
    });
    
    const { id } = toast({
      title: (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Optimizing Resume</span>
        </div>
      ),
      description: `Optimizing your resume for "${currentOptimization.jobTitle}" at ${currentOptimization.jobCompany}...`,
      duration: Infinity, // Don't auto-dismiss
    });
    
    setOptimizingToastId(id);
  }, [currentOptimization, toast]);

  const completeOptimization = useCallback((resultId: number) => {
    if (!currentOptimization) return;
    
    // Dismiss the "optimizing" toast if it was shown
    if (optimizingToastId) {
      dismiss(optimizingToastId);
    }
    
    // Update state
    setCurrentOptimization({
      ...currentOptimization,
      status: "completed",
      resultId,
    });
    
    // Only show success notification if modal was closed (user is not looking at the result)
    if (currentOptimization.modalClosed) {
      toast({
        title: (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Resume Optimized!</span>
          </div>
        ),
        description: (
          <div className="space-y-3">
            <p className="text-sm">
              Your resume for "{currentOptimization.jobTitle}" at {currentOptimization.jobCompany} has been optimized successfully.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  setLocation("/resumes?tab=optimized");
                }}
              >
                <FileText className="h-3 w-3 mr-1" />
                View Resume
              </Button>
            </div>
          </div>
        ),
        duration: 10000, // Show for 10 seconds
      });
    }
    
    // Clear after showing success
    setTimeout(() => {
      setCurrentOptimization(null);
      setOptimizingToastId(undefined);
    }, 500);
  }, [currentOptimization, optimizingToastId, toast, dismiss, setLocation]);

  const failOptimization = useCallback((error: string) => {
    if (!currentOptimization) return;
    
    // Dismiss the "optimizing" toast if it was shown
    if (optimizingToastId) {
      dismiss(optimizingToastId);
    }
    
    // Update state
    setCurrentOptimization({
      ...currentOptimization,
      status: "error",
      error,
    });
    
    // Only show error notification if modal was closed
    if (currentOptimization.modalClosed) {
      toast({
        title: "Optimization Failed",
        description: error,
        variant: "destructive",
        duration: 5000,
      });
    }
    
    // Clear after showing error
    setTimeout(() => {
      setCurrentOptimization(null);
      setOptimizingToastId(undefined);
    }, 500);
  }, [currentOptimization, optimizingToastId, toast, dismiss]);

  const clearOptimization = useCallback(() => {
    if (optimizingToastId) {
      dismiss(optimizingToastId);
    }
    setCurrentOptimization(null);
    setOptimizingToastId(undefined);
  }, [optimizingToastId, dismiss]);

  return (
    <OptimizationContext.Provider
      value={{
        currentOptimization,
        startOptimization,
        notifyModalClosed,
        completeOptimization,
        failOptimization,
        clearOptimization,
      }}
    >
      {children}
    </OptimizationContext.Provider>
  );
}

export function useOptimization() {
  const context = useContext(OptimizationContext);
  if (context === undefined) {
    throw new Error("useOptimization must be used within an OptimizationProvider");
  }
  return context;
}


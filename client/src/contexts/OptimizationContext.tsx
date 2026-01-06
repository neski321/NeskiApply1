import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import { OptimizedResumeModal } from "@/components/jobs/OptimizedResumeModal";
import { useQueryClient } from "@tanstack/react-query";
import { getOptimizedResumes, getResume } from "@/lib/api";

interface OptimizationJob {
  jobId: number;
  jobTitle: string;
  jobCompany: string;
  status: "optimizing" | "completed" | "error";
  error?: string;
  resultData?: any; // Full optimization result
  modalClosed?: boolean; // Track if user closed modal
}

interface OptimizationContextType {
  currentOptimization: OptimizationJob | null;
  startOptimization: (jobId: number, jobTitle: string, jobCompany: string) => void;
  notifyModalClosed: (jobId: number) => void; // Called when modal closes during optimization
  completeOptimization: (jobId: number, resultData: any) => void;
  failOptimization: (error: string) => void;
  clearOptimization: () => void;
  showResultModal: () => void; // Show the result modal
}

const OptimizationContext = createContext<OptimizationContextType | undefined>(undefined);

export function OptimizationProvider({ children }: { children: React.ReactNode }) {
  const [currentOptimization, setCurrentOptimization] = useState<OptimizationJob | null>(null);
  const { toast, dismiss } = useToast();
  const [optimizingToastId, setOptimizingToastId] = useState<string | undefined>();
  const [showModal, setShowModal] = useState(false);
  const queryClient = useQueryClient();
  const completionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCompletedRef = useRef(false);

  const startOptimization = useCallback((jobId: number, jobTitle: string, jobCompany: string) => {
    // Reset completion flag for new optimization
    hasCompletedRef.current = false;
    
    // Clear any existing polling interval
    if (completionCheckIntervalRef.current) {
      clearInterval(completionCheckIntervalRef.current);
      completionCheckIntervalRef.current = null;
    }
    
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

  const notifyModalClosed = useCallback((jobId: number) => {
    if (!currentOptimization || currentOptimization.jobId !== jobId || currentOptimization.status !== "optimizing") return;
    
    // Step 3: User closed modal during optimization - show persistent "optimizing" notification
    setCurrentOptimization(prev => {
      if (!prev) return null;
      return {
        ...prev,
        modalClosed: true,
      };
    });
    
    const { id } = toast({
      title: (
        <div className="flex items-center gap-2 text-base font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
          <span>Optimizing Resume...</span>
        </div>
      ),
      description: (
        <p className="text-sm text-muted-foreground">
          Optimizing your resume for "{currentOptimization.jobTitle}" at {currentOptimization.jobCompany}. This may take a moment.
        </p>
      ),
      duration: Infinity, // Don't auto-dismiss - will be replaced by completion notification
    });
    
    setOptimizingToastId(id);
  }, [currentOptimization, toast]);

  const completeOptimization = useCallback((jobId: number, resultData: any) => {
    try {
      // Validate inputs
      if (!jobId || !resultData) {
        console.error("completeOptimization called with invalid data:", { jobId, resultData });
        return;
      }
      
      // Check if we have a current optimization matching this jobId
      setCurrentOptimization(prev => {
        if (!prev || prev.jobId !== jobId) {
          console.warn("completeOptimization: No matching optimization found for jobId:", jobId);
          return prev; // Don't update if no match
        }
        
        // Validate resultData structure
        if (!resultData.job || !resultData.originalResume || !resultData.optimizedResume) {
          console.error("completeOptimization: Invalid resultData structure:", resultData);
          return prev; // Don't update if data is invalid
        }
        
        // Capture data before updating state
        const jobTitle = prev.jobTitle;
        const jobCompany = prev.jobCompany;
        const wasModalClosed = prev.modalClosed;
        
        // Update state with validated result data first
        const updatedState = {
          ...prev,
          status: "completed" as const,
          resultData,
        };
        
        // Dismiss the "optimizing" toast if it was shown (use functional update to get current value)
        setOptimizingToastId(currentToastId => {
          if (currentToastId) {
            try {
              dismiss(currentToastId);
            } catch (error) {
              console.error("Error dismissing optimizing toast:", error);
            }
          }
          return undefined;
        });
        
        // Step 4: If user left the modal, show completion notification with clear messaging
        if (wasModalClosed) {
          try {
            const completionToastId = toast({
              title: (
                <div className="flex items-center gap-2 text-base sm:text-lg font-semibold">
                  <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 flex-shrink-0" />
                  <span>Optimization Complete!</span>
                </div>
              ),
              description: (
                <div className="text-sm pt-1.5">
                  <p className="font-medium text-foreground">
                    Resume optimized for <span className="font-semibold">"{jobTitle}"</span> at {jobCompany}
                  </p>
                </div>
              ),
              duration: Infinity, // Don't auto-dismiss - user must interact
              action: (
                <ToastAction
                  altText="View optimized resume results"
                  onClick={(e) => {
                    e.preventDefault();
                    try {
                      setShowModal(true);
                      dismiss(completionToastId);
                    } catch (error) {
                      console.error("Error opening modal from notification:", error);
                    }
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 sm:h-10 px-4 sm:px-6 text-sm font-medium rounded-md mt-2 sm:mt-0"
                >
                  View Results
                </ToastAction>
              ),
              className: "w-[calc(100vw-2rem)] sm:max-w-[480px]",
            });
          } catch (toastError) {
            console.error("Error showing completion toast:", toastError);
            // Don't fail the whole operation if toast fails
          }
        }
        
        return updatedState;
      });
    } catch (error) {
      console.error("Error in completeOptimization:", error);
      // Don't throw - the optimization succeeded, this is just a notification error
    }
  }, [toast, dismiss]);

  // Store completeOptimization in a ref so it can be accessed in useEffect
  const completeOptimizationRef = useRef(completeOptimization);
  useEffect(() => {
    completeOptimizationRef.current = completeOptimization;
  }, [completeOptimization]);

  // Poll for optimization completion when modal is closed and optimization is in progress
  useEffect(() => {
    const currentOpt = currentOptimization;
    
    // Only poll if:
    // 1. There's an active optimization
    // 2. Modal was closed (user left)
    // 3. Status is still "optimizing"
    // 4. We haven't already detected completion
    if (
      currentOpt && 
      currentOpt.modalClosed && 
      currentOpt.status === "optimizing" && 
      !hasCompletedRef.current
    ) {
      // Poll every 2 seconds to check if optimization completed
      completionCheckIntervalRef.current = setInterval(async () => {
        try {
          // Check if an optimized resume was created for this job
          const optimizedResumes = await getOptimizedResumes(currentOpt.jobId);
          
          // Look for a resume created very recently (within last 30 seconds)
          const recentResume = optimizedResumes.find(resume => {
            const createdAt = new Date(resume.createdAt);
            const now = new Date();
            const secondsAgo = (now.getTime() - createdAt.getTime()) / 1000;
            return secondsAgo < 30; // Created within last 30 seconds
          });

          if (recentResume && !hasCompletedRef.current) {
            // Optimization completed! Fetch the full result
            hasCompletedRef.current = true;
            
            // Clear the interval
            if (completionCheckIntervalRef.current) {
              clearInterval(completionCheckIntervalRef.current);
              completionCheckIntervalRef.current = null;
            }

            // Invalidate queries to get fresh data
            queryClient.invalidateQueries({ queryKey: ["optimizedResumes"] });
            
            // Fetch the full original resume data (needed for ResumeView component)
            let fullOriginalResume = null;
            try {
              if (recentResume.originalResumeId) {
                fullOriginalResume = await getResume(recentResume.originalResumeId);
              }
            } catch (error) {
              console.error("Error fetching original resume:", error);
              // Fallback to minimal data if fetch fails
              fullOriginalResume = recentResume.originalResume || { 
                id: recentResume.originalResumeId, 
                name: "Unknown Resume",
                skills: [],
                experience: "",
                education: "",
                rawContent: "",
              };
            }
            
            // Construct result data structure with full original resume
            const resultData = {
              job: recentResume.job || { id: currentOpt.jobId, title: currentOpt.jobTitle, company: currentOpt.jobCompany },
              originalResume: fullOriginalResume || recentResume.originalResume || { 
                id: recentResume.originalResumeId, 
                name: "Unknown Resume",
                skills: [],
                experience: "",
                education: "",
                rawContent: "",
              },
              optimizedResume: {
                professionalSummary: recentResume.professionalSummary,
                technicalSkills: Array.isArray(recentResume.technicalSkills) 
                  ? recentResume.technicalSkills 
                  : typeof recentResume.technicalSkills === 'string'
                  ? recentResume.technicalSkills
                  : [],
                education: recentResume.education,
                relevantExperience: recentResume.relevantExperience || [],
                projects: recentResume.projects || [],
                changes: recentResume.changes || [],
              },
              atsAnalysis: null, // Will be fetched when modal opens
              optimizedAnalysis: {
                originalScore: recentResume.originalScore,
                newScore: recentResume.newScore,
                scoreImprovement: recentResume.scoreImprovement,
                improved: recentResume.improved,
              },
              savedOptimizedResume: {
                id: recentResume.id,
                createdAt: recentResume.createdAt,
              },
            };

            // Call completeOptimization with the result
            completeOptimizationRef.current(currentOpt.jobId, resultData);
          }
        } catch (error) {
          console.error("Error checking optimization completion:", error);
        }
      }, 2000); // Check every 2 seconds

      // Cleanup interval on unmount or when optimization completes
      return () => {
        if (completionCheckIntervalRef.current) {
          clearInterval(completionCheckIntervalRef.current);
          completionCheckIntervalRef.current = null;
        }
      };
    } else {
      // Clear interval if conditions aren't met
      if (completionCheckIntervalRef.current) {
        clearInterval(completionCheckIntervalRef.current);
        completionCheckIntervalRef.current = null;
      }
    }
  }, [currentOptimization, queryClient]);

  const failOptimization = useCallback((error: string) => {
    if (!currentOptimization) {
      // No optimization in progress, but still show error toast
      toast({
        title: "Optimization Failed",
        description: error,
        variant: "destructive",
        duration: 10000,
      });
      return;
    }
    
    // Capture data before clearing
    const wasModalClosed = currentOptimization.modalClosed;
    
    // Dismiss the "optimizing" toast if it was shown
    if (optimizingToastId) {
      dismiss(optimizingToastId);
    }
    
    // Update state - safely spread only if currentOptimization exists
    setCurrentOptimization(prev => {
      if (!prev) return null;
      return {
        ...prev,
        status: "error",
        error,
      };
    });
    
    // Only show error notification if modal was closed
    if (wasModalClosed) {
      toast({
        title: "Optimization Failed",
        description: error,
        variant: "destructive",
        duration: 10000,
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

  const showResultModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const handleModalClose = useCallback((open: boolean) => {
    setShowModal(open);
    // Only clear optimization state when modal is actually closed
    if (!open) {
      // Small delay to allow modal close animation
      setTimeout(() => {
        setCurrentOptimization(null);
        hasCompletedRef.current = false;
        // Clear polling interval
        if (completionCheckIntervalRef.current) {
          clearInterval(completionCheckIntervalRef.current);
          completionCheckIntervalRef.current = null;
        }
      }, 200);
    }
  }, []);


  return (
    <OptimizationContext.Provider
      value={{
        currentOptimization,
        startOptimization,
        notifyModalClosed,
        completeOptimization,
        failOptimization,
        clearOptimization,
        showResultModal,
      }}
    >
      {children}
      
      {/* Global OptimizedResumeModal for background optimization */}
      {/* Show modal if optimization is completed and we have valid result data */}
      {currentOptimization?.status === "completed" && 
       currentOptimization?.resultData && 
       currentOptimization.resultData.job && 
       currentOptimization.resultData.originalResume && 
       currentOptimization.resultData.optimizedResume && (
        <OptimizedResumeModal
          open={showModal}
          onOpenChange={handleModalClose}
          result={currentOptimization.resultData}
        />
      )}
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


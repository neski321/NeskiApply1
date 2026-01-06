import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, MoreVertical, Download, Plus, FileUp, Edit, Trash2, Sparkles, Calendar, TrendingUp, TrendingDown, CheckCircle2, File } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getResumes, createResume, updateResume, deleteResume, uploadResumeFile, getOptimizedResumes, deleteOptimizedResume, downloadOptimizedResume, getResume, type SavedOptimizedResume } from "@/lib/api";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Resume } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLocation } from "wouter";

export default function Resumes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingResume, setEditingResume] = useState<Resume | null>(null);
  const [deletingResume, setDeletingResume] = useState<Resume | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("resumes");

  // Check URL params for tab and highlightId
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const highlightParam = params.get("highlightId");
    
    if (tabParam === "optimized") {
      setActiveTab("optimized");
    }
    
    if (highlightParam) {
      const id = parseInt(highlightParam, 10);
      if (!isNaN(id)) {
        setHighlightId(id);
        // Clear URL params after reading them
        const newParams = new URLSearchParams(params);
        newParams.delete("tab");
        newParams.delete("highlightId");
        const newSearch = newParams.toString();
        setLocation(`/resumes${newSearch ? `?${newSearch}` : ""}`, { replace: true });
      }
    }
  }, [location, setLocation]);
  const [formData, setFormData] = useState({
    name: "",
    fileName: "",
    skills: "",
    experience: "",
    education: "",
    rawContent: ""
  });

  const { data: resumes = [], isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: getResumes,
  });

  const { data: optimizedResumes = [], isLoading: isLoadingOptimized } = useQuery({
    queryKey: ["optimizedResumes"],
    queryFn: getOptimizedResumes,
  });

  const deleteOptimizedMutation = useMutation({
    mutationFn: deleteOptimizedResume,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["optimizedResumes"] });
      toast({
        title: "Optimized resume deleted",
        description: "The optimized resume has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: createResume,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      setIsDialogOpen(false);
      setEditingResume(null);
      setFormData({ name: "", fileName: "", skills: "", experience: "", education: "", rawContent: "" });
      toast({
        title: "Resume created",
        description: "Your resume has been added successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateResume(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      setIsDialogOpen(false);
      setEditingResume(null);
      setFormData({ name: "", fileName: "", skills: "", experience: "", education: "", rawContent: "" });
      toast({
        title: "Resume updated",
        description: "Your resume has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteResume,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      setDeletingResume(null);
      toast({
        title: "Resume deleted",
        description: "Your resume has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => uploadResumeFile(file, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      setIsDialogOpen(false);
      setUploadFile(null);
      setFormData({ name: "", fileName: "", skills: "", experience: "", education: "", rawContent: "" });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      toast({
        title: "Resume uploaded",
        description: "Your resume has been uploaded and parsed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast({
        title: "No file selected",
        description: "Please select a resume file to upload.",
        variant: "destructive",
      });
      return;
    }
    if (!formData.name) {
      toast({
        title: "Name required",
        description: "Please enter a name for this resume.",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate({ file: uploadFile, name: formData.name });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const resumeData = {
      name: formData.name,
      fileName: formData.fileName || `${formData.name}.txt`,
      skills: formData.skills.split(",").map(s => s.trim()),
      experience: formData.experience,
      education: formData.education || "",
      rawContent: formData.rawContent,
    };

    if (editingResume) {
      updateMutation.mutate({ id: editingResume.id, data: resumeData });
    } else {
      createMutation.mutate(resumeData);
    }
  };

  const handleEdit = (resume: Resume) => {
    setEditingResume(resume);
    setFormData({
      name: resume.name,
      fileName: resume.fileName,
      skills: resume.skills.join(", "),
      experience: resume.experience,
      education: resume.education || "",
      rawContent: resume.rawContent,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (resume: Resume) => {
    setDeletingResume(resume);
  };

  const confirmDelete = () => {
    if (deletingResume) {
      deleteMutation.mutate(deletingResume.id);
    }
  };

  const [viewingResume, setViewingResume] = useState<Resume | null>(null);

  const handleView = (resume: Resume) => {
    setViewingResume(resume);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
             <h1 className="text-2xl font-bold">Resume Management</h1>
             <p className="text-muted-foreground mt-1">
               Manage your tailored resumes used for matching.
             </p>
          </div>
        </div>

        <div className="flex items-center justify-end mb-4">
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingResume(null);
              setFormData({ name: "", fileName: "", skills: "", experience: "", education: "", rawContent: "" });
              setUploadFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Resume
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingResume ? "Edit Resume" : "Add New Resume"}</DialogTitle>
                <DialogDescription>
                  {editingResume ? "Update your resume information." : "Upload a resume file or create one manually."}
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="upload" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload File</TabsTrigger>
                  <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-4">
                  <form onSubmit={handleFileUpload} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Resume Name *</Label>
                      <Input
                        required
                        placeholder="e.g., Backend Focused"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Resume File *</Label>
                      <div className="flex items-center gap-4">
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept=".docx,.doc,.txt"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setUploadFile(file);
                              if (!formData.name) {
                                setFormData({ ...formData, name: file.name.replace(/\.[^/.]+$/, "") });
                              }
                            }
                          }}
                          className="cursor-pointer"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Supported formats: DOCX, DOC, TXT (Max 10MB)
                      </p>
                      {uploadFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                          <FileUp className="h-4 w-4 text-primary" />
                          <span className="text-sm">{uploadFile.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(uploadFile.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={uploadMutation.isPending || !uploadFile}>
                        {uploadMutation.isPending ? (
                          <>
                            <Upload className="h-4 w-4 mr-2 animate-spin" />
                            Uploading & Parsing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Resume
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
                
                <TabsContent value="manual" className="space-y-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Resume Name *</Label>
                  <Input
                    required
                    placeholder="e.g., Backend Focused"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Skills (comma separated) *</Label>
                  <Input
                    required
                    placeholder="e.g., Python, FastAPI, Docker, AWS, RabbitMQ"
                    value={formData.skills}
                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Experience Summary *</Label>
                  <Textarea
                    required
                    placeholder="Paste your experience section from your resume here (e.g., job titles, companies, dates, responsibilities)..."
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    className="min-h-[100px] font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    You can copy-paste your entire experience section from your resume. This helps the AI better match your background to job requirements.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Education</Label>
                  <Input
                    placeholder="e.g., BTech Software Development, Seneca College"
                    value={formData.education}
                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Resume Content *</Label>
                  <Textarea
                    required
                    placeholder="Paste your full resume text here..."
                    className="min-h-[200px] font-mono text-xs"
                    value={formData.rawContent}
                    onChange={(e) => setFormData({ ...formData, rawContent: e.target.value })}
                  />
                </div>
                
                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                        {createMutation.isPending || updateMutation.isPending 
                          ? (editingResume ? "Updating..." : "Creating...") 
                          : (editingResume ? "Update Resume" : "Create Resume")}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="resumes">My Resumes</TabsTrigger>
            <TabsTrigger value="optimized">Optimized Resumes</TabsTrigger>
          </TabsList>

          <TabsContent value="resumes" className="mt-6">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading resumes...</div>
            ) : resumes.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No resumes yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  Add your first resume to start matching with jobs and analyzing ATS compatibility.
                </p>
                <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Add Your First Resume
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {resumes.map((resume) => (
              <Card key={resume.id} className="bg-card/50 border-border/50 hover:border-primary/50 transition-colors group">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <FileText className="h-6 w-6" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(resume)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(resume)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <CardTitle className="text-lg mb-1">{resume.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Updated: {new Date(resume.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-xs font-mono uppercase text-muted-foreground font-bold tracking-wider">Key Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {resume.skills.slice(0, 4).map(skill => (
                        <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                          {skill}
                        </Badge>
                      ))}
                      {resume.skills.length > 4 && (
                         <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 opacity-50">
                          +{resume.skills.length - 4}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-border/50 flex justify-between items-center">
                     <span className="text-xs font-medium text-emerald-500">Active for Matching</span>
                     <Button 
                       variant="ghost" 
                       size="sm" 
                       className="h-7 text-xs gap-1"
                       onClick={() => handleView(resume)}
                     >
                       <Download className="h-3 w-3" /> View
                     </Button>
                  </div>
                </CardContent>
              </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="optimized" className="mt-6">
            {isLoadingOptimized ? (
              <div className="text-center py-12 text-muted-foreground">Loading optimized resumes...</div>
            ) : optimizedResumes.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No optimized resumes yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  Optimize a resume for a job to see it here. You can download optimized resumes anytime.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {optimizedResumes.map((optimized) => (
                  <OptimizedResumeCard
                    key={optimized.id}
                    optimized={optimized}
                    onDelete={() => deleteOptimizedMutation.mutate(optimized.id)}
                    isDeleting={deleteOptimizedMutation.isPending}
                    shouldHighlight={highlightId === optimized.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingResume} onOpenChange={(open) => !open && setDeletingResume(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resume</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingResume?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Resume Dialog */}
      <Dialog open={!!viewingResume} onOpenChange={(open) => !open && setViewingResume(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingResume?.name}</DialogTitle>
            <DialogDescription>
              Resume details and full content
            </DialogDescription>
          </DialogHeader>
          
          {viewingResume && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">File Name</Label>
                  <p className="text-sm text-muted-foreground">{viewingResume.fileName}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Experience</Label>
                  <div className="p-3 bg-muted/30 rounded-md border border-border/50 max-h-[300px] overflow-y-auto">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {viewingResume.experience}
                    </p>
                  </div>
                </div>
                {viewingResume.education && (
                  <div className="space-y-2 col-span-1 md:col-span-2">
                    <Label className="text-sm font-semibold">Education</Label>
                    <p className="text-sm text-muted-foreground">{viewingResume.education}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Skills</Label>
                <div className="flex flex-wrap gap-2">
                  {viewingResume.skills.map(skill => (
                    <Badge key={skill} variant="secondary" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Full Resume Content</Label>
                <div className="p-4 bg-muted/50 rounded-md border border-border/50">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-[400px] overflow-y-auto">
                    {viewingResume.rawContent}
                  </pre>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
                <span>Created: {new Date(viewingResume.createdAt).toLocaleString()}</span>
                <span>Updated: {new Date(viewingResume.updatedAt).toLocaleString()}</span>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setViewingResume(null)}>
                  Close
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    handleEdit(viewingResume);
                    setViewingResume(null);
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Resume
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function OptimizedResumeCard({ 
  optimized, 
  onDelete, 
  isDeleting,
  shouldHighlight = false
}: { 
  optimized: SavedOptimizedResume; 
  onDelete: () => void;
  isDeleting: boolean;
  shouldHighlight?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const flashCountRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle flashing effect - 5 flashes
  useEffect(() => {
    if (shouldHighlight && flashCountRef.current === 0) {
      // Scroll into view when highlighting starts
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);

      // Start flashing
      const flashInterval = setInterval(() => {
        setIsFlashing(prev => {
          if (!prev) {
            flashCountRef.current += 1;
            if (flashCountRef.current >= 5) {
              clearInterval(flashInterval);
              return false;
            }
          }
          return !prev;
        });
      }, 300); // Flash every 300ms

      return () => clearInterval(flashInterval);
    }
  }, [shouldHighlight]);

  return (
    <>
      <Card 
        ref={cardRef}
        className={`bg-card/50 border-border/50 hover:border-primary/50 transition-all group ${
          isFlashing ? "ring-4 ring-primary ring-offset-2 shadow-lg scale-[1.02]" : ""
        }`}
      >
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowModal(true)}>
                <FileText className="h-4 w-4 mr-2" />
                View & Download
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h3 className="font-semibold text-base mb-1">
              {optimized.job ? `${optimized.job.title} - ${optimized.job.company}` : "Loading job..."}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <FileText className="h-3 w-3" />
              <span>From: {optimized.originalResume?.name || "Unknown Resume"}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {format(new Date(optimized.createdAt), "MMM d, yyyy")}
            </div>
          </div>
          
          <div className="flex items-center gap-4 pt-2 border-t">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Original</div>
              <div className="text-sm font-semibold">{optimized.originalScore}/100</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Optimized</div>
              <div className={`text-sm font-semibold flex items-center gap-1 justify-center ${
                optimized.improved ? "text-emerald-600" : "text-amber-600"
              }`}>
                {optimized.newScore}/100
                {optimized.improved ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Change</div>
              <div className={`text-sm font-semibold ${
                optimized.scoreImprovement > 0 
                  ? "text-emerald-600" 
                  : optimized.scoreImprovement < 0
                  ? "text-red-600"
                  : "text-muted-foreground"
              }`}>
                {optimized.scoreImprovement > 0 ? "+" : ""}
                {optimized.scoreImprovement}
              </div>
            </div>
          </div>

          <Button 
            onClick={() => setShowModal(true)} 
            className="w-full gap-2" 
            variant="outline"
          >
            <Download className="h-4 w-4" />
            View & Download
          </Button>
        </CardContent>
      </Card>

      {showModal && (
        <OptimizedResumeViewModal
          optimized={optimized}
          open={showModal}
          onOpenChange={setShowModal}
        />
      )}
    </>
  );
}

function OptimizedResumeViewModal({
  optimized,
  open,
  onOpenChange,
}: {
  optimized: SavedOptimizedResume;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isChangesOpen, setIsChangesOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();
  
  // Fetch the original resume for comparison
  const { data: originalResume, isLoading: isLoadingOriginal } = useQuery({
    queryKey: ["resume", optimized.originalResumeId],
    queryFn: () => getResume(optimized.originalResumeId),
    enabled: open && !!optimized.originalResumeId,
  });

  const handleDownload = async (format: "pdf" | "docx" = "pdf") => {
    setIsDownloading(true);
    try {
      await downloadOptimizedResume(optimized.id, format);
      toast({
        title: "Download started",
        description: `Your optimized resume is being downloaded as ${format.toUpperCase()}.`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Failed to download resume",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const optimizedResumeData = {
    professionalSummary: optimized.professionalSummary,
    technicalSkills: optimized.technicalSkills,
    education: optimized.education || "",
    relevantExperience: optimized.relevantExperience,
    projects: optimized.projects || [],
    changes: optimized.changes,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-[calc(100vw-4rem)] md:w-full p-3 sm:p-6">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg sm:text-xl md:text-2xl break-words">Saved Optimized Resume</DialogTitle>
              <DialogDescription className="sr-only">
                View your optimized resume for {optimized.job ? `${optimized.job.title} at ${optimized.job.company}` : "this job"}
              </DialogDescription>
              <div className="mt-2 space-y-1 min-w-0">
                <div className="text-xs sm:text-sm break-words">
                  <span className="font-medium">Job:</span> {optimized.job ? `${optimized.job.title} at ${optimized.job.company}` : "Loading..."}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate min-w-0">
                    <span className="font-medium">Original Resume:</span> {optimized.originalResume?.name || "Unknown Resume"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    Optimized on {format(new Date(optimized.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
              </div>
            </div>
            <Badge variant="secondary" className="self-start sm:self-auto">
              {Array.isArray(optimized.changes) ? optimized.changes.length : 0} changes
            </Badge>
          </div>
        </DialogHeader>

        <div className="mt-4 sm:mt-6 min-w-0 overflow-hidden">
          <Tabs defaultValue="comparison" className="w-full min-w-0">
            <TabsList className="flex flex-col sm:flex-row w-full sm:w-auto h-auto sm:h-9 bg-muted/50 sm:bg-muted gap-1 sm:gap-0">
              <TabsTrigger value="comparison" className="text-xs sm:text-sm px-3 sm:px-4 py-2 w-full sm:w-auto justify-start sm:justify-center">
                Side-by-Side Comparison
              </TabsTrigger>
              <TabsTrigger value="resume" className="text-xs sm:text-sm px-3 sm:px-4 py-2 w-full sm:w-auto justify-start sm:justify-center">
                Optimized Resume
              </TabsTrigger>
              <TabsTrigger value="scores" className="text-xs sm:text-sm px-3 sm:px-4 py-2 w-full sm:w-auto justify-start sm:justify-center">
                Score Comparison
              </TabsTrigger>
            </TabsList>

            <TabsContent value="comparison" className="mt-4 sm:mt-6">
                {isLoadingOriginal ? (
                  <div className="text-center py-12 text-muted-foreground">Loading original resume...</div>
                ) : !originalResume ? (
                  <div className="text-center py-12 text-muted-foreground">Original resume not found</div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 min-w-0">
                    {/* Original Resume */}
                    <div className="space-y-4 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <h3 className="font-semibold text-sm sm:text-base">Original Resume</h3>
                      </div>
                      <ScrollArea className="h-[400px] sm:h-[500px] md:h-[600px] rounded-lg border bg-muted/30 p-3 sm:p-4 w-full">
                        <div className="max-w-full overflow-hidden">
                          <ResumeView resume={originalResume} />
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Optimized Resume */}
                    <div className="space-y-4 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                        <h3 className="font-semibold text-sm sm:text-base">Optimized Resume</h3>
                      </div>
                      <ScrollArea className="h-[400px] sm:h-[500px] md:h-[600px] rounded-lg border bg-primary/5 p-3 sm:p-4 w-full">
                        <div className="max-w-full overflow-hidden">
                          <OptimizedResumeView optimized={optimizedResumeData} />
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}
            </TabsContent>

            <TabsContent value="resume" className="mt-4 sm:mt-6 min-w-0 overflow-hidden">
              <ScrollArea className="h-[400px] sm:h-[500px] md:h-[600px] rounded-lg border bg-primary/5 p-3 sm:p-4 w-full">
                <div className="max-w-full overflow-hidden">
                  <OptimizedResumeView optimized={optimizedResumeData} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="scores" className="mt-4 sm:mt-6">
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      ATS Score Comparison
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                      <div className="text-center">
                        <div className="text-xs sm:text-sm text-muted-foreground mb-1">Original Score</div>
                        <div className="text-xl sm:text-2xl font-bold">{optimized.originalScore}/100</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs sm:text-sm text-muted-foreground mb-1">New Score</div>
                        <div className={`text-xl sm:text-2xl font-bold flex items-center justify-center gap-1 ${
                          optimized.improved ? "text-emerald-600" : "text-amber-600"
                        }`}>
                          {optimized.newScore}/100
                          {optimized.improved ? (
                            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                          ) : (
                            <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5" />
                          )}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs sm:text-sm text-muted-foreground mb-1">Change</div>
                        <div className={`text-xl sm:text-2xl font-bold ${
                          optimized.scoreImprovement > 0 
                            ? "text-emerald-600" 
                            : optimized.scoreImprovement < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }`}>
                          {optimized.scoreImprovement > 0 ? "+" : ""}
                          {optimized.scoreImprovement}
                        </div>
                      </div>
                    </div>
                    
                    {!optimized.improved && (
                      <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 break-words">
                          <strong>Note:</strong> The optimized resume did not achieve a higher ATS score than the original. 
                          This may indicate that the resume is already well-optimized for this position, or that manual tweaking is needed.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
            </TabsContent>
          </Tabs>

          {/* Changes Made Section - Collapsible */}
          {Array.isArray(optimized.changes) && optimized.changes.length > 0 && (
            <>
              <Separator className="my-6" />
              <Collapsible open={isChangesOpen} onOpenChange={setIsChangesOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                    <h3 className="font-semibold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Summary of Changes ({optimized.changes.length})
                    </h3>
                    {isChangesOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <div className="space-y-2">
                    {optimized.changes.map((change: any, index: number) => (
                      <div key={index} className="rounded-lg border p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                          <div className="flex-1">
                            <div className="font-medium">{change.section}</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {change.description}
                            </div>
                            <Badge variant="outline" className="mt-2">
                              {change.type?.replace(/_/g, " ") || "Change"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          <Separator className="my-6" />

          <div className="flex gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  size="lg" 
                  className="flex-1"
                  disabled={isDownloading}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isDownloading ? "Downloading..." : "Download Resume"}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem 
                  onClick={() => handleDownload("pdf")}
                  disabled={isDownloading}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Download as PDF
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleDownload("docx")}
                  disabled={isDownloading}
                >
                  <File className="mr-2 h-4 w-4" />
                  Download as Word
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResumeView({ resume }: { resume: Resume }) {
  return (
    <div className="space-y-4 text-sm max-w-full overflow-hidden">
      <div className="min-w-0">
        <h4 className="font-semibold mb-2">Professional Summary</h4>
        <p className="text-muted-foreground whitespace-pre-wrap break-words overflow-wrap-anywhere">
          {resume.experience || "Not provided"}
        </p>
      </div>

      <div className="min-w-0">
        <h4 className="font-semibold mb-2">Technical Skills</h4>
        {resume.technicalSkillsSection ? (
          <div className="bg-muted/50 rounded-lg p-2 sm:p-3 border max-w-full overflow-hidden">
            <pre className="text-xs sm:text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed font-sans max-w-full">
              {resume.technicalSkillsSection}
            </pre>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {resume.skills.map((skill: string, index: number) => (
              <Badge key={`${skill}-${index}`} variant="secondary" className="break-words max-w-full">
                {skill}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h4 className="font-semibold mb-2">Education</h4>
        <p className="text-muted-foreground whitespace-pre-wrap break-words overflow-wrap-anywhere">
          {resume.education || "Not provided"}
        </p>
      </div>

      <div className="min-w-0">
        <h4 className="font-semibold mb-2">Experience</h4>
        <p className="text-muted-foreground whitespace-pre-wrap break-words overflow-wrap-anywhere text-xs">
          {resume.rawContent.substring(0, 1000)}...
        </p>
      </div>
    </div>
  );
}

function OptimizedResumeView({ optimized }: { optimized: any }) {
  return (
    <div className="space-y-4 text-sm max-w-full overflow-hidden">
      <div className="min-w-0">
        <h4 className="font-semibold mb-2">Professional Summary</h4>
        <p className="text-muted-foreground whitespace-pre-wrap break-words overflow-wrap-anywhere">
          {optimized.professionalSummary}
        </p>
      </div>

      <div className="min-w-0">
        <h4 className="font-semibold mb-2">Technical Skills</h4>
        {typeof optimized.technicalSkills === 'string' ? (
          <div className="bg-muted/50 rounded-lg p-2 sm:p-3 border max-w-full overflow-hidden">
            <pre className="text-xs sm:text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed font-sans max-w-full">
              {optimized.technicalSkills}
            </pre>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {optimized.technicalSkills.map((skill: string, index: number) => (
              <Badge key={`opt-skill-${skill}-${index}`} variant="secondary" className="break-words max-w-full">
                {skill}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h4 className="font-semibold mb-2">Education</h4>
        <p className="text-muted-foreground whitespace-pre-wrap break-words overflow-wrap-anywhere">
          {optimized.education || "Not provided"}
        </p>
      </div>

      <div className="min-w-0">
        <h4 className="font-semibold mb-2">Relevant Experience</h4>
        <div className="space-y-3">
          {Array.isArray(optimized.relevantExperience) && optimized.relevantExperience.map((exp: any, index: number) => (
            <div key={`exp-${exp.title}-${exp.company}-${index}`} className="border-l-2 border-primary/20 pl-3 min-w-0">
              <div className="font-medium break-words">{exp.title}</div>
              <div className="text-xs text-muted-foreground break-words">{exp.company}</div>
              <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                {exp.bullets?.map((bullet: string, bulletIndex: number) => (
                  <li key={`exp-${index}-bullet-${bulletIndex}`} className="break-words">{bullet}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {optimized.projects && Array.isArray(optimized.projects) && optimized.projects.length > 0 && (
        <div className="min-w-0">
          <h4 className="font-semibold mb-2">Projects</h4>
          <div className="space-y-3">
            {optimized.projects.map((project: any, index: number) => (
              <div key={`project-${project.name}-${index}`} className="border-l-2 border-primary/20 pl-3 min-w-0">
                <div className="font-medium break-words">{project.name}</div>
                <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-muted-foreground">
                  {project.bullets?.map((bullet: string, bulletIndex: number) => (
                    <li key={`project-${index}-bullet-${bulletIndex}`} className="break-words">{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

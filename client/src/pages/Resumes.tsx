import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, MoreVertical, Download, Plus, FileUp, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getResumes, createResume, updateResume, deleteResume, uploadResumeFile } from "@/lib/api";
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
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Resume } from "@shared/schema";

export default function Resumes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingResume, setEditingResume] = useState<Resume | null>(null);
  const [deletingResume, setDeletingResume] = useState<Resume | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
                          accept=".pdf,.docx,.doc,.txt"
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
                        Supported formats: PDF, DOCX, DOC, TXT (Max 10MB)
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
                  <Input
                    required
                    placeholder="e.g., 2 years backend development"
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                  />
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">File Name</Label>
                  <p className="text-sm text-muted-foreground">{viewingResume.fileName}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Experience</Label>
                  <p className="text-sm text-muted-foreground">{viewingResume.experience}</p>
                </div>
                {viewingResume.education && (
                  <div className="space-y-2 col-span-2">
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

import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { getResumes } from "@/lib/api";
import { FileText, Code, GraduationCap, Briefcase, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ResumeParser() {
  const { data: resumes = [], isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: getResumes,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading resumes...</p>
        </div>
      </Layout>
    );
  }

  if (resumes.length === 0) {
    return (
      <Layout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No resumes found</p>
            <p className="text-sm text-muted-foreground mt-2">
              Upload a resume to see how it's parsed
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resume Parser View</h1>
          <p className="text-muted-foreground mt-2">
            View how your resumes are parsed and structured after upload
          </p>
        </div>

        <div className="grid gap-6">
          {resumes.map((resume) => (
            <Card key={resume.id} className="overflow-hidden">
              <CardHeader className="border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{resume.name}</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        {resume.fileName}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(resume.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <Tabs defaultValue="skills" className="w-full">
                  <TabsList className="w-full rounded-none border-b bg-muted/50">
                    <TabsTrigger value="skills" className="flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Skills ({resume.skills.length})
                    </TabsTrigger>
                    <TabsTrigger value="experience" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Experience
                    </TabsTrigger>
                    <TabsTrigger value="education" className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" />
                      Education
                    </TabsTrigger>
                    <TabsTrigger value="raw" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Raw Content
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="skills" className="p-6 m-0">
                    <div className="space-y-6">
                      {/* Technical Skills Section with Original Formatting */}
                      {resume.technicalSkillsSection ? (
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground mb-3">
                            Technical Skills Section (Original Format)
                          </h3>
                          <div className="bg-muted/50 rounded-lg p-4 border">
                            <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
                              {resume.technicalSkillsSection}
                            </pre>
                          </div>
                        </div>
                      ) : null}
                      
                      {/* Extracted Skills as Array (for backward compatibility) */}
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">
                          Extracted Skills Array ({resume.skills.length} total)
                          {resume.technicalSkillsSection && (
                            <span className="text-xs text-muted-foreground ml-2">
                              (Also see formatted section above)
                            </span>
                          )}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {resume.skills.length > 0 ? (
                            resume.skills.map((skill, index) => (
                              <Badge key={`parser-skill-${skill}-${index}`} variant="secondary" className="text-sm py-1 px-2.5">
                                {skill}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No skills extracted</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="experience" className="p-6 m-0">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">
                          Extracted Experience
                        </h3>
                        <div className="bg-muted/50 rounded-lg p-4">
                          {resume.experience ? (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                              {resume.experience}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              No experience information extracted
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="education" className="p-6 m-0">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">
                          Extracted Education
                        </h3>
                        <div className="bg-muted/50 rounded-lg p-4">
                          {resume.education ? (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                              {resume.education}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              No education information extracted
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="raw" className="p-6 m-0">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">
                          Raw Extracted Text
                        </h3>
                        <ScrollArea className="h-[500px] w-full rounded-lg border bg-muted/50 p-4">
                          <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
                            {resume.rawContent}
                          </pre>
                        </ScrollArea>
                        <p className="text-xs text-muted-foreground mt-2">
                          Character count: {resume.rawContent.length.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}


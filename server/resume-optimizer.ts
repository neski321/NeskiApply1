import { callAIWithFallback } from "./ai-service";
import { storage } from "./storage";
import type { Resume, Job, ATSAnalysis } from "@shared/schema";

export interface OptimizedResume {
  professionalSummary: string;
  technicalSkills: string | string[]; // Can be formatted string or array for backward compatibility
  education: string;
  relevantExperience: Array<{
    title: string;
    company: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    bullets: string[];
  }>;
  changes: Array<{
    section: string;
    type: "summary_rewritten" | "bullets_reordered" | "content_restructured" | "keywords_added";
    description: string;
  }>;
}

export interface OptimizedResumeAnalysis {
  originalScore: number;
  newScore: number;
  scoreImprovement: number;
  improved: boolean;
  analysis: ATSAnalysis | null;
}

/**
 * Run ATS analysis on optimized resume and compare with original
 */
export async function analyzeOptimizedResume(
  originalResume: Resume,
  optimizedResume: OptimizedResume,
  job: Job,
  originalScore: number,
  userId: string
): Promise<OptimizedResumeAnalysis> {
  try {
    // Check if Perplexity API key is configured (required for ATS analysis)
    const perplexityKey = await storage.getSetting("perplexity_api_key", userId);
    if (!perplexityKey || !perplexityKey.value) {
      throw new Error("Perplexity API key is required for ATS analysis");
    }

    // Convert optimized resume to a format that can be analyzed
    // Create a temporary resume-like object with optimized content
    const technicalSkillsText = typeof optimizedResume.technicalSkills === 'string' 
      ? optimizedResume.technicalSkills 
      : optimizedResume.technicalSkills.join(", ");
    
    const optimizedResumeContent = `
Professional Summary:
${optimizedResume.professionalSummary || "Not provided"}

Technical Skills:
${technicalSkillsText}

Education:
${optimizedResume.education || "Not provided"}

Relevant Experience:
${Array.isArray(optimizedResume.relevantExperience) && optimizedResume.relevantExperience.length > 0 
  ? optimizedResume.relevantExperience.map(exp => 
      exp && exp.title && exp.company && Array.isArray(exp.bullets)
        ? `${exp.title} at ${exp.company}\n${exp.bullets.map(b => `  • ${b}`).join("\n")}`
        : ""
    ).filter(Boolean).join("\n\n")
  : "Not provided"}

${optimizedResume.projects && Array.isArray(optimizedResume.projects) && optimizedResume.projects.length > 0 ? `
Projects:
${optimizedResume.projects.map(proj => 
  proj && proj.name && Array.isArray(proj.bullets)
    ? `${proj.name}\n${proj.bullets.map(b => `  • ${b}`).join("\n")}`
    : ""
).filter(Boolean).join("\n\n")}` : ""}
`;

    // Get all resumes to include in comparison
    const allResumes = await storage.getResumes(userId);

    // Prepare messages for ATS analysis
    const messages = [
      {
        role: "system" as const,
        content: `
      You are an ATS + job-fit evaluation engine.
      
      You must analyze a job listing against multiple resumes and produce:
      - a weighted 0–100 match score,
      - the best resume ID,
      - missing keywords for the best resume,
      - actionable resume improvement suggestions.
      
      Scoring priorities (highest → lowest):
      1) Skills matching (dominant)
      2) Full-time status
      3) Date posted (recency)
      4) Lower experience required
      5) Pay rate
      6) Company & location
      
      Weights (total 100):
      - skills_match: 45
      - full_time_status: 20
      - date_posted: 15
      - experience_requirement: 10
      - pay_rate: 5
      - company_location: 5
      
      Rules:
      - Do not infer missing details. If missing/unclear, treat as "unknown" and score conservatively.
      - Skills matching is dominant:
        - If skills_match < 20/45, cap overall score at 49.
      - Recency cannot override a skills mismatch.
      - Deduct points for missing, unclear, or mismatched information.
      - Be consistent and repeatable.
      - Output JSON only, exactly matching the user-requested schema.
      `
      },
      {
        role: "user" as const,
        content: `Analyze this job listing against the following resumes and provide:
      1. Which resume is the best match (provide ID and match score 0-100)
      2. Missing keywords from the best resume
      3. Specific actionable suggestions to improve the resume
      4. Match scores for all resumes
      
      Scoring must follow the weighted criteria:
      - skills_match (45), full_time_status (20), date_posted (15), experience_requirement (10), pay_rate (5), company_location (5)
      
      Rules:
      - Do not infer missing details (treat as "unknown")
      - If skills_match < 20/45, cap total score at 49
      - Be consistent and repeatable
      
      Job Listing:
      Title: ${job.title}
      Company: ${job.company}
      Location: ${job.location}
      Description: ${job.description.substring(0, 2000)}${job.description.length > 2000 ? "..." : ""}
      ${job.requirements ? `Requirements: ${job.requirements.join(", ")}` : ""}
      
      Resumes:
      ${allResumes.map(r => 
        `ID: ${r.id}, Name: ${r.name}, Skills: ${r.skills.join(", ")}, Experience: ${r.experience}, Content: ${r.rawContent.substring(0, 1000)}`
      ).join("\n\n")}
      
      OPTIMIZED RESUME (ID: ${originalResume.id}):
      Name: ${originalResume.name} (Optimized), Skills: ${typeof optimizedResume.technicalSkills === 'string' ? optimizedResume.technicalSkills : optimizedResume.technicalSkills.join(", ")}, Content: ${optimizedResumeContent.substring(0, 2000)}
      
      Return your response as JSON in this exact format:
      {
        "bestResumeId": <number>,
        "matchScore": <number 0-100>,
        "missingKeywords": ["keyword1", "keyword2"],
        "suggestions": [
          { "title": "Suggestion title", "description": "Detailed suggestion", "type": "content" }
        ],
        "resumeComparisons": [
          { "resumeId": <number>, "resumeName": "Name", "score": <number> }
        ]
      }
      
      Note: The optimized resume should be evaluated as if it were resume ID ${originalResume.id}. If it's the best match, use that ID.
      `
      }
    ];

    // Call Perplexity for ATS analysis (as requested)
    const aiResult = await callAIWithFallback(messages, "sonar-pro", userId, "perplexity");

    if (!aiResult) {
      throw new Error("Failed to get response from Perplexity AI for ATS analysis");
    }

    // Parse the JSON response
    let analysisResult;
    try {
      const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
      analysisResult = JSON.parse(jsonMatch ? jsonMatch[0] : aiResult.content);
    } catch (parseError) {
      console.error("Failed to parse ATS analysis response:", aiResult.content);
      throw new Error("Failed to parse ATS analysis response");
    }

    // Find the score for the optimized resume
    // The optimized resume should be evaluated as the original resume ID
    // Check if it's the best match, or find it in comparisons
    let optimizedResumeScore = analysisResult.matchScore;
    
    if (analysisResult.bestResumeId === originalResume.id) {
      // Optimized resume is the best match
      optimizedResumeScore = analysisResult.matchScore;
    } else if (analysisResult.resumeComparisons && Array.isArray(analysisResult.resumeComparisons)) {
      // Find the score in comparisons
      const comparison = analysisResult.resumeComparisons.find(
        (comp: any) => comp.resumeId === originalResume.id
      );
      if (comparison) {
        optimizedResumeScore = comparison.score;
      }
    }

    const newScore = optimizedResumeScore;
    const scoreImprovement = newScore - originalScore;
    const improved = scoreImprovement > 0;

    // Save the new analysis to database
    // IMPORTANT: Do NOT set jobId here - this is an optimized resume analysis, not the original job analysis
    // The optimized analysis should only be linked via optimized_resumes.optimizedAnalysisId
    // This prevents it from replacing the original analysis when getATSAnalysisByJobId is called
    const savedAnalysis = await storage.createATSAnalysis({
      jobId: undefined, // Don't link to job - this is an optimized resume analysis
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: job.description,
      bestResumeId: analysisResult.bestResumeId,
      matchScore: analysisResult.matchScore,
      missingKeywords: analysisResult.missingKeywords || [],
      suggestions: analysisResult.suggestions || [],
      resumeComparisons: analysisResult.resumeComparisons || []
    }, userId);

    return {
      originalScore,
      newScore,
      scoreImprovement,
      improved,
      analysis: savedAnalysis,
    };
  } catch (error) {
    console.error("Error analyzing optimized resume:", error);
    throw error;
  }
}

/**
 * Optimize a resume for a specific job using Gemini AI
 * Uses existing ATS analysis results if available
 * Only restructures existing information, no new content added
 */
export async function optimizeResumeForJob(
  resume: Resume,
  job: Job,
  userId: string,
  atsAnalysis?: ATSAnalysis
): Promise<OptimizedResume> {
  // If no ATS analysis provided, try to find one for this job
  let analysis = atsAnalysis;
  if (!analysis && job.id) {
    analysis = await storage.getATSAnalysisByJobId(job.id, userId);
  }
  // Build ATS analysis context if available
  let atsContext = "";
  if (analysis && analysis.bestResumeId === resume.id) {
    const missingKeywords = analysis.missingKeywords || [];
    const suggestions = Array.isArray(analysis.suggestions) 
      ? analysis.suggestions 
      : typeof analysis.suggestions === 'object' && analysis.suggestions !== null
      ? Object.values(analysis.suggestions)
      : [];

    atsContext = `

EXISTING ATS ANALYSIS RESULTS (Use these to guide optimization):
Match Score: ${analysis.matchScore}/100
Missing Keywords: ${missingKeywords.length > 0 ? missingKeywords.join(", ") : "None identified"}
Suggestions from ATS Analysis:
${suggestions.length > 0 
  ? suggestions.map((s: any, i: number) => 
      typeof s === 'string' 
        ? `${i + 1}. ${s}`
        : s.title 
        ? `${i + 1}. ${s.title}: ${s.description || ''}`
        : `${i + 1}. ${JSON.stringify(s)}`
    ).join("\n")
  : "No specific suggestions provided"
}

CRITICAL: You must incorporate the missing keywords into the resume WHERE THEY NATURALLY FIT based on existing content.
For example, if "React" is missing but the resume mentions "JavaScript frontend development", you can rephrase to include "React" if the experience supports it.
However, NEVER add keywords that don't relate to existing skills or experiences.`;
  }

  const systemPrompt = `You are a professional resume optimizer. Your task is to optimize resumes for specific job applications by restructuring existing content to better match job requirements.

CRITICAL CONSTRAINTS:
1. NEVER add new information, skills, experiences, or achievements that are not in the original resume
   EXCEPTIONS: 
   a) You MAY add relevant technical skills from the job description to the Technical Skills section IF:
      - The skill is directly related to technologies/frameworks the candidate has used
      - The skill is a reasonable extension of their existing expertise
      - It fits naturally within the existing category structure
      - Example: If they know Django, you can add Flask; if they use AWS S3, you can add other AWS services like EC2, RDS
   b) You MAY add up to 2 bullet points PER job experience IF:
      - The bullets describe work that logically fits within that role's responsibilities
      - They leverage existing skills/technologies already demonstrated in the resume
      - They incorporate job-relevant keywords for ATS optimization
      - They are realistic accomplishments someone in that role with those skills could have achieved
      - Example: If they worked as a Backend Developer using Django and PostgreSQL, you can add a bullet about "Optimized database queries in PostgreSQL" or "Implemented caching strategies with Redis"
2. ONLY restructure, reorder, and rephrase existing content (except for adding related skills and experience bullets as noted above)
3. Professional Summary can be completely rewritten to match the job, but must ONLY use:
   - Skills, technologies, and experiences that exist in the original resume
   - Job titles that match the user's experience level (e.g., if job is "Associate Software Developer" and user has software development experience, you can use that title)
   - Must avoid any claims not supported by the resume content
4. Section order MUST be maintained: Professional Summary, Technical Skills, Education, Relevant Experience, Projects
5. Bullet points CAN be reordered within their respective sections to prioritize most relevant items
6. Formatting style must match the original resume's formatting
7. All original information must be preserved - nothing can be removed or fabricated
8. If ATS analysis is provided, prioritize incorporating missing keywords through natural rephrasing of existing content
9. When incorporating missing keywords, ensure they relate to existing skills/experiences - never fabricate new capabilities

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "professionalSummary": "Rewritten summary using only existing resume content, optimized for the job",
  "technicalSkills": "Formatted technical skills section preserving the EXACT structure from the original resume. This MUST include:\n- Category headings followed by colons (e.g., 'Programming Languages:', 'Backend Frameworks & Tools:')\n- Comma-separated lists of skills under each category\n- Line breaks between categories\n- The same formatting style as the original (if original had categories, keep categories; if it had bullet points, keep bullet points)\nExample format:\nProgramming Languages: Python, C/C++, JavaScript, C#, Kotlin\nBackend Frameworks & Tools: Laravel, React, Django, Flask\nCloud & Infrastructure: AWS (S3, RDS, EC2), Docker, Nginx\n\nPreserve ALL original formatting, line breaks, and structure.",
  "education": "Education section text (unchanged or slightly rephrased)",
  "relevantExperience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "bullets": ["bullet1", "bullet2", ...] // Reordered to prioritize job-relevant items
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "bullets": ["bullet1", "bullet2", ...] // Reordered if needed
    }
  ],
  "changes": [
    {
      "section": "Professional Summary",
      "type": "summary_rewritten",
      "description": "Brief description of what changed"
    }
  ]
}`;

  const userPrompt = `Optimize this resume for the following job:

JOB INFORMATION:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Description: ${job.description.substring(0, 2000)}${job.description.length > 2000 ? "..." : ""}
${job.requirements ? `Requirements: ${job.requirements.join(", ")}` : ""}${atsContext}

ORIGINAL RESUME:
Name: ${resume.name}
${resume.technicalSkillsSection 
  ? `Technical Skills Section (PRESERVE THIS FORMATTING AND LAYOUT):\n${resume.technicalSkillsSection}\n\nExtracted Skills Array: ${resume.skills.join(", ")}`
  : `Skills: ${resume.skills.join(", ")}`}
Experience: ${resume.experience}
Education: ${resume.education || "Not provided"}
Raw Content:
${resume.rawContent}

INSTRUCTIONS:
1. Rewrite the Professional Summary to match the job, using only information from the original resume${analysis ? " and incorporating missing keywords naturally" : ""}
2. Maintain all sections in order: Professional Summary, Technical Skills, Education, Relevant Experience, Projects
3. For Technical Skills: ${resume.technicalSkillsSection 
  ? `PRESERVE THE EXACT FORMATTING AND LAYOUT from the original resume shown above. 
     - Keep ALL category headings exactly as they appear (e.g., "Programming Languages:", "Backend Frameworks & Tools:")
     - Keep the comma-separated format for skills under each category
     - Preserve all line breaks between categories
     - Reorder skills within a category to prioritize those most relevant to the job
     - You MAY add relevant technical skills from the job description IF they are:
       * Directly related to existing skills (e.g., if they use React, adding Next.js is reasonable)
       * Logical extensions of demonstrated expertise (e.g., if they use Docker, adding Kubernetes is reasonable)
       * Fit naturally in an existing category without changing category names
     - Add skills thoughtfully and sparingly - only add 2-4 highly relevant skills maximum
     - Do NOT change the category names or structure
     - The output format should look EXACTLY like the original, just with potentially reordered and a few added skills`
  : "Format skills with category headings followed by colons, then comma-separated lists. Use line breaks between categories. You may add relevant skills from the job description. Example: 'Programming Languages: Python, JavaScript\nFrameworks: React, Django'"}
4. Reorder bullet points within experience and projects to prioritize items most relevant to the job
5. For each relevant experience entry, you MAY add up to 2 additional bullet points IF:
   - They logically fit the role's responsibilities based on the job title and existing bullets
   - They use technologies/skills already demonstrated elsewhere in the resume
   - They help incorporate job-relevant keywords for ATS optimization
   - They represent realistic accomplishments for that role
   - Maximum 2 bullets per experience entry - be selective and strategic
6. Keep all original information - only restructure, never add new content (except for related technical skills and strategic experience bullets as specified)
7. Extract and structure the experience and projects from the raw content
8. ${analysis ? "Incorporate missing keywords from ATS analysis through natural rephrasing of existing content where applicable. For technical skills and experience bullets, you may add related content if it fits the criteria above. " : "For technical skills and experience bullets, you may add related content if it fits the criteria above. "}List all changes made in the "changes" array
9. If you added technical skills, add a change entry with type "skills_added" explaining which skills were added and why they're relevant
10. If you added experience bullets, add a change entry with type "experience_bullets_added" explaining which bullets were added, to which roles, and why they're relevant

Return ONLY valid JSON, no markdown, no additional text.`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  // Get user's preference for resume optimization AI provider
  const providerSetting = await storage.getSetting("resume_optimization_provider", userId);
  const provider = (providerSetting?.value as "perplexity" | "openrouter" | "gemini") || "gemini"; // Default to Gemini
  
  // Use the user's preferred AI provider for resume optimization
  const aiResult = await callAIWithFallback(messages, "sonar-pro", userId, provider);

  if (!aiResult) {
    const providerName = provider === "perplexity" ? "Perplexity" : provider === "openrouter" ? "OpenRouter" : "Gemini";
    throw new Error(`Failed to get response from ${providerName} AI. Please check your API key and settings.`);
  }

  // Parse the JSON response
  let optimizedResume: OptimizedResume;
  try {
    // Try to extract JSON from the response (it might be wrapped in markdown)
    let jsonContent = aiResult.content.trim();
    
    // Remove markdown code blocks if present
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    
    // Extract JSON object
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }
    
    // Remove trailing commas before closing braces/brackets (common JSON error from AI)
    jsonContent = jsonContent.replace(/,(\s*[}\]])/g, "$1");
    
    optimizedResume = JSON.parse(jsonContent);
  } catch (parseError) {
    console.error("Failed to parse optimization response:", aiResult.content);
    throw new Error(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
  }

  // Validate the response structure
  if (!optimizedResume.professionalSummary || !optimizedResume.technicalSkills) {
    throw new Error("Invalid optimization response: missing required fields");
  }
  
  // Convert technicalSkills array to formatted string if needed (for backward compatibility)
  if (Array.isArray(optimizedResume.technicalSkills) && resume.technicalSkillsSection) {
    // If original had formatted section, try to preserve that format
    // Otherwise, join with commas and line breaks for readability
    optimizedResume.technicalSkills = optimizedResume.technicalSkills.join(", ");
  }

  return optimizedResume;
}

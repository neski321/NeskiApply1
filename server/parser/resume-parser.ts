import { readFile } from "fs/promises";
import path from "path";

// Dynamic imports for CommonJS modules (works in both ESM and CJS)
let pdfParse: any;
let mammoth: any;

// Lazy load modules to avoid issues with import.meta.url in CJS
async function loadPdfParse() {
  if (!pdfParse) {
    const pdfParseModule = await import("pdf-parse");
    // pdf-parse is a CommonJS module, it may export default or be the default export
    pdfParse = pdfParseModule.default || pdfParseModule;
  }
  return pdfParse;
}

async function loadMammoth() {
  if (!mammoth) {
    mammoth = await import("mammoth");
  }
  return mammoth;
}

export interface ParsedResume {
  rawContent: string;
  skills: string[];
  experience: string;
  education: string;
}

/**
 * Extract text from PDF file
 */
export async function parsePDF(filePath: string): Promise<string> {
  try {
    const pdfParseModule = await loadPdfParse();
    const dataBuffer = await readFile(filePath);
    const data = await pdfParseModule(dataBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Extract text from DOCX file
 */
export async function parseDOCX(filePath: string): Promise<string> {
  try {
    const mammothModule = await loadMammoth();
    const result = await mammothModule.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Parse resume file based on extension
 */
export async function parseResumeFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case ".pdf":
      return await parsePDF(filePath);
    case ".docx":
    case ".doc":
      return await parseDOCX(filePath);
    case ".txt":
      return await readFile(filePath, "utf-8");
    default:
      throw new Error(`Unsupported file type: ${ext}. Supported types: .pdf, .docx, .doc, .txt`);
  }
}

/**
 * Extract skills from resume text using common patterns
 */
export function extractSkills(text: string): string[] {
  const skills: string[] = [];
  const lowerText = text.toLowerCase();
  
  // Common technical skills to look for
  const skillKeywords = [
    // Languages
    "javascript", "typescript", "python", "java", "c++", "c#", "go", "rust", "php", "ruby", "swift", "kotlin",
    // Frontend
    "react", "vue", "angular", "next.js", "svelte", "html", "css", "sass", "tailwind", "bootstrap",
    // Backend
    "node.js", "express", "django", "flask", "fastapi", "laravel", "spring", "asp.net", "rails",
    // Databases
    "postgresql", "mysql", "mongodb", "redis", "sqlite", "oracle", "sql server",
    // Cloud & DevOps
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "jenkins", "ci/cd", "github actions",
    // Tools
    "git", "github", "gitlab", "jira", "confluence", "agile", "scrum", "rest api", "graphql",
    // Testing
    "jest", "mocha", "cypress", "selenium", "unit testing", "integration testing",
    // Other
    "rabbitmq", "kafka", "elasticsearch", "microservices", "oauth", "jwt"
  ];
  
  // Look for skills in text
  for (const skill of skillKeywords) {
    if (lowerText.includes(skill)) {
      // Capitalize properly
      const capitalized = skill.split(" ").map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(" ");
      if (!skills.includes(capitalized)) {
        skills.push(capitalized);
      }
    }
  }
  
  // Also look for "Skills:" or "Technical Skills:" sections
  const skillsSectionRegex = /(?:skills|technical skills|technologies|tools)[:\s]*\n?([^\n]+(?:\n[^\n]+)*)/i;
  const skillsMatch = text.match(skillsSectionRegex);
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    // Extract comma or bullet-separated skills
    const extracted = skillsText
      .split(/[,•\-\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 2 && s.length < 50)
      .slice(0, 20); // Limit to 20 skills
    
    extracted.forEach(skill => {
      if (!skills.includes(skill)) {
        skills.push(skill);
      }
    });
  }
  
  return skills.slice(0, 30); // Limit total skills
}

/**
 * Extract experience summary from resume text
 */
export function extractExperience(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Look for experience section
  const experienceRegex = /(?:experience|work experience|employment|professional experience)[:\s]*\n?([^\n]+(?:\n[^\n]+){0,10})/i;
  const expMatch = text.match(experienceRegex);
  
  if (expMatch) {
    const expText = expMatch[1].substring(0, 500); // Limit length
    return expText.trim();
  }
  
  // Fallback: look for years of experience
  const yearsMatch = text.match(/(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?experience/i);
  if (yearsMatch) {
    return `${yearsMatch[1]} years of experience`;
  }
  
  // Fallback: look for job titles
  const jobTitles = ["developer", "engineer", "programmer", "intern", "internship"];
  for (const title of jobTitles) {
    if (lowerText.includes(title)) {
      return `Experience in ${title} role`;
    }
  }
  
  return "Experience details not found";
}

/**
 * Extract education from resume text
 */
export function extractEducation(text: string): string {
  const educationRegex = /(?:education|academic|qualifications)[:\s]*\n?([^\n]+(?:\n[^\n]+){0,5})/i;
  const eduMatch = text.match(educationRegex);
  
  if (eduMatch) {
    return eduMatch[1].substring(0, 300).trim();
  }
  
  // Look for degree patterns
  const degreeRegex = /(?:bachelor|master|phd|doctorate|diploma|certificate|degree)[^\n]{0,100}/i;
  const degreeMatch = text.match(degreeRegex);
  if (degreeMatch) {
    return degreeMatch[0].trim();
  }
  
  return "";
}

/**
 * Parse resume file and extract structured data
 */
export async function parseResume(filePath: string, fileName: string): Promise<{
  rawContent: string;
  skills: string[];
  experience: string;
  education: string;
  fileName: string;
}> {
  // Parse file to get raw text
  const rawContent = await parseResumeFile(filePath);
  
  if (!rawContent || rawContent.trim().length === 0) {
    throw new Error("Resume file appears to be empty or could not be parsed");
  }
  
  // Extract structured data
  const skills = extractSkills(rawContent);
  const experience = extractExperience(rawContent);
  const education = extractEducation(rawContent);
  
  return {
    rawContent: rawContent.trim(),
    skills,
    experience,
    education,
    fileName,
  };
}


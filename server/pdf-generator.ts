import PDFDocument from "pdfkit";
import type { Readable } from "stream";

interface OptimizedResumeData {
  professionalSummary: string;
  technicalSkills: string;
  education: string;
  relevantExperience: Array<{
    title: string;
    company: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    bullets: string[];
  }> | null;
}

interface ResumeMetadata {
  jobTitle: string;
  jobCompany: string;
  originalResumeName: string;
  optimizedDate: Date;
}

/**
 * Generate a PDF from an optimized resume
 */
export function generateOptimizedResumePDF(
  resumeData: OptimizedResumeData,
  metadata: ResumeMetadata
): Readable {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: {
      top: 50,
      bottom: 50,
      left: 50,
      right: 50,
    },
  });

  // Colors
  const primaryColor = "#1e40af"; // blue-800
  const textColor = "#1f2937"; // gray-800
  const mutedColor = "#6b7280"; // gray-500

  let yPosition = doc.y;

  // Helper function to add section header
  const addSectionHeader = (title: string) => {
    if (yPosition > 700) {
      doc.addPage();
      yPosition = 50;
    }
    doc
      .fontSize(14)
      .fillColor(primaryColor)
      .font("Helvetica-Bold")
      .text(title.toUpperCase(), 50, yPosition);
    
    // Add underline
    doc
      .moveTo(50, yPosition + 18)
      .lineTo(562, yPosition + 18)
      .strokeColor(primaryColor)
      .lineWidth(1.5)
      .stroke();
    
    yPosition = doc.y + 10;
  };

  // Helper function to check if we need a new page
  const checkPageBreak = (requiredSpace: number = 100) => {
    if (yPosition + requiredSpace > 750) {
      doc.addPage();
      yPosition = 50;
      return true;
    }
    return false;
  };

  // Add metadata header (small, at top)
  doc
    .fontSize(8)
    .fillColor(mutedColor)
    .font("Helvetica")
    .text(`Optimized for: ${metadata.jobTitle} at ${metadata.jobCompany}`, 50, yPosition, {
      align: "right",
    });
  
  yPosition = doc.y + 20;

  // PROFESSIONAL SUMMARY
  addSectionHeader("Professional Summary");
  doc
    .fontSize(10)
    .fillColor(textColor)
    .font("Helvetica")
    .text(resumeData.professionalSummary, 50, yPosition, {
      align: "justify",
      lineGap: 2,
    });
  
  yPosition = doc.y + 15;

  // TECHNICAL SKILLS
  checkPageBreak(150);
  addSectionHeader("Technical Skills");
  
  // Check if skills are formatted (contains newlines or categories)
  if (resumeData.technicalSkills.includes("\n") || resumeData.technicalSkills.includes(":")) {
    // Preserve formatting for structured skills
    const skillLines = resumeData.technicalSkills.split("\n");
    skillLines.forEach((line) => {
      if (line.trim()) {
        // Check if it's a category header (contains colon)
        if (line.includes(":")) {
          const [category, skills] = line.split(":");
          doc
            .fontSize(10)
            .fillColor(textColor)
            .font("Helvetica-Bold")
            .text(category.trim() + ":", 50, yPosition, { continued: true })
            .font("Helvetica")
            .text(" " + skills.trim(), { lineGap: 2 });
        } else {
          doc
            .fontSize(10)
            .fillColor(textColor)
            .font("Helvetica")
            .text(line.trim(), 50, yPosition, { lineGap: 2 });
        }
        yPosition = doc.y + 3;
      }
    });
  } else {
    // Simple comma-separated skills
    doc
      .fontSize(10)
      .fillColor(textColor)
      .font("Helvetica")
      .text(resumeData.technicalSkills, 50, yPosition, {
        align: "justify",
        lineGap: 2,
      });
  }
  
  yPosition = doc.y + 15;

  // EDUCATION
  checkPageBreak(100);
  addSectionHeader("Education");
  doc
    .fontSize(10)
    .fillColor(textColor)
    .font("Helvetica")
    .text(resumeData.education, 50, yPosition, { lineGap: 2 });
  
  yPosition = doc.y + 15;

  // RELEVANT EXPERIENCE
  checkPageBreak(150);
  addSectionHeader("Relevant Experience");
  
  resumeData.relevantExperience.forEach((exp, index) => {
    checkPageBreak(120);
    
    // Job title and company
    doc
      .fontSize(11)
      .fillColor(textColor)
      .font("Helvetica-Bold")
      .text(exp.title, 50, yPosition);
    
    yPosition = doc.y + 2;
    
    doc
      .fontSize(10)
      .fillColor(mutedColor)
      .font("Helvetica-Oblique")
      .text(exp.company, 50, yPosition);
    
    yPosition = doc.y + 8;
    
    // Bullets
    exp.bullets.forEach((bullet) => {
      checkPageBreak(40);
      
      doc
        .fontSize(10)
        .fillColor(textColor)
        .font("Helvetica")
        .text("•", 60, yPosition, { continued: true })
        .text(" " + bullet, 75, yPosition, {
          width: 487,
          align: "left",
          lineGap: 1,
        });
      
      yPosition = doc.y + 5;
    });
    
    yPosition += 8;
  });

  // PROJECTS (if exists)
  if (resumeData.projects && resumeData.projects.length > 0) {
    checkPageBreak(150);
    addSectionHeader("Projects");
    
    resumeData.projects.forEach((project) => {
      checkPageBreak(120);
      
      // Project name
      doc
        .fontSize(11)
        .fillColor(textColor)
        .font("Helvetica-Bold")
        .text(project.name, 50, yPosition);
      
      yPosition = doc.y + 8;
      
      // Bullets
      project.bullets.forEach((bullet) => {
        checkPageBreak(40);
        
        doc
          .fontSize(10)
          .fillColor(textColor)
          .font("Helvetica")
          .text("•", 60, yPosition, { continued: true })
          .text(" " + bullet, 75, yPosition, {
            width: 487,
            align: "left",
            lineGap: 1,
          });
        
        yPosition = doc.y + 5;
      });
      
      yPosition += 8;
    });
  }

  // Add footer with generation date
  const range = (doc as any).bufferedPageRange();
  const startPage = range.start;
  const totalPages = range.count;
  
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(startPage + i);
    doc
      .fontSize(7)
      .fillColor(mutedColor)
      .font("Helvetica")
      .text(
        `Optimized Resume - Generated on ${metadata.optimizedDate.toLocaleDateString()}`,
        50,
        750,
        { align: "center" }
      );
  }

  doc.end();
  return doc;
}


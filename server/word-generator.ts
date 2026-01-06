import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

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
 * Generate a Word document from an optimized resume
 */
export async function generateOptimizedResumeWord(
  resumeData: OptimizedResumeData,
  metadata: ResumeMetadata
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Add metadata header (small, right-aligned)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Optimized for: ${metadata.jobTitle} at ${metadata.jobCompany}`,
          size: 16, // 8pt in half-points
          color: "6b7280",
          italics: true,
        }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
    })
  );

  // PROFESSIONAL SUMMARY
  children.push(
    new Paragraph({
      text: "PROFESSIONAL SUMMARY",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: resumeData.professionalSummary,
          size: 20, // 10pt
        }),
      ],
      spacing: { after: 240 },
    })
  );

  // TECHNICAL SKILLS
  children.push(
    new Paragraph({
      text: "TECHNICAL SKILLS",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
    })
  );

  // Check if skills are formatted (contains newlines or categories)
  if (resumeData.technicalSkills.includes("\n") || resumeData.technicalSkills.includes(":")) {
    const skillLines = resumeData.technicalSkills.split("\n");
    skillLines.forEach((line) => {
      if (line.trim()) {
        if (line.includes(":")) {
          const [category, skills] = line.split(":");
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: category.trim() + ": ",
                  bold: true,
                  size: 20,
                }),
                new TextRun({
                  text: skills.trim(),
                  size: 20,
                }),
              ],
              spacing: { after: 60 },
            })
          );
        } else {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line.trim(),
                  size: 20,
                }),
              ],
              spacing: { after: 60 },
            })
          );
        }
      }
    });
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: resumeData.technicalSkills,
            size: 20,
          }),
        ],
        spacing: { after: 240 },
      })
    );
  }

  // EDUCATION
  children.push(
    new Paragraph({
      text: "EDUCATION",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: resumeData.education,
          size: 20,
        }),
      ],
      spacing: { after: 240 },
    })
  );

  // RELEVANT EXPERIENCE
  children.push(
    new Paragraph({
      text: "RELEVANT EXPERIENCE",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
    })
  );

  resumeData.relevantExperience.forEach((exp) => {
    // Job title
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: exp.title,
            bold: true,
            size: 22, // 11pt
          }),
        ],
        spacing: { after: 40 },
      })
    );

    // Company
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: exp.company,
            italics: true,
            size: 20,
            color: "6b7280",
          }),
        ],
        spacing: { after: 160 },
      })
    );

    // Bullets
    exp.bullets.forEach((bullet) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "• ",
              size: 20,
            }),
            new TextRun({
              text: bullet,
              size: 20,
            }),
          ],
          spacing: { after: 100 },
          indent: { left: 360 }, // 0.25 inch
        })
      );
    });

    children.push(
      new Paragraph({
        spacing: { after: 160 },
      })
    );
  });

  // PROJECTS (if exists)
  if (resumeData.projects && resumeData.projects.length > 0) {
    children.push(
      new Paragraph({
        text: "PROJECTS",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      })
    );

    resumeData.projects.forEach((project) => {
      // Project name
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: project.name,
              bold: true,
              size: 22,
            }),
          ],
          spacing: { after: 160 },
        })
      );

      // Bullets
      project.bullets.forEach((bullet) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "• ",
                size: 20,
              }),
              new TextRun({
                text: bullet,
                size: 20,
              }),
            ],
            spacing: { after: 100 },
            indent: { left: 360 },
          })
        );
      });

      children.push(
        new Paragraph({
          spacing: { after: 160 },
        })
      );
    });
  }

  // Footer
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Optimized Resume - Generated on ${metadata.optimizedDate.toLocaleDateString()}`,
          size: 14, // 7pt
          color: "6b7280",
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720, // 0.5 inch in twips (1 inch = 1440 twips)
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}


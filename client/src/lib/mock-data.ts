import { LayoutDashboard, FileText, Briefcase, Settings, Activity, CheckCircle, XCircle, Clock, ScanSearch } from "lucide-react";

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  postedDate: string;
  matchScore: number;
  status: "pending" | "applied" | "rejected" | "interview";
  source: "Indeed" | "LinkedIn" | "Glassdoor";
  tags: string[];
  description: string;
  reasoning: string[];
}

export interface Resume {
  id: string;
  name: string;
  skills: string[];
  experience: string;
  lastUpdated: string;
}

export const MOCK_JOBS: Job[] = [
  {
    id: "1",
    title: "Backend Developer (Go/Python)",
    company: "Migranium Tech",
    location: "Toronto, ON (Remote)",
    salary: "$80k - $110k",
    postedDate: "2h ago",
    matchScore: 94,
    status: "pending",
    source: "Indeed",
    tags: ["Python", "FastAPI", "PostgreSQL", "Docker"],
    description: "Looking for a backend developer to join our microservices team...",
    reasoning: [
      "Strong Django/FastAPI experience aligns with requirement.",
      "RabbitMQ knowledge matches microservices architecture needs.",
      "OPS UAT experience is a plus for testing coverage."
    ]
  },
  {
    id: "2",
    title: "Junior Full Stack Engineer",
    company: "Nexus Systems",
    location: "Canada (Remote)",
    salary: "$70k - $90k",
    postedDate: "5h ago",
    matchScore: 88,
    status: "applied",
    source: "LinkedIn",
    tags: ["React", "TypeScript", "Node.js"],
    description: "Join our frontend heavy team building next-gen dashboards...",
    reasoning: [
      "React/TS portfolio is strong.",
      "Honors BTech degree matches education requirement.",
      "Good fit for entry-level role."
    ]
  },
  {
    id: "3",
    title: "Software Developer Intern",
    company: "Global Corp",
    location: "Toronto, ON",
    salary: "$25/hr",
    postedDate: "1d ago",
    matchScore: 72,
    status: "pending",
    source: "Glassdoor",
    tags: ["Java", "Spring", "SQL"],
    description: "Internship for Summer 2025...",
    reasoning: [
      "Moderate match: Java experience is lower than Python/JS.",
      "SQL skills are solid.",
      "Location is perfect."
    ]
  },
  {
    id: "4",
    title: "API Engineer",
    company: "Stripe-like Startup",
    location: "Remote",
    salary: "$100k+",
    postedDate: "30m ago",
    matchScore: 91,
    status: "pending",
    source: "Indeed",
    tags: ["API Design", "Python", "AWS"],
    description: "Building robust financial APIs...",
    reasoning: [
      "Direct API development experience.",
      "AWS deployment skills match perfectly.",
      "High salary potential."
    ]
  },
  {
    id: "5",
    title: "Frontend Developer",
    company: "Creative Agency",
    location: "Toronto, ON",
    salary: "$60k - $80k",
    postedDate: "3d ago",
    matchScore: 65,
    status: "rejected",
    source: "LinkedIn",
    tags: ["Vue.js", "CSS", "Design"],
    description: "Pixel perfect implementation required...",
    reasoning: [
      "Low match: Role requires Vue.js, profile is React heavy.",
      "Agency environment might not fit backend goals."
    ]
  }
];

export const MOCK_RESUMES: Resume[] = [
  {
    id: "r1",
    name: "Full Stack - General",
    skills: ["React", "TypeScript", "Python", "Django", "PostgreSQL"],
    experience: "2 Internships",
    lastUpdated: "Dec 01, 2025"
  },
  {
    id: "r2",
    name: "Backend Focused",
    skills: ["Python", "FastAPI", "Docker", "AWS", "RabbitMQ"],
    experience: "Migranium Backend Dev",
    lastUpdated: "Dec 04, 2025"
  },
  {
    id: "r3",
    name: "Frontend / UI",
    skills: ["React", "Tailwind", "Framer Motion", "Next.js"],
    experience: "Freelance Projects",
    lastUpdated: "Nov 20, 2025"
  }
];

export const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Job Feed", icon: Briefcase, href: "/jobs" },
  { label: "ATS Analyzer", icon: ScanSearch, href: "/ats-analyzer" },
  { label: "Resumes", icon: FileText, href: "/resumes" },
  { label: "Activity Log", icon: Activity, href: "/activity" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export const STATS = [
  { label: "Jobs Scanned", value: "1,240", change: "+124 today", icon: Activity },
  { label: "Applied", value: "48", change: "+5 today", icon: CheckCircle },
  { label: "Interview Rate", value: "12%", change: "+2.1%", icon: Clock },
  { label: "Rejections", value: "15", change: "3 this week", icon: XCircle },
];

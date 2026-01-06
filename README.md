# NeskiApply.AI

**Intelligent Job Application Automation Platform**

NeskiApply.AI is a comprehensive job application automation platform that helps software developers streamline their job search process. It automatically scrapes job listings, matches them with your resume, provides ATS (Applicant Tracking System) analysis, and optimizes your resume for specific job postings using AI.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)

## ✨ Features

### 🎯 Core Functionality

- **Automated Job Scraping**: Automatically scrape job listings from multiple sources using JSearch API
- **Intelligent Job Matching**: AI-powered matching algorithm that scores jobs based on your resume
- **ATS Analysis**: Analyze how well your resume matches job descriptions using AI (Perplexity, Google Gemini, or OpenRouter)
- **Resume Optimization**: AI-powered resume optimization tailored to specific job postings
- **Resume Parser**: Automatically parse and extract information from PDF, DOCX, and DOC resume files
- **Multiple Resume Management**: Upload and manage multiple resumes for different job types

### 🔔 Notifications & Automation

- **Discord Notifications**: Get real-time Discord notifications for high-match jobs
- **Daily Reminders**: Automated daily reminders to apply to unapplied jobs
- **Scheduled Job Scraping**: Configure automated job scraping with custom schedules
- **Background Processing**: Resume optimization runs in the background with progress notifications

### 📊 Analytics & Insights

- **Match Score Tracking**: Track match scores for all jobs
- **ATS Score Comparison**: Compare original vs optimized resume ATS scores
- **Activity Logging**: Comprehensive activity logs for all actions
- **API Usage Tracking**: Monitor API usage across different providers
- **Dashboard Analytics**: Visual dashboard with job statistics and trends

### 🔐 Security & Access

- **User Authentication**: Secure login and registration system
- **Role-Based Access**: Admin and user roles with appropriate permissions
- **Session Management**: Secure session handling with PostgreSQL
- **Rate Limiting**: API rate limiting to prevent abuse
- **Security Headers**: Helmet.js for enhanced security

### 🌐 Integration

- **n8n Integration**: External job ingestion via webhook for custom scraping workflows
- **Multiple AI Providers**: Support for Perplexity, Google Gemini, and OpenRouter
- **OpenRouter Model Selection**: Choose from free OpenRouter models with quality/speed options

## 🛠️ Tech Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **Shadcn UI** - Component library
- **TanStack Query** - Data fetching and caching
- **Wouter** - Lightweight routing

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **PostgreSQL** - Database
- **Drizzle ORM** - Database ORM
- **Passport.js** - Authentication
- **bcrypt** - Password hashing

### AI & Services
- **Perplexity AI** - AI-powered analysis
- **Google Gemini** - AI-powered analysis
- **OpenRouter** - AI model aggregation
- **JSearch API** - Job scraping
- **Discord Webhooks** - Notifications

### DevOps & Tools
- **Helmet.js** - Security headers
- **express-rate-limit** - Rate limiting
- **node-cron** - Scheduled tasks
- **Multer** - File uploads
- **PDFKit** - PDF generation
- **pdf-parse** - PDF parsing
- **mammoth** - DOCX parsing

## 📋 Prerequisites

- **Node.js** >= 20.0.0
- **PostgreSQL** >= 14.0
- **npm** or **yarn**
- **API Keys** (at least one required):
  - Perplexity API key ([Get one here](https://www.perplexity.ai/settings/api))
  - Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))
  - OpenRouter API key ([Get one here](https://openrouter.ai/keys)) - Optional
  - JSearch API key ([Get one here](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch)) - For job scraping

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/neski321/NeskiApply1.git
cd NeskiApply1
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/neskiapply

# Session Secret (generate with: openssl rand -hex 32)
SESSION_SECRET=your-session-secret-here

# API Keys (at least one AI provider required)
PERPLEXITY_API_KEY=your-perplexity-key
GEMINI_API_KEY=your-gemini-key
OPENROUTER_API_KEY=your-openrouter-key  # Optional
JSEARCH_API_KEY=your-jsearch-key
JSEARCH_RAPIDAPI_HOST=your-rapidapi-host

# Discord (Optional - can be set per user in settings)
DISCORD_WEBHOOK_URL=your-discord-webhook-url

# n8n Integration (Optional)
INGEST_KEY=your-secure-ingest-key  # Generate with: openssl rand -hex 32

# Server
PORT=5000
NODE_ENV=development
```

### 4. Set Up Database

```bash
# Push database schema
npm run db:push
```

### 5. Build the Application

```bash
npm run build
```

### 6. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## ⚙️ Configuration

### User Settings

After logging in, configure your settings in the Settings page:

1. **API Keys**: Add your API keys for AI providers and job scraping
2. **Job Scraping**: Configure job titles, locations, and search parameters
3. **Discord Notifications**: Set up Discord webhook for job match notifications
4. **Automation**: Configure scheduled job scraping and reminders
5. **AI Preferences**: Choose your preferred AI provider for resume optimization

### Admin Features

Admin users can:
- View all users and their activity
- Monitor system-wide activity logs
- Manage user roles

## 📖 Usage

### 1. Upload Your Resume

- Go to **Resumes** page
- Click **Upload Resume**
- Upload a PDF, DOCX, or DOC file
- The system will automatically parse and extract information

### 2. Configure Job Search

- Go to **Settings** page
- Set your job titles, locations, and search preferences
- Configure your JSearch API key
- Set up automated scraping schedule (optional)

### 3. Scrape Jobs

- Go to **Job Feed** page
- Click **Sync Jobs** to manually scrape jobs
- Or wait for scheduled scraping to run automatically

### 4. Analyze Job Matches

- Jobs are automatically matched with your resume
- View match scores in the **Job Feed**
- Click on a job to see detailed match analysis

### 5. Optimize Your Resume

- Click on a job in **Job Feed**
- Click **Optimize Resume** button
- Select which resume to optimize
- Wait for AI optimization to complete
- View and download the optimized resume

### 6. ATS Analysis

- Go to **ATS Analyzer** page
- Paste a job description or select a job
- Choose your AI provider
- Get detailed ATS analysis with suggestions

### 7. Set Up Notifications

- Go to **Settings** page
- Configure Discord webhook URL
- Set notification threshold (default: 70%)
- Enable daily reminders (optional)

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Resumes
- `GET /api/resumes` - Get all resumes
- `POST /api/resumes` - Create resume
- `POST /api/resumes/upload` - Upload resume file
- `GET /api/resumes/:id` - Get resume by ID
- `PATCH /api/resumes/:id` - Update resume
- `DELETE /api/resumes/:id` - Delete resume

### Jobs
- `GET /api/jobs` - Get all jobs (with filters)
- `POST /api/jobs/sync` - Manually scrape jobs
- `GET /api/jobs/:id` - Get job by ID
- `PATCH /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job

### ATS Analysis
- `POST /api/ats/analyze` - Analyze job description
- `GET /api/ats/analyses` - Get all analyses
- `GET /api/ats/analyses/:id` - Get analysis by ID

### Resume Optimization
- `POST /api/resumes/:id/optimize` - Optimize resume for job
- `GET /api/optimized-resumes` - Get optimized resumes
- `GET /api/optimized-resumes/:id` - Get optimized resume
- `GET /api/optimized-resumes/:id/download` - Download optimized resume

### Settings
- `GET /api/settings` - Get all settings
- `POST /api/settings` - Set setting
- `GET /api/settings/:key` - Get setting by key

### External Integration
- `POST /api/jobs/ingest` - n8n job ingestion endpoint

For detailed API documentation, see the source code in `server/routes.ts`.

## 🚢 Deployment

### Railway Deployment

See [RAILWAY_SETUP.md](./RAILWAY_SETUP.md) for detailed Railway deployment instructions.

**Quick Steps:**
1. Connect your GitHub repository to Railway
2. Add environment variables
3. Deploy the main service
4. (Optional) Set up Railway cron service for scheduled tasks

### Environment Variables for Production

Ensure all required environment variables are set in your deployment platform:

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secure random string (required in production)
- At least one AI API key (Perplexity, Gemini, or OpenRouter)
- `JSEARCH_API_KEY` and `JSEARCH_RAPIDAPI_HOST` - For job scraping
- `INGEST_KEY` - For n8n integration (if using)

## 🔗 Integration with n8n

See [N8N_SETUP.md](./N8N_SETUP.md) for detailed n8n integration instructions.

**Quick Setup:**
1. Set `INGEST_KEY` environment variable
2. Create n8n workflow with HTTP Request node
3. Configure endpoint: `POST /api/jobs/ingest?userId=<your-user-id>`
4. Add header: `x-neskiapply-ingest-key: <your-ingest-key>`

## 🔒 Security Features

- **Helmet.js**: Security headers (XSS protection, clickjacking, MIME sniffing)
- **Rate Limiting**: API rate limiting (100 req/15min general, 5 req/15min auth)
- **Session Security**: Secure session management with PostgreSQL
- **Password Hashing**: bcrypt for secure password storage
- **Input Validation**: Zod schemas for request validation
- **File Validation**: Magic number checks for uploaded files
- **CORS**: Configured CORS headers
- **Authentication**: Passport.js with local strategy

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📧 Support

For issues, questions, or contributions, please open an issue on GitHub.

## 🙏 Acknowledgments

- Built with [React](https://react.dev/)
- UI components from [Shadcn UI](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Job data from [JSearch API](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch)

---

**Made with ❤️ for job seekers**


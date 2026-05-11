# Travel Planner Frontend

## Getting Started

Install dependencies and run the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## EdgeOne Pages Deployment

Import the repository in EdgeOne Pages and set the project root to this directory:

```txt
Root Directory: frontend
Install Command: npm ci
Build Command: npm run build
Output Directory: .next
Node Version: 22.17.1
```

`edgeone.json` mirrors these settings and configures Node.js cloud functions with a 120 second timeout, which is the EdgeOne Pages maximum.

Required environment variables:

```txt
NEXT_PUBLIC_AMAP_KEY
NEXT_PUBLIC_AMAP_WEB_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
DEEPSEEK_API_KEY
```

Optional environment variables:

```txt
DEEPSEEK_BASE_URL
XHS_MCP_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
```

Before deploying, make sure the Supabase tables used by the API routes exist in the target project.

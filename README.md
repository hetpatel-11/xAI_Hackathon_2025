# GrokGuard: Real-Time AI Safety Platform for X.com

> **xAI Hackathon 2025**
>
> A Chrome extension powered by **Grok AI** that provides real-time content moderation on X.com, detecting scams, impersonators, and misinformation through instant analysis and multi-agent debate systems.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Chrome/Chromium browser
- Grok API key (set in `.env.local`)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your GROK_API_KEY to .env.local
```

### Running the System

```bash
# Terminal 1: Start the API server
npx tsx api/server.ts

# Terminal 2: Start the dashboard (optional)
npm run dashboard

# Terminal 3: Load the Chrome extension
# 1. Open Chrome → chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the `extension/` folder
```

## 🎯 What It Does

GrokGuard monitors your X.com feed in real time and:

- **⚡ Instant Analysis**: Uses `grok-3-mini` to analyze posts as you scroll
- **🛡️ Scam Detection**: Collapses dangerous posts with smooth animations
- **⚠️ Misinformation Labeling**: Flags false claims with fact-check badges
- **📊 Live Dashboard**: Track stats (Scanned, Blocked, Flagged, Fact-Checked, Misinfo)
- **🤖 Multi-Agent Debate**: Deep profile analysis using Prosecutor/Defender/Arbiter agents
- **🔍 Fact-Checking**: Autonomous investigation with source credibility checks

## 🏗️ Architecture

### Real-Time Feed Protection

```
X.com Feed → Chrome Extension → API Server → Grok AI
                ↓
         Instant Analysis (grok-3-mini)
                ↓
    [Scam] → Collapse Post
    [Suspicious] → Flag Badge
    [Clean] → Continue Monitoring
```

### Multi-Agent Profile Analysis

```
Username Input → Investigator Agent (plans investigation)
                        ↓
                  [Fetches X API Data]
                        ↓
        Prosecutor ⚖️ Defender (Multi-turn debate)
              ↓              ↓
          Round 1, Round 2, Round 3...
                        ↓
               [Consensus Reached]
                        ↓
                  Final Verdict
```

**All agents powered by `grok-4-1-fast-reasoning`**

## ✨ Key Features

### Chrome Extension
- ✅ **Real-time feed monitoring** with `MutationObserver` and `IntersectionObserver`
- ✅ **Pre-scanning** posts 2000px ahead for better UX
- ✅ **Post state persistence** using IndexedDB
- ✅ **Smooth collapse animations** for blocked posts
- ✅ **Misinformation badges** with confidence scores
- ✅ **Clickable stats sidebar** to view filtered posts
- ✅ **Auto-scroll to posts** when clicking from dashboard

### API Server
- ✅ **Instant post analysis** endpoint (`/api/analyze-post`)
- ✅ **Fact-checking endpoint** (`/api/fact-check`) with claim detection
- ✅ **Stats endpoint** (`/api/stats`) for dashboard data
- ✅ **Multi-agent debate** for profile analysis (`/api/analyze`)
- ✅ **Feedback endpoint** (`/api/feedback`) for learning

### Dashboard
- ✅ **Real-time stats** (Scanned, Blocked, Flagged, Fact-Checked, Misinfo)
- ✅ **Post filtering** by category (All, Blocked, Flagged, Fact-Checked, Misinfo)
- ✅ **Activity logs** with timestamps
- ✅ **Black & white theme** with glass-morphism effects
- ✅ **Direct links** to original X.com posts

## 🤖 Agentic AI System

### What Makes It Agentic?

1. **Autonomous Tool Use**: Investigator agent decides which X API endpoints to call
2. **Multi-Turn Debate**: Prosecutor and Defender iterate until consensus
3. **Investigation Planning**: AI plans its own data gathering strategy
4. **Consensus Detection**: Stops debating when agents converge (cost optimization)
5. **Adaptive Reasoning**: Agents adjust confidence based on new evidence

### Agent Roles

- **Investigator**: Plans investigation and fetches X API data
- **Prosecutor**: Builds case that content is harmful
- **Defender**: Protects free speech, argues for legitimacy
- **Arbiter**: Makes final decision after reviewing debate

## 📊 Decision System

### Instant Analysis (Feed Posts)

Uses `grok-3-mini` with conservative prompt:

- **SCAM**: Crypto giveaways, phishing links, impersonation, "verify account" scams
- **SUSPICIOUS**: Unverified financial claims, suspicious URLs, too-good-to-be-true offers
- **CLEAN**: Normal tweets, opinions, news, legitimate promotions

**Blocked if**: `classification === "scam" || classification === "suspicious"`

### Fact-Checking

Uses `grok-4-1-fast-reasoning` for:
- Claim detection
- Source credibility verification
- Community context search
- Confidence scoring

**Skipped for**: Verified accounts, credible sources (Forbes, BBC, etc.)

## 🎨 User Experience

- **Collapse Animation**: Blocked posts smoothly collapse with 1.2s animation
- **Badge System**: 
  - 🟢 Clean badge for legitimate posts
  - ⚠️ Warning badge for suspicious posts
  - 🔴 Misinformation badge for false claims
- **Stats Banner**: Fixed position showing real-time counts
- **Sidebar**: Click stats to view filtered posts
- **Toast Messages**: User feedback for actions

## 📝 API Endpoints

### POST `/api/analyze-post`
Instant analysis for feed posts.

**Request:**
```json
{
  "username": "example_user",
  "text": "Post content here"
}
```

**Response:**
```json
{
  "verdict": {
    "classification": "scam" | "suspicious" | "legitimate",
    "confidence": 0-100,
    "recommendedAction": "quarantine" | "flag" | "no_action",
    "reasoning": "Brief explanation"
  }
}
```

### POST `/api/fact-check`
Fact-checking with claim detection.

**Request:**
```json
{
  "username": "example_user",
  "text": "Post content here",
  "tweetUrl": "https://x.com/user/status/123"
}
```

**Response:**
```json
{
  "hasClaim": true,
  "claim": "Detected claim text",
  "verdict": "true" | "false" | "unverifiable",
  "confidence": 0-100,
  "reasoning": "Explanation",
  "sources": ["source1", "source2"]
}
```

### GET `/api/stats`
Real-time dashboard statistics.

**Response:**
```json
{
  "stats": {
    "scanned": 100,
    "blocked": 5,
    "flagged": 3,
    "factChecked": 10,
    "misinformation": 2
  },
  "recentPosts": [...],
  "activityLog": [...]
}
```

## 🛠️ Development

### Project Structure

```
.
├── extension/          # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js  # Service worker
│   ├── feed-monitor.js # Content script
│   └── content.css     # Extension styles
├── api/               # Express.js API server
│   └── server.ts
├── lib/               # Core libraries
│   ├── agents/        # AI agents
│   │   ├── instant-analyzer.ts
│   │   ├── fact-checker.ts
│   │   ├── investigator.ts
│   │   ├── prosecutor.ts
│   │   ├── defender.ts
│   │   ├── arbiter.ts
│   │   └── debate-orchestrator.ts
│   ├── grok/          # Grok API client
│   └── x-api/         # X API client
├── app/               # Next.js dashboard
│   ├── page.tsx       # Main dashboard
│   ├── layout.tsx
│   └── globals.css
└── SUBMISSION.md      # Hackathon submission doc
```

### Commands

```bash
# Start API server
npx tsx api/server.ts

# Start dashboard
npm run dashboard

# Test agentic system
npx tsx test-agentic-real.ts

# Test instant analyzer
npx tsx test-apis.ts
```

## 🎯 Challenges & Solutions

### False Positives
- **Problem**: AI flagging legitimate accounts
- **Solution**: Multi-factor legitimacy scoring, source credibility checks, conservative prompts

### Real-Time Performance
- **Problem**: Need fast analysis for feed scrolling
- **Solution**: Hybrid approach - `grok-3-mini` for instant, `grok-4-1-fast-reasoning` for deep analysis

### Extension Context Invalidation
- **Problem**: UI disappearing after page navigation
- **Solution**: Heartbeat checks, state recovery, `MutationObserver` for navigation detection

## 🏆 Accomplishments

- ✅ **Truly agentic**: Autonomous investigation + multi-turn debate
- ✅ **Zero false positives** on verified accounts
- ✅ **Real-time feed protection** with instant AI analysis
- ✅ **Production-ready** Chrome extension with smooth UX
- ✅ **Comprehensive dashboard** for monitoring and analytics

## 📚 Built With

- **Grok AI** (`grok-3-mini`, `grok-4-1-fast-reasoning`)
- **Chrome Extension API** (Manifest V3)
- **TypeScript**
- **Express.js**
- **Next.js**
- **React**

## 🔮 What's Next

- Human-in-the-loop learning from feedback
- Supabase integration for persistent analytics
- Web search integration for advanced fact-checking
- Mobile browser support
- Community notes integration
- Advanced source credibility database

---

*Powered by Grok AI | Real-time protection for X.com*

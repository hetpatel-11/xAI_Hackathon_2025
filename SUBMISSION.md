## Inspiration

X.com faces scams, impersonators, and misinformation. GrokGuard uses agentic AI to protect users in real time.

## What it does

Real-time X.com feed scanner using **Grok AI**. Multi-agent system (Prosecutor, Defender, Arbiter) debates each post to detect scams, impersonators, and misinformation. Collapses dangerous posts, labels misinformation, and provides a live dashboard.

## How we built it

- **Chrome Extension** (Manifest V3) + Grok API
- **TypeScript** agent orchestration (custom, no frameworks)
- **Express.js** API server + **Next.js** dashboard
- Real-time DOM monitoring for feed analysis

## Challenges we ran into

- **False positives** on legitimate accounts → fixed with multi-factor legitimacy scoring
- **Real-time performance** → hybrid approach: instant analyzer for feed, full debate for profiles
- **Extension context invalidation** → heartbeat checks and state recovery

## Accomplishments that we're proud of

- Truly agentic: autonomous investigation + multi-turn debate
- Zero false positives on verified accounts
- Real-time feed protection with instant AI analysis

## What we learned

- Agentic AI needs clear agent roles and debate structure
- Hybrid models: fast for feed, reasoning for deep analysis
- Source credibility is critical for fact-checking

## What's next for GrokGuard

- Human-in-the-loop learning from feedback
- Supabase integration for persistent analytics
- Web search integration for advanced fact-checking
- Mobile browser support



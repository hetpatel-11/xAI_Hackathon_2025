# 🧠 GrokGuard Decision System - How Posts Are Blocked

## Overview
GrokGuard uses **TWO different AI systems** depending on the context, with sophisticated multi-factor analysis to determine if a post should be blocked.

---

## 🎯 System 1: Feed Posts (Instant Analyzer)

**Used for:** Real-time feed scanning as you scroll through X.com

### Technology:
- **Model:** Grok-4-1-Fast (ultra-fast reasoning model)
- **Speed:** ~200-500ms per post
- **Temperature:** 0 (deterministic)
- **Max Tokens:** 50 (concise responses)

### Decision Criteria:

The AI analyzes posts using these **strict rules**:

#### ❌ SCAM (Blocked & Collapsed)
Posts are marked as SCAM only if they show **CLEAR evidence** of:
- Crypto giveaway scams ("send 0.1 ETH, get 1 ETH back")
- Fake airdrops with wallet phishing
- Impersonation with malicious intent
- "Verify your account" phishing scams
- Malicious links asking for credentials

#### ⚠️ SUSPICIOUS (Warning Badge)
Posts are flagged as SUSPICIOUS for:
- Unverified financial claims with urgency
- Suspicious shortened URLs with promises
- Too-good-to-be-true offers
- Borderline scam tactics without clear proof

#### ✅ CLEAN (No Action)
Default for most posts:
- Normal tweets, opinions, news, jokes
- Legitimate promotions from real brands
- Crypto discussions without scam tactics
- Any post without clear malicious intent

### Conservative Approach:
```
⚡ "BE CONSERVATIVE - only flag OBVIOUS scams. 
   When in doubt, mark CLEAN.
   Most posts are legitimate. 
   False positives hurt user experience."
```

### Output Format:
```json
{
  "verdict": "scam" | "suspicious" | "clean",
  "confidence": 85,
  "reason": "Contains crypto giveaway scam pattern with fake verification link"
}
```

---

## 🏛️ System 2: Profile Analysis (Multi-Agent Debate)

**Used for:** When you click "Analyze" button on a user's profile

### Technology:
- **Model:** Grok-4-1-Fast-Reasoning (advanced reasoning)
- **Agents:** 3 autonomous AI agents
- **Process:** Multi-turn debate (up to 5 rounds)

### The Three Agents:

#### 1️⃣ **Investigator Agent**
**Role:** Gather evidence autonomously

**Tools Available:**
- Fetch user profile data
- Analyze user posts
- Check verification status
- Calculate legitimacy metrics

**Analysis Factors:**
```typescript
- Account age (new accounts = suspicious)
- Follower/following ratio
- Verification status
- Profile completeness
- Tweet activity patterns
- Legitimacy score (0-100)
```

#### 2️⃣ **Prosecutor Agent**
**Role:** Build the case that content is HARMFUL

**Approach:**
- Reviews investigation evidence
- Identifies scam patterns
- Argues for blocking dangerous content
- Confidence: 0-100

**Can adjust confidence:**
- ⬆️ Increases if finds new evidence
- ⬇️ Decreases if defender makes valid points

#### 3️⃣ **Defender Agent**
**Role:** Protect FREE SPEECH and argue content is LEGITIMATE

**Approach:**
- Challenges prosecutor's claims
- Presents alternative explanations
- Advocates for users
- Confidence: 0-100

**Can adjust confidence:**
- ⬆️ Increases if finds legitimate explanations
- ⬇️ Decreases if prosecutor shows strong evidence

### Debate Process:

```
Round 1:
  Prosecutor: "Account is 3 days old with generic username" (Confidence: 75%)
  Defender: "But they have 500 followers and real engagement" (Confidence: 60%)

Round 2:
  Prosecutor: "Username pattern matches known scam bots" (Confidence: 85%)
  Defender: "True, but their tweets show human behavior" (Confidence: 50%)

Round 3:
  Prosecutor: "Recent tweets contain crypto giveaway links" (Confidence: 95%)
  Defender: "I concede - clear scam pattern" (Confidence: 20%)

✅ Consensus reached! Classification: SCAM
```

### Consensus Detection:

**Arbiter monitors:**
- Are confidence scores converging? (within 20 points = consensus)
- Have they addressed all evidence?
- Are they just repeating arguments?

**Stops when:**
- Consensus reached (confidence gap < 20)
- Max rounds hit (5 rounds)
- One agent's confidence drops below 30%

---

## 🔍 Multi-Factor Legitimacy Scoring

Both systems use **comprehensive legitimacy metrics**:

### Temporal Factors:
```typescript
✅ Account age > 2 years = Established
⚠️ Account age < 30 days = New account (higher risk)
```

### Network Factors:
```typescript
✅ Follower ratio > 1.0 = Healthy
⚠️ Follower ratio < 0.1 = Suspicious (following many, few followers)
✅ Listed on 10+ lists = Credible
```

### Activity Factors:
```typescript
✅ Average 1+ tweet/week = Active
⚠️ Average < 1 tweet/month = Dormant
⚠️ 0 tweets but 1000+ followers = Bot-like
```

### Profile Quality:
```typescript
✅ Has profile image = +10 points
✅ Has detailed bio (>50 chars) = +15 points
✅ Has location = +5 points
✅ Has URL = +5 points
⚠️ Default profile image = Suspicious
⚠️ Empty bio = Suspicious
```

### Verification:
```typescript
✅ Blue checkmark = +30 points
✅ Government verified = Trusted
✅ Business verified = Trusted
```

### Scam Risk Patterns:
```typescript
❌ Suspicious follow pattern (following 1000+, 50 followers) = -20
❌ New account + high following = -25
❌ No activity + high followers = -30
❌ Generic username (user12345) = -15
❌ Empty profile = -20
```

### Final Legitimacy Score:
```
Score = Base(50) + PositiveFactors - NegativeFactors

0-30: HIGH RISK (likely scam)
31-60: MEDIUM RISK (suspicious)
61-85: LOW RISK (uncertain)
86-100: TRUSTED (legitimate)
```

---

## 🎨 Color-Coded Custom Filter (NEW!)

**Used for:** User-defined content filtering in Filter Mode

### Technology:
- **Model:** Grok-3-Mini (fast, lightweight)
- **Temperature:** 0.1 (mostly deterministic)
- **Max Tokens:** 150

### Decision Criteria:

#### 🟢 GREEN (85-100% confidence)
**Perfect Match** - Content exactly aligns with user intent
- Shows with green badge "🟢 Perfect match"
- Example: Filter "AI news" → Post about "GPT-4 breakthrough"

#### 🟡 YELLOW (60-84% confidence)
**Partial Match** - Somewhat relevant, user might be interested
- Shows with yellow badge "🟡 Partial match"
- Example: Filter "AI news" → Post about "Tech industry trends"

#### 🔴 RED (0-59% confidence)
**Poor Match** - Doesn't align with user intent
- **COLLAPSED with smooth animation**
- Red overlay with reasoning
- Example: Filter "AI news" → Post about "Celebrity gossip"

### Output Format:
```json
{
  "matchLevel": "green",
  "confidence": 92,
  "reasoning": "Post directly discusses AI and machine learning advancements"
}
```

---

## 📊 Decision Flow Summary

```
┌─────────────────┐
│  New Post       │
└────────┬────────┘
         │
         ▼
    ┌────────────────────┐
    │ Mode Check         │
    └────────┬───────────┘
             │
     ┌───────┴────────┐
     │                │
     ▼                ▼
┌─────────┐      ┌──────────┐
│ FILTER  │      │ GROKGUARD│
│ MODE    │      │ MODE     │
└────┬────┘      └────┬─────┘
     │                │
     ▼                ▼
┌──────────┐    ┌──────────────┐
│ Custom   │    │ Instant      │
│ Filter   │    │ Analyzer     │
│ Agent    │    │ (Grok-4-1)   │
└────┬─────┘    └──────┬───────┘
     │                 │
     ▼                 ▼
┌─────────────┐   ┌──────────────┐
│ Match Level │   │ Verdict      │
│ Green/      │   │ Scam/        │
│ Yellow/Red  │   │ Suspicious/  │
│             │   │ Clean        │
└─────────────┘   └──────────────┘
```

---

## 🛡️ Why This Works

1. **Hybrid Speed + Accuracy**
   - Fast analyzer for real-time feed (200ms)
   - Deep debate for profile analysis (30s)

2. **Conservative by Default**
   - Only blocks OBVIOUS scams
   - Minimizes false positives
   - Protects free speech

3. **Multi-Factor Analysis**
   - Not just keywords
   - Account behavior, network, activity
   - 20+ legitimacy signals

4. **Adversarial Debate**
   - Two AI agents challenge each other
   - Converge on truth through discussion
   - Self-correcting system

5. **Transparent Reasoning**
   - Shows confidence %
   - Explains decision
   - User can always override


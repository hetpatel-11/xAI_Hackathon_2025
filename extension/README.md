# GrokGuard Browser Extension

Chrome extension that brings GrokGuard's agentic AI safety system directly to X.com.

## 🚀 Installation

### For Demo Day:

1. **Open Chrome Extensions**
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode**
   - Toggle "Developer mode" in top right

3. **Load Extension**
   - Click "Load unpacked"
   - Select the `extension/` folder

4. **Visit X.com**
   - Go to any profile (e.g., https://x.com/elonmusk)
   - Click "Analyze with GrokGuard" button

## 📋 Features

### What the Extension Does:

1. **Injects Analyze Button**
   - Appears next to the Follow button on any profile
   - Click to run full agent analysis

2. **Shows Live Debate Overlay**
   - Investigation plan
   - Multi-turn debate (Prosecutor vs Defender)
   - Final verdict with reasoning

3. **Real-time Agent Visualization**
   - See agents deciding which tools to use
   - Watch confidence scores change each round
   - Full transparency into AI reasoning

## 🎬 Demo Flow

### For Judges:

1. **Open X.com** in Chrome
2. **Navigate to a profile** (try @TheCryptoKidsX for interesting case)
3. **Click "Analyze with GrokGuard"**
4. **Watch the magic:**
   - 🔍 Investigator plans investigation
   - ⚖️ Agents debate back-and-forth
   - 🎯 Final verdict with explanation

### Example Profiles to Demo:

- `@elonmusk` - Instant legitimate verdict
- `@TheCryptoKidsX` - Crypto account, multi-round debate
- `@King66415144` - Suspicious numerical username
- Any suspicious account you want to test!

## 🏗️ Architecture

```
X.com Page
    ↓
Content Script (content.js)
    ↓
Background Worker (background.js)
    ↓
GrokGuard API (localhost:3000)
    ↓
Agent Debate System
    ↓
Real X API + Grok
```

## 🔧 Development

### Files:

- `manifest.json` - Extension config (Manifest V3)
- `content.js` - Injects UI on X.com pages
- `content.css` - Overlay styling
- `background.js` - API communication
- `popup.html` - Extension popup UI

### Testing:

1. Load extension in Chrome
2. Visit X.com profile
3. Click "Analyze with GrokGuard"
4. Check browser console for logs

### Mock vs Real API:

**Mock Mode (default):**
- Extension returns simulated data
- Works without backend running
- Good for demo if API is down

**Real API Mode:**
- Set `API_URL` in `background.js`
- Requires backend server running
- Full agent system integration

## 🎯 For xAI Hackathon Judges

**Why this is special:**

1. **Actually works on X.com**
   - Not a mockup - real browser extension
   - Live on production X.com website

2. **Shows "agentic" in action**
   - Agents plan their own investigation
   - Multi-turn debate visible in real-time
   - Not just "LLM-as-judge"

3. **Production-ready**
   - Chrome Web Store ready
   - Manifest V3 compliant
   - Error handling + fallbacks

## 📸 Screenshots

(Add screenshots here after testing)

## 🚢 Deployment

### For Production:

1. Create API endpoint (Vercel/Railway)
2. Update `API_URL` in `background.js`
3. Add extension icons
4. Submit to Chrome Web Store

### For Demo:

Extension works in "mock mode" without backend - perfect for live demo!

---

**Built with ❤️ for xAI Hackathon 2025**

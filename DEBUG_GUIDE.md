# Debug Guide - Extension Not Analyzing Posts

## Issue
Extension shows "63 scanned, 0 blocked, 0 flagged" - posts are being counted but not analyzed.

## What I Added

### Debug Logging
The feed-monitor.js now has extensive console logging:

1. **Queue logging**:
   - `📝 Queuing post X from @username` - When posts are queued
   - `➕ Added to queue. Queue size now: X` - Queue size updates
   - `✅ Queued X new posts. Queue size: X` - Summary

2. **Processing logging**:
   - `🚀 Starting queue processor. Queue size: X` - When processing starts
   - `📦 Processing batch of X posts` - Each batch
   - `✅ Queue processor finished` - When done

3. **Analysis logging**:
   - `🔬 Starting analysis for @username` - When analysis begins
   - `📡 Calling AI API for @username...` - Before API call
   - `📊 Got result for @username:` - After API returns

## How to Debug

### Step 1: Open Browser Console
1. Load X.com with the extension
2. Open Developer Tools (F12 or Cmd+Option+I)
3. Go to "Console" tab
4. Look for GrokGuard logs

### Step 2: Check What You See

**If you see:**
```
🛡️ GrokGuard Feed Monitor loaded
✅ Feed monitoring active - scanning every 2s
🔍 Scanning 63 posts
```
But NO queuing messages (`📝 Queuing post...`) → Posts are being skipped

**If you see queuing but no processing:**
```
📝 Queuing post 1 from @user...
➕ Added to queue. Queue size now: 1
```
But NO `🚀 Starting queue processor` → Queue not starting

**If you see processing but no API calls:**
```
🚀 Starting queue processor
📦 Processing batch of 3 posts
```
But NO `📡 Calling AI API` → API calls failing

### Step 3: Common Issues

#### Issue 1: All Posts Already Processed
**Symptom**: `🔍 Scanning 63 posts` but no new posts queued

**Cause**: Posts already have `data-grokguard-processed` attribute

**Fix**: Reload the page completely (Cmd+R or Ctrl+R)

#### Issue 2: Extension Context Invalid
**Symptom**: Error about "Extension context invalidated"

**Cause**: Extension was reloaded while page was open

**Fix**:
1. Go to `chrome://extensions`
2. Click "Reload" on GrokGuard
3. Go back to X.com and reload the page

#### Issue 3: API Server Not Running
**Symptom**: `AI analysis failed` errors in console

**Cause**: API server at localhost:3000 is down

**Fix**:
```bash
cd /Users/hetpatel/Desktop/XAI_Hackathon
npm run api
```

Check server is running:
```bash
curl http://localhost:3000/health
```

Should return: `{"status":"ok","message":"GrokGuard API is running"}`

### Step 4: Manual Test

Open browser console and run:
```javascript
// Test queue manually
queuePostForAnalysis('testuser', 'This is a test post about crypto giveaway!', document.querySelector('[data-testid="tweet"]'));
```

You should see all the logging steps.

## Expected Full Log Flow

When working correctly, you should see:
```
🛡️ GrokGuard Feed Monitor loaded
✅ Feed monitoring active - scanning every 2s
🔍 Scanning 63 posts
📝 Queuing post 1 from @user1: "Some post content..."
➕ Added to queue. Queue size now: 1
📝 Queuing post 2 from @user2: "Another post..."
➕ Added to queue. Queue size now: 2
...
✅ Queued 5 new posts. Queue size: 5
🚀 Starting queue processor. Queue size: 5
📦 Processing batch of 3 posts
🔬 Starting analysis for @user1
📡 Calling AI API for @user1...
🔬 Starting analysis for @user2
📡 Calling AI API for @user2...
🔬 Starting analysis for @user3
📡 Calling AI API for @user3...
📊 Got result for @user1: {verdict: {classification: "legitimate", ...}}
📊 Got result for @user2: {verdict: {classification: "scam", ...}}
...
```

## Quick Fixes

### If Nothing Works:
1. **Hard refresh**: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Clear extension data**: Chrome DevTools → Application → Storage → Clear site data
3. **Reload extension**: `chrome://extensions` → Reload GrokGuard
4. **Restart API server**: Kill and restart `npm run api`

### Check Extension is Loaded:
1. Go to `chrome://extensions`
2. Ensure GrokGuard is enabled
3. Check "Errors" button for any errors

### Check Network Tab:
1. Open DevTools → Network tab
2. Filter for "analyze-post"
3. You should see POST requests to `localhost:3000/api/analyze-post`

## Still Not Working?

Send me the console logs starting from page load. I need to see:
1. Initial load message
2. Scanning messages
3. Any errors
4. What happens when you scroll

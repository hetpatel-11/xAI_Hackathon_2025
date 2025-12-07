/**
 * GrokGuard Feed Monitor
 * Automatically scans and moderates X.com feed in real-time
 */

console.log('🛡️ GrokGuard Feed Monitor loaded');

// Stats tracking
const stats = {
  scamsBlocked: 0,
  suspicious: 0,
  totalScanned: 0,
  factChecked: 0,
  misinformation: 0
};

// Store fact-check results for posts
const factCheckResults = new Map();

// Track analyzed posts by unique ID to prevent re-scanning on scroll
const analyzedPostIds = new Set();

// Store blocked posts for viewing later
const blockedPosts = [];

// Store fact-checked posts for viewing later
const factCheckedPosts = [];

// Store misinformation posts for viewing later  
const misinformationPosts = [];

// Analysis queue to prevent overwhelming the API
const analysisQueue = [];
let isProcessingQueue = false;
const MAX_CONCURRENT_ANALYSES = 3; // Analyze up to 3 posts at once

// Keep track of monitoring state
let monitorIntervalId = null;
let isMonitoringActive = true;

// Monitor feed for new posts - INSTANT FILTERING
function monitorFeed() {
  const posts = document.querySelectorAll('[data-testid="tweet"]');

  let newPosts = 0;

  posts.forEach(post => {
    // Extract unique post ID from the tweet link (e.g., /username/status/123456)
    const statusLink = post.querySelector('a[href*="/status/"]');
    const postId = statusLink ? statusLink.getAttribute('href') : null;
    
    // Skip if no ID found
    if (!postId) return;
    
    // Skip if already analyzed (tracked by ID, survives DOM recreation)
    if (analyzedPostIds.has(postId)) {
      // Re-apply the attribute if DOM was recreated
      if (!post.hasAttribute('data-grokguard-processed')) {
        post.setAttribute('data-grokguard-processed', 'already-analyzed');
      }
      return;
    }

    // Skip if currently being processed (DOM attribute for in-progress)
    if (post.hasAttribute('data-grokguard-processed')) {
      return;
    }

    // Extract post content
    const tweetTextEl = post.querySelector('[data-testid="tweetText"]');
    const tweetText = tweetTextEl ? tweetTextEl.innerText : '';

    if (!tweetText) {
      post.setAttribute('data-grokguard-processed', 'empty');
      analyzedPostIds.add(postId); // Track empty posts too
      return;
    }

    // Extract username
    const usernameLink = post.querySelector('a[href^="/"]');
    if (!usernameLink) return;

    const username = usernameLink.getAttribute('href')?.replace('/', '');
    if (!username || username === 'home' || username === 'i') return;

    stats.totalScanned++;
    newPosts++;

    // Queue post for AI analysis
    post.setAttribute('data-grokguard-processed', 'queued');
    queuePostForAnalysis(username, tweetText, post, postId);
  });

  // Update stats banner
  updateStatsBanner();
}

/**
 * Queue post for analysis to avoid overwhelming the API
 */
function queuePostForAnalysis(username, text, post, postId) {
  analysisQueue.push({ username, text, post, postId });
  processQueue();
}

/**
 * Process the analysis queue with concurrency control
 */
async function processQueue() {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  try {
    while (analysisQueue.length > 0 && isMonitoringActive) {
      // Take up to MAX_CONCURRENT_ANALYSES posts from queue
      const batch = analysisQueue.splice(0, MAX_CONCURRENT_ANALYSES);

      // Analyze all posts in batch concurrently with timeout
      const analysisPromises = batch.map(item =>
        Promise.race([
          analyzePost(item.username, item.text, item.post, item.postId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Analysis timeout')), 30000)
          )
        ]).catch(err => {
          console.warn(`Analysis failed for @${item.username}:`, err.message);
          // Mark as processed to prevent retries
          item.post.setAttribute('data-grokguard-processed', 'timeout');
          analyzedPostIds.add(item.postId);
        })
      );

      await Promise.all(analysisPromises);
    }
  } catch (error) {
    console.error('Queue processing error:', error);
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Analyze individual post with INSTANT GROK AI
 */
async function analyzePost(username, text, post, postId) {
  let loadingBadge = null;
  
  try {
    post.setAttribute('data-grokguard-processed', 'analyzing');

    // Show loading indicator
    loadingBadge = document.createElement('div');
    loadingBadge.className = 'grokguard-badge analyzing';
    loadingBadge.setAttribute('data-post-id', postId);
    loadingBadge.innerHTML = `
      <span class="badge-icon">🤖</span>
      <span class="badge-text">Scanning...</span>
    `;

    const postInner = post.querySelector('[data-testid="tweetText"]')?.parentElement?.parentElement;
    if (postInner) {
      postInner.insertBefore(loadingBadge, postInner.firstChild);
    }

    const result = await analyzeWithAgents(username, text, post);

    if (result && result.mock) {
      console.warn('⚠️ GrokGuard using MOCK (API unreachable)');
    }

    // Mark this post as analyzed (by ID) so we don't re-scan on scroll
    analyzedPostIds.add(postId);

    if (result && result.verdict) {
      const classification = result.verdict.classification;
      const confidence = result.verdict.confidence;
      const reasoning = result.verdict.reasoning || 'No reasoning provided';

      if (classification === 'scam' || classification === 'suspicious') {
        stats.scamsBlocked++;
        post.setAttribute('data-grokguard-processed', 'scam');
        blurPost(post, username, classification, confidence, reasoning);
        addFeedbackButtons(post, username, classification, confidence);
      } else if (classification === 'uncertain') {
        stats.suspicious++;
        post.setAttribute('data-grokguard-processed', 'suspicious');
        addWarningBadge(post, username, classification, confidence, reasoning);
        addFeedbackButtons(post, username, classification, confidence);
      } else {
        // AI says it's legitimate - check for misinformation/claims
        post.setAttribute('data-grokguard-processed', 'clean');
        addCleanBadge(post);
        
        // Run fact-check in background for posts with potential claims
        factCheckInBackground(username, text, post, postId);
      }

      updateStatsBanner();
    } else {
      // Analysis failed, mark as analyzed to avoid re-scanning
      post.setAttribute('data-grokguard-processed', 'clean');
      addCleanBadge(post);
    }
  } catch (error) {
    console.error(`AI analysis error for @${username}:`, error);
    post.setAttribute('data-grokguard-processed', 'error');
    analyzedPostIds.add(postId); // Still track to avoid re-scanning
  } finally {
    // ALWAYS remove loading indicator, even on error
    if (loadingBadge && loadingBadge.parentElement) {
      loadingBadge.remove();
    }
    // Also clean up any stale loading badges on this post
    const staleLoadingBadges = post.querySelectorAll('.grokguard-badge.analyzing');
    staleLoadingBadges.forEach(badge => badge.remove());
  }
}

/**
 * Call API to analyze post with Grok AI
 */
async function analyzeWithAgents(username, text, post) {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.error('Extension context invalidated - please refresh the page');
      showExtensionError();
      return null;
    }

    // Call background script which calls our API
    const response = await chrome.runtime.sendMessage({
      action: 'analyzePost',
      username: username,
      text: text
    });

    if (response && response.success) {
      return response.data;
    } else if (response && response.error) {
      console.error(`API error for @${username}:`, response.error);
    }
  } catch (error) {
    // Handle extension context invalidated error
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.error('Extension context invalidated - please refresh the page');
      showExtensionError();
      isMonitoringActive = false;
      if (monitorIntervalId) {
        clearInterval(monitorIntervalId);
        monitorIntervalId = null;
      }
    } else {
      console.error(`AI analysis failed for @${username}:`, error);
    }
  }

  return null;
}

/**
 * Show error when extension needs refresh
 */
function showExtensionError() {
  const banner = document.getElementById('grokguard-stats-banner');
  if (banner) {
    banner.innerHTML = `
      <div class="stats-content error-state">
        <span class="stats-logo">⚠️ GrokGuard Needs Refresh</span>
        <button onclick="location.reload()" class="refresh-btn">Refresh Page</button>
      </div>
    `;
  }
}

/**
 * Fact-check post in background for misinformation detection
 */
async function factCheckInBackground(username, text, post, postId) {
  // Skip short posts (unlikely to contain verifiable claims)
  if (text.length < 50) return;
  
  // Skip if already fact-checked
  if (factCheckResults.has(postId)) return;

  // Check if extension context is still valid
  if (!chrome.runtime?.id) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'factCheck',
      username: username,
      text: text
    });

    if (response && response.success && response.data) {
      factCheckResults.set(postId, response.data);

      if (response.data.hasClaim) {
        stats.factChecked++;
        
        // Extract post URL
        const statusLink = post.querySelector('a[href*="/status/"]');
        const postUrl = statusLink ? 'https://x.com' + statusLink.getAttribute('href') : null;
        
        // Store fact-checked post for viewing
        factCheckedPosts.push({
          username,
          text: text.substring(0, 300),
          claims: response.data.claims || [],
          verdict: response.data.verdict,
          confidence: response.data.confidence,
          explanation: response.data.explanation,
          sources: response.data.sources || [],
          communityNote: response.data.communityNote,
          url: postUrl,
          timestamp: new Date().toLocaleTimeString()
        });
        
        // Show fact-check button
        addFactCheckButton(post, username, response.data);
        
        // If misinformation detected, show community note and store separately
        if (response.data.verdict === 'false' || response.data.verdict === 'mostly_false') {
          stats.misinformation++;
          
          // Store in misinformation list
          misinformationPosts.push({
            username,
            text: text.substring(0, 300),
            claims: response.data.claims || [],
            verdict: response.data.verdict,
            confidence: response.data.confidence,
            explanation: response.data.explanation,
            sources: response.data.sources || [],
            communityNote: response.data.communityNote,
            url: postUrl,
            timestamp: new Date().toLocaleTimeString()
          });
          
          showCommunityNote(post, response.data);
        }
        
        updateStatsBanner();
      }
    }
  } catch (error) {
    if (error.message && error.message.includes('Extension context invalidated')) {
      // Silent fail - extension needs refresh
    } else {
      console.error('Fact-check error:', error);
    }
  }
}

/**
 * Add fact-check button to post
 */
function addFactCheckButton(post, username, factCheckData) {
  // Don't add if already has one
  if (post.querySelector('.grokguard-factcheck-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'grokguard-factcheck-btn';
  btn.innerHTML = `🔍 Fact-Check`;
  btn.title = 'View fact-check details';

  // Add verdict indicator
  const verdictColors = {
    'true': '#00ff00',
    'mostly_true': '#90EE90',
    'mixed': '#ffaa00',
    'mostly_false': '#ff6600',
    'false': '#ff0000',
    'unverifiable': '#888888'
  };
  
  if (factCheckData.verdict) {
    btn.style.borderColor = verdictColors[factCheckData.verdict] || '#888';
    btn.innerHTML = `🔍 ${factCheckData.verdict.replace('_', ' ')}`;
  }

  btn.addEventListener('click', () => {
    showFactCheckOverlay(post, username, factCheckData);
  });

  const actionBar = post.querySelector('[role="group"]');
  if (actionBar) {
    actionBar.appendChild(btn);
  }
}

/**
 * Show community note on post (like X's Community Notes)
 */
function showCommunityNote(post, factCheckData) {
  // Don't add if already has one
  if (post.querySelector('.grokguard-community-note')) return;

  const note = document.createElement('div');
  note.className = 'grokguard-community-note';
  note.innerHTML = `
    <div class="community-note-header">
      <span class="community-note-icon">📋</span>
      <span class="community-note-title">Community Context (AI Generated)</span>
    </div>
    <p class="community-note-text">${factCheckData.communityNote || factCheckData.explanation}</p>
    ${factCheckData.sources && factCheckData.sources.length > 0 ? `
      <div class="community-note-sources">
        <strong>Sources:</strong> ${factCheckData.sources.slice(0, 2).join(', ')}
      </div>
    ` : ''}
    <button class="community-note-expand">Learn more</button>
  `;

  note.querySelector('.community-note-expand').addEventListener('click', () => {
    showFactCheckOverlay(post, '', factCheckData);
  });

  // Insert after tweet text
  const tweetText = post.querySelector('[data-testid="tweetText"]');
  if (tweetText && tweetText.parentElement) {
    tweetText.parentElement.insertAdjacentElement('afterend', note);
  }
}

/**
 * Show detailed fact-check overlay
 */
function showFactCheckOverlay(post, username, factCheckData) {
  // Remove any existing overlay
  const existing = document.querySelector('.grokguard-factcheck-overlay');
  if (existing) existing.remove();

  const verdictEmojis = {
    'true': '✅',
    'mostly_true': '✔️',
    'mixed': '⚖️',
    'mostly_false': '⚠️',
    'false': '❌',
    'unverifiable': '❓'
  };

  const overlay = document.createElement('div');
  overlay.className = 'grokguard-factcheck-overlay';
  overlay.innerHTML = `
    <div class="factcheck-modal">
      <div class="factcheck-header">
        <h2>🔍 Fact-Check Results</h2>
        <button class="factcheck-close">×</button>
      </div>
      
      <div class="factcheck-verdict">
        <span class="verdict-emoji">${verdictEmojis[factCheckData.verdict] || '❓'}</span>
        <span class="verdict-text">${(factCheckData.verdict || 'Unknown').replace('_', ' ').toUpperCase()}</span>
        <span class="verdict-confidence">${factCheckData.confidence || 0}% confident</span>
      </div>

      <div class="factcheck-claims">
        <h3>📝 Claims Detected</h3>
        <ul>
          ${(factCheckData.claims || []).map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>

      <div class="factcheck-explanation">
        <h3>📖 Explanation</h3>
        <p>${factCheckData.explanation || 'No explanation available'}</p>
      </div>

      ${factCheckData.context ? `
        <div class="factcheck-context">
          <h3>🔗 Additional Context</h3>
          <p>${factCheckData.context}</p>
        </div>
      ` : ''}

      ${factCheckData.communityNote ? `
        <div class="factcheck-community-note">
          <h3>📋 Community Note</h3>
          <p>${factCheckData.communityNote}</p>
        </div>
      ` : ''}

      ${factCheckData.sources && factCheckData.sources.length > 0 ? `
        <div class="factcheck-sources">
          <h3>📚 Sources</h3>
          <ul>
            ${factCheckData.sources.map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="factcheck-footer">
        <p>Powered by GrokGuard AI • Not financial or legal advice</p>
      </div>
    </div>
  `;

  overlay.querySelector('.factcheck-close').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

/**
 * Apply moderation actions based on analysis
 */
function applyModeration(post, username, analysis) {
  if (!analysis) return;

  const { classification, confidence, action, reasoning } = analysis;

  // Remove any existing moderation UI to prevent duplicates
  const existingBadge = post.querySelector('.grokguard-badge');
  if (existingBadge) existingBadge.remove();

  const existingOverlay = post.querySelector('.grokguard-blur-overlay');
  if (existingOverlay) existingOverlay.remove();

  const existingFeedback = post.querySelector('.grokguard-feedback');
  if (existingFeedback) existingFeedback.remove();

  if (classification === 'scam' || classification === 'suspicious') {
    // HIGH RISK: Blur/hide the post
    if (action === 'quarantine') {
      blurPost(post, username, classification, confidence, reasoning);
    } else if (action === 'flag') {
      addWarningBadge(post, username, classification, confidence, reasoning);
    }
    // Add feedback buttons for flagged posts
    addFeedbackButtons(post, username, classification, confidence);
  } else if (classification === 'uncertain') {
    // MEDIUM RISK: Add warning badge
    addWarningBadge(post, username, classification, confidence, reasoning);
    // Add feedback buttons for uncertain posts
    addFeedbackButtons(post, username, classification, confidence);
  }
  // Don't add feedback for legitimate posts
}

/**
 * Blur/hide a suspicious post
 */
function blurPost(post, username, classification, confidence, reasoning) {
  // Extract the post text for storage
  const tweetTextEl = post.querySelector('[data-testid="tweetText"]');
  const tweetText = tweetTextEl ? tweetTextEl.innerText : '';
  
  // Extract post link
  const statusLink = post.querySelector('a[href*="/status/"]');
  const postUrl = statusLink ? 'https://x.com' + statusLink.getAttribute('href') : null;
  
  // Store blocked post for later viewing
  blockedPosts.push({
    username,
    text: tweetText,
    classification,
    confidence,
    reasoning,
    url: postUrl,
    timestamp: new Date().toLocaleTimeString()
  });
  
  // Add blur class
  post.style.filter = 'blur(10px)';
  post.style.opacity = '0.5';
  post.style.position = 'relative';

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'grokguard-blur-overlay';
  overlay.innerHTML = `
    <div class="grokguard-warning-box">
      <div class="warning-icon">⚠️</div>
      <h3>Post Hidden by GrokGuard</h3>
      <p><strong>@${username}</strong> flagged as <strong>${classification.toUpperCase()}</strong></p>
      <p class="confidence">AI Confidence: ${confidence}%</p>
      <p class="reason">${reasoning.substring(0, 200)}...</p>
      <button class="grokguard-show-anyway">Show Anyway</button>
      <button class="grokguard-learn-more" data-username="${username}">Why?</button>
    </div>
  `;

  // Show anyway button
  overlay.querySelector('.grokguard-show-anyway').addEventListener('click', () => {
    post.style.filter = 'none';
    post.style.opacity = '1';
    overlay.remove();
  });

  // Learn more button
  overlay.querySelector('.grokguard-learn-more').addEventListener('click', () => {
    // Trigger full analysis overlay
    window.postMessage({ type: 'GROKGUARD_ANALYZE', username }, '*');
  });

  post.style.position = 'relative';
  post.appendChild(overlay);
}

/**
 * Add subtle checkmark to show post was analyzed and is clean
 */
function addCleanBadge(post) {
  // Don't add if already has a badge
  if (post.querySelector('.grokguard-clean-badge')) return;
  
  const badge = document.createElement('div');
  badge.className = 'grokguard-clean-badge';
  badge.innerHTML = '✓';
  badge.title = 'Verified by GrokGuard AI';
  
  // Insert near the tweet text
  const postInner = post.querySelector('[data-testid="tweetText"]')?.parentElement?.parentElement;
  if (postInner) {
    postInner.style.position = 'relative';
    postInner.appendChild(badge);
  }
}

/**
 * Add warning badge to profile/post
 */
function addWarningBadge(post, username, classification, confidence, reasoning) {
  const badge = document.createElement('div');
  badge.className = `grokguard-badge ${classification}`;
  badge.innerHTML = `
    <span class="badge-icon">⚠️</span>
    <span class="badge-text">AI Flagged: ${classification}</span>
    <span class="badge-confidence">${confidence}%</span>
    <div class="badge-tooltip">
      <strong>GrokGuard Analysis</strong><br>
      Classification: ${classification.toUpperCase()}<br>
      Confidence: ${confidence}%<br>
      ${reasoning.substring(0, 150)}...
    </div>
  `;

  // Insert at top of post
  const postInner = post.querySelector('[data-testid="tweetText"]')?.parentElement?.parentElement;
  if (postInner) {
    postInner.insertBefore(badge, postInner.firstChild);
  }
}

/**
 * Add feedback buttons (thumbs up/down)
 */
function addFeedbackButtons(post, username, classification, confidence) {
  const feedbackDiv = document.createElement('div');
  feedbackDiv.className = 'grokguard-feedback';
  feedbackDiv.innerHTML = `
    <span class="feedback-label">GrokGuard correct?</span>
    <button class="feedback-btn thumbs-up" title="Correct classification">👍</button>
    <button class="feedback-btn thumbs-down" title="Incorrect classification">👎</button>
  `;

  // Thumbs up handler
  feedbackDiv.querySelector('.thumbs-up').addEventListener('click', () => {
    submitFeedback(username, classification, confidence, true);
    feedbackDiv.innerHTML = '<span class="feedback-thanks">✅ Thanks for feedback!</span>';
  });

  // Thumbs down handler
  feedbackDiv.querySelector('.thumbs-down').addEventListener('click', () => {
    submitFeedback(username, classification, confidence, false);
    feedbackDiv.innerHTML = '<span class="feedback-thanks">✅ Feedback recorded</span>';
  });

  // Insert at bottom of post
  const actionBar = post.querySelector('[role="group"]');
  if (actionBar) {
    actionBar.parentElement.appendChild(feedbackDiv);
  }
}

/**
 * Submit feedback to API for learning
 */
async function submitFeedback(username, classification, confidence, wasCorrect) {
  try {
    await chrome.runtime.sendMessage({
      action: 'submitFeedback',
      data: {
        username,
        classification,
        confidence,
        wasCorrect,
        timestamp: Date.now()
      }
    });

    console.log(`✅ Feedback submitted for @${username}: ${wasCorrect ? 'Correct' : 'Incorrect'}`);
  } catch (error) {
    console.error('Failed to submit feedback:', error);
  }
}

// Listen for messages from content script
window.addEventListener('message', (event) => {
  if (event.data.type === 'GROKGUARD_ANALYZE' && event.data.username) {
    // Trigger full analysis overlay
    const analyzeEvent = new CustomEvent('grokguard:analyze', {
      detail: { username: event.data.username }
    });
    document.dispatchEvent(analyzeEvent);
  }
});

/**
 * Update stats banner - fixed position so it works on all pages
 */
function updateStatsBanner() {
  let banner = document.getElementById('grokguard-stats-banner');

  if (!banner) {
    // Create banner for first time - fixed position at top
    banner = document.createElement('div');
    banner.id = 'grokguard-stats-banner';
    banner.className = 'grokguard-stats-banner';
    document.body.appendChild(banner);
  }

  // Update stats with clickable counts
  banner.innerHTML = `
    <div class="stats-content">
      <span class="stats-logo">🛡️ GrokGuard Active</span>
      <div class="stats-items">
        <span class="stat-item">
          <span class="stat-number">${stats.totalScanned}</span>
          <span class="stat-label">Scanned</span>
        </span>
        <span class="stat-item blocked clickable" id="grokguard-view-blocked" title="Click to view blocked posts">
          <span class="stat-number">${stats.scamsBlocked}</span>
          <span class="stat-label">Blocked</span>
        </span>
        <span class="stat-item suspicious">
          <span class="stat-number">${stats.suspicious}</span>
          <span class="stat-label">Flagged</span>
        </span>
        ${stats.factChecked > 0 ? `
          <span class="stat-item factchecked clickable" id="grokguard-view-factchecked" title="Click to view fact-checked posts">
            <span class="stat-number">${stats.factChecked}</span>
            <span class="stat-label">Fact-Checked</span>
          </span>
        ` : ''}
        ${stats.misinformation > 0 ? `
          <span class="stat-item misinfo clickable" id="grokguard-view-misinfo" title="Click to view misinformation posts">
            <span class="stat-number">${stats.misinformation}</span>
            <span class="stat-label">Misinfo</span>
          </span>
        ` : ''}
      </div>
    </div>
  `;

  // Add click handlers
  const blockedBtn = banner.querySelector('#grokguard-view-blocked');
  if (blockedBtn) {
    blockedBtn.addEventListener('click', () => showSidebar('blocked'));
  }
  
  const factcheckedBtn = banner.querySelector('#grokguard-view-factchecked');
  if (factcheckedBtn) {
    factcheckedBtn.addEventListener('click', () => showSidebar('factchecked'));
  }
  
  const misinfoBtn = banner.querySelector('#grokguard-view-misinfo');
  if (misinfoBtn) {
    misinfoBtn.addEventListener('click', () => showSidebar('misinfo'));
  }
}

/**
 * Show sidebar with posts of specified type
 */
function showSidebar(type) {
  // Remove existing sidebar if any
  const existingSidebar = document.getElementById('grokguard-sidebar');
  if (existingSidebar) {
    existingSidebar.remove();
    // If clicking same type, just toggle off
    if (existingSidebar.dataset.type === type) {
      return;
    }
  }

  const sidebar = document.createElement('div');
  sidebar.id = 'grokguard-sidebar';
  sidebar.className = 'grokguard-blocked-sidebar';
  sidebar.dataset.type = type;

  let title, icon, posts, emptyMessage;
  
  if (type === 'blocked') {
    title = 'Blocked Posts';
    icon = '🛡️';
    posts = blockedPosts;
    emptyMessage = 'No posts blocked yet. GrokGuard is monitoring your feed.';
  } else if (type === 'factchecked') {
    title = 'Fact-Checked Posts';
    icon = '🔍';
    posts = factCheckedPosts;
    emptyMessage = 'No posts with claims detected yet.';
  } else if (type === 'misinfo') {
    title = 'Misinformation Detected';
    icon = '⚠️';
    posts = misinformationPosts;
    emptyMessage = 'No misinformation detected yet.';
  }

  if (posts.length === 0) {
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h3>${icon} ${title}</h3>
        <button class="sidebar-close">×</button>
      </div>
      <div class="sidebar-content">
        <p class="no-blocked">${emptyMessage}</p>
      </div>
    `;
  } else {
    let postsHtml;
    
    if (type === 'blocked') {
      postsHtml = posts.map(post => `
        <div class="blocked-post-item">
          <div class="blocked-post-header">
            <span class="blocked-username">@${post.username}</span>
            <span class="blocked-time">${post.timestamp}</span>
          </div>
          <div class="blocked-post-text">${post.text.substring(0, 150)}${post.text.length > 150 ? '...' : ''}</div>
          <div class="blocked-post-meta">
            <span class="blocked-classification ${post.classification}">${post.classification.toUpperCase()}</span>
            <span class="blocked-confidence">${post.confidence}%</span>
          </div>
          <div class="blocked-post-reason">${post.reasoning}</div>
          ${post.url ? `<a href="${post.url}" target="_blank" class="blocked-post-link">View Original →</a>` : ''}
        </div>
      `).join('');
    } else {
      // Fact-checked or misinformation posts
      postsHtml = posts.map(post => {
        const verdictClass = post.verdict === 'false' || post.verdict === 'mostly_false' ? 'false' :
                            post.verdict === 'true' || post.verdict === 'mostly_true' ? 'true' : 'mixed';
        const verdictEmoji = {
          'true': '✅',
          'mostly_true': '✔️',
          'mixed': '⚖️',
          'mostly_false': '⚠️',
          'false': '❌',
          'unverifiable': '❓'
        }[post.verdict] || '❓';
        
        return `
          <div class="blocked-post-item factcheck-item">
            <div class="blocked-post-header">
              <span class="blocked-username">@${post.username}</span>
              <span class="blocked-time">${post.timestamp}</span>
            </div>
            <div class="blocked-post-text">${post.text.substring(0, 150)}${post.text.length > 150 ? '...' : ''}</div>
            
            <div class="factcheck-verdict-mini ${verdictClass}">
              <span class="verdict-emoji">${verdictEmoji}</span>
              <span class="verdict-label">${(post.verdict || 'unknown').replace('_', ' ').toUpperCase()}</span>
              <span class="verdict-conf">${post.confidence}%</span>
            </div>
            
            ${post.claims && post.claims.length > 0 ? `
              <div class="factcheck-claims-mini">
                <strong>Claims:</strong> ${post.claims.slice(0, 2).join('; ')}${post.claims.length > 2 ? '...' : ''}
              </div>
            ` : ''}
            
            <div class="blocked-post-reason">${post.explanation || post.communityNote || ''}</div>
            
            ${post.sources && post.sources.length > 0 ? `
              <div class="factcheck-sources-mini">
                <strong>Sources:</strong> ${post.sources.slice(0, 2).join(', ')}
              </div>
            ` : ''}
            
            ${post.url ? `<a href="${post.url}" target="_blank" class="blocked-post-link">View Original →</a>` : ''}
          </div>
        `;
      }).join('');
    }

    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h3>${icon} ${title} (${posts.length})</h3>
        <button class="sidebar-close">×</button>
      </div>
      <div class="sidebar-content">
        ${postsHtml}
      </div>
    `;
  }

  // Close button handler
  sidebar.querySelector('.sidebar-close').addEventListener('click', () => {
    sidebar.remove();
  });

  document.body.appendChild(sidebar);
}

/**
 * Detect page navigation and reinitialize
 */
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('🔄 Page changed, reinitializing GrokGuard...');
    // Small delay to let the new page render
    setTimeout(() => {
      updateStatsBanner();
      monitorFeed();
    }, 500);
  }
}).observe(document, { subtree: true, childList: true });

/**
 * Start or restart the monitoring interval
 */
function startMonitoring() {
  // Clear existing interval if any
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
  }
  
  isMonitoringActive = true;
  console.log('✅ Feed monitoring active - scanning every 2s');
  
  updateStatsBanner();
  monitorFeed();
  
  // Start interval
  monitorIntervalId = setInterval(() => {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.error('Extension context lost - stopping monitoring');
      isMonitoringActive = false;
      clearInterval(monitorIntervalId);
      showExtensionError();
      return;
    }
    
    if (isMonitoringActive) {
      monitorFeed();
    }
  }, 2000);
}

/**
 * Heartbeat check - restart monitoring if it stopped
 */
function heartbeatCheck() {
  if (!isMonitoringActive || !monitorIntervalId) {
    // Check if extension is still valid
    if (chrome.runtime?.id) {
      console.log('🔄 Restarting monitoring...');
      startMonitoring();
    }
  }
}

// Start monitoring
startMonitoring();

// Heartbeat every 10 seconds to catch stuck states
setInterval(heartbeatCheck, 10000);

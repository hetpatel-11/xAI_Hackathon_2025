/**
 * GrokGuard Feed Monitor
 * Automatically scans and moderates X.com feed in real-time
 */

console.log('GrokGuard Feed Monitor loaded');

// Stats tracking
const stats = {
  scamsBlocked: 0,
  suspicious: 0,
  totalScanned: 0,
  factChecked: 0,
  misinformation: 0
};

// Collapsed state for the top stats banner (persisted per-origin)
let isBannerCollapsed = false;
try {
  const stored = localStorage.getItem('grokguardBannerCollapsed');
  if (stored !== null) {
    isBannerCollapsed = JSON.parse(stored);
  }
} catch (e) {
  isBannerCollapsed = false;
}

// Whether we've already rendered the banner structure
let statsBannerInitialized = false;

// Store fact-check results for posts
const factCheckResults = new Map();

// Track analyzed posts by unique ID to prevent re-scanning on scroll
const analyzedPostIds = new Set();

// Store blocked posts for viewing later
const blockedPosts = [];

// Store "flagged" (uncertain) posts for viewing later
const flaggedPosts = [];

// Store fact-checked posts for viewing later
const factCheckedPosts = [];

// Store misinformation posts for viewing later  
const misinformationPosts = [];

// Analysis queue to prevent overwhelming the API
const analysisQueue = [];
let isProcessingQueue = false;
const MAX_CONCURRENT_ANALYSES = 30; // Analyze up to 30 posts at once for aggressive scanning

// Cache for post states - using IndexedDB for persistence (db.js)
// postStateCache Map removed - now using savePost/getPost from db.js

// Keep track of monitoring state
let monitorIntervalId = null;
let isMonitoringActive = true;

// Track visible posts for priority analysis
const visiblePosts = new Set();

// Intersection Observer to track visible posts for priority processing
const visibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const postId = entry.target.getAttribute('data-post-id');
    if (postId) {
      if (entry.isIntersecting) {
        visiblePosts.add(postId);
      } else {
        visiblePosts.delete(postId);
      }
    }
  });
}, {
  threshold: 0.01, // Trigger when just 1% visible (very early detection)
  rootMargin: '2000px 0px 2000px 0px' // Scan 2000px above AND below viewport (aggressive pre-scanning)
});

// Monitor feed for new posts - AGGRESSIVE PRE-SCANNING
// Scans ALL posts in DOM, not just visible ones, for maximum coverage
function monitorFeed() {
  // Get ALL posts in the DOM (including those way above/below viewport)
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
      // Re-apply the cached state if DOM was recreated
      if (!post.hasAttribute('data-grokguard-processed')) {
        // Restore state from IndexedDB asynchronously
        getPost(postId).then(cachedState => {
          if (cachedState) {
            // Extract username for restoration
            const usernameLink = post.querySelector('a[href^="/"]');
            const username = usernameLink ? usernameLink.getAttribute('href')?.replace('/', '') : '';
            // Restore the UI state from IndexedDB
            restorePostState(post, postId, username, cachedState);
          }
        }).catch(err => {
          console.warn('Failed to restore post state:', err);
        });
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

    // Extract tweet URL for embedding
    const tweetUrl = statusLink ? 'https://x.com' + statusLink.getAttribute('href') : null;

    // Observe post for visibility tracking
    post.setAttribute('data-post-id', postId);
    visibilityObserver.observe(post);

    // Check if post is currently visible
    const isVisible = visiblePosts.has(postId);

    // Queue post for AI analysis (visible posts get priority)
    post.setAttribute('data-grokguard-processed', 'queued');
    queuePostForAnalysis(username, tweetText, post, postId, tweetUrl, isVisible);
  });

  // Update stats banner
  updateStatsBanner();
}

/**
 * Restore cached post state when DOM is recreated
 */
function restorePostState(post, postId, username, cachedState) {
  const { classification, confidence, reasoning, tweetUrl } = cachedState;

  console.log(`🔄 Restoring state for ${postId}: ${classification}`);

  if (classification === 'scam' || classification === 'suspicious') {
    blurPost(post, username, classification, confidence, reasoning);
    addFeedbackButtons(post, username, classification, confidence);
  } else if (classification === 'uncertain') {
    addWarningBadge(post, username, classification, confidence, reasoning);
    addFeedbackButtons(post, username, classification, confidence);
  } else {
    addCleanBadge(post);
  }
}

/**
 * Queue post for analysis to avoid overwhelming the API
 * Visible posts are prioritized for faster detection
 */
function queuePostForAnalysis(username, text, post, postId, tweetUrl, isVisible = false) {
  const queueItem = { username, text, post, postId, tweetUrl, isVisible, timestamp: Date.now() };

  // Prioritize visible posts - add to front of queue
  if (isVisible) {
    analysisQueue.unshift(queueItem);
  } else {
    analysisQueue.push(queueItem);
  }

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
          analyzePost(item.username, item.text, item.post, item.postId, item.tweetUrl),
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
async function analyzePost(username, text, post, postId, tweetUrl) {
  let loadingBadge = null;

  try {
    post.setAttribute('data-grokguard-processed', 'analyzing');

    // Show clear "Analyzing..." indicator
    loadingBadge = document.createElement('div');
    loadingBadge.className = 'grokguard-badge analyzing';
    loadingBadge.setAttribute('data-post-id', postId);
    loadingBadge.innerHTML = `
      <span style="display: inline-block; width: 8px; height: 8px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 6px;"></span>
      <span style="font-size: 11px; font-weight: 500;">Analyzing...</span>
    `;
    loadingBadge.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 6px 10px;
      background: #000;
      border: 1px solid #fff;
      border-radius: 6px;
      font-size: 11px;
      color: #fff;
      display: flex;
      align-items: center;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    
    // Add spin animation
    if (!document.getElementById('grokguard-spin-style')) {
      const style = document.createElement('style');
      style.id = 'grokguard-spin-style';
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    const postInner = post.querySelector('[data-testid="tweetText"]')?.parentElement?.parentElement;
    if (postInner) {
      postInner.style.position = 'relative';
      postInner.appendChild(loadingBadge);
    }

    const result = await analyzeWithAgents(username, text, post, tweetUrl);

    if (result && result.mock) {
      console.warn('GrokGuard using MOCK (API unreachable)');
    }

    // Mark this post as analyzed (by ID) so we don't re-scan on scroll
    analyzedPostIds.add(postId);

    if (result && result.verdict) {
      const classification = result.verdict.classification;
      const confidence = result.verdict.confidence;
      const reasoning = result.verdict.reasoning || 'No reasoning provided';

      // Save the state to IndexedDB for persistence
      try {
        await savePost(postId, {
          classification,
          confidence,
          reasoning,
          tweetUrl
        });
      } catch (err) {
        console.warn('Failed to save post to DB:', err);
      }

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

        // Track flagged posts so the "Flagged" counter can show them
        const tweetTextEl = post.querySelector('[data-testid="tweetText"]');
        const tweetText = tweetTextEl ? tweetTextEl.innerText : '';
        const statusLinkLocal = post.querySelector('a[href*="/status/"]');
        const postUrlLocal = statusLinkLocal ? 'https://x.com' + statusLinkLocal.getAttribute('href') : null;
        const existsFlagged = flaggedPosts.find(p => p.url === postUrlLocal);
        if (!existsFlagged) {
          flaggedPosts.push({
            username,
            text: tweetText,
            classification,
            confidence,
            reasoning,
            url: postUrlLocal,
            timestamp: new Date().toLocaleTimeString()
          });
        }
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
async function analyzeWithAgents(username, text, post, tweetUrl) {
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
      text: text,
      tweetUrl: tweetUrl
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
        <span class="stats-logo">GROKGUARD NEEDS REFRESH</span>
        <button onclick="location.reload()" class="refresh-btn">Refresh Page</button>
      </div>
    `;
  }
}

/**
 * Check if post is from a verified/credible source
 */
function isPostFromCredibleSource(post, username) {
  // Check for verified badge in DOM
  const verifiedBadge = post.querySelector('[data-testid="icon-verified"]') || 
                        post.querySelector('svg[viewBox*="20.75"]') || // Verified badge SVG pattern
                        post.querySelector('[aria-label*="Verified"]');
  
  if (verifiedBadge) {
    return true;
  }
  
  // Check username against known credible sources
  const credibleSources = [
    'forbes', 'bbc', 'cnn', 'reuters', 'ap', 'associatedpress', 'nytimes', 'washingtonpost',
    'wsj', 'bloomberg', 'theguardian', 'economist', 'ft', 'financialtimes', 'time',
    'newsweek', 'usatoday', 'abc', 'nbc', 'cbs', 'pbs', 'npr', 'axios', 'politico',
    'thehill', 'cnbc', 'marketwatch', 'techcrunch', 'wired', 'verge', 'ars',
    'scientificamerican', 'nature', 'science', 'nejm', 'lancet', 'who', 'cdc',
    'nasa', 'nsa', 'fbi', 'cia', 'whitehouse', 'state', 'defense', 'treasury',
    'sec', 'fda', 'nih', 'nsf', 'doe', 'epa', 'usda', 'ed', 'hhs', 'dhs',
    'elonmusk', 'xdevelopers', 'openai', 'anthropic', 'google', 'microsoft',
    'apple', 'meta', 'amazon', 'netflix', 'disney', 'tesla', 'spacex'
  ];
  
  const usernameLower = username.toLowerCase().replace('@', '');
  return credibleSources.some(source => usernameLower.includes(source) || source.includes(usernameLower));
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

  // Skip fact-checking for verified/credible sources to avoid false positives
  if (isPostFromCredibleSource(post, username)) {
    console.log(`⚠️ Skipping fact-check for credible source: @${username}`);
    return;
  }

  // Extract post URL before calling API
  const statusLink = post.querySelector('a[href*="/status/"]');
  const postUrl = statusLink ? 'https://x.com' + statusLink.getAttribute('href') : null;
  
  // Store post reference by URL in case DOM changes
  const postUrlForRefind = postUrl;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'factCheck',
      username: username,
      text: text,
      tweetUrl: postUrl
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
        
        // If misinformation detected, label the post (but don't collapse)
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
          
          // Re-find post in case DOM changed
          let targetPost = post;
          if (!targetPost || !targetPost.isConnected) {
            // Try to re-find post by URL
            if (postUrlForRefind) {
              const statusId = postUrlForRefind.split('/status/')[1];
              if (statusId) {
                const link = document.querySelector(`a[href*="/status/${statusId}"]`);
                if (link) {
                  targetPost = link.closest('[data-testid="tweet"]') || 
                              link.closest('article') ||
                              link.closest('[role="article"]');
                }
              }
            }
          }
          
          // Add label/badge for misinformation (but don't collapse)
          if (targetPost && targetPost.isConnected) {
            addMisinformationBadge(targetPost, username, response.data);
            showCommunityNote(targetPost, response.data);
            targetPost.setAttribute('data-grokguard-processed', 'misinformation');
          } else {
            console.warn('Could not find post element to label for misinformation:', username);
          }
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
  btn.innerHTML = `FACT-CHECK`;
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
    btn.innerHTML = `${factCheckData.verdict.replace('_', ' ').toUpperCase()}`;
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
    'true': '✓',
    'mostly_true': '✓',
    'mixed': '⚖',
    'mostly_false': '⚠',
    'false': '✕',
    'unverifiable': '?'
  };

  const overlay = document.createElement('div');
  overlay.className = 'grokguard-factcheck-overlay';
  overlay.innerHTML = `
    <div class="factcheck-modal">
      <div class="factcheck-header">
        <h2>FACT-CHECK RESULTS</h2>
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

  const existingOverlay = post.querySelector('.grokguard-blur-overlay') || post.querySelector('.grokguard-collapse-overlay');
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
  // Use collapse instead of blur
  collapsePost(post, username, classification, confidence, reasoning);
}

/**
 * Collapse a post with smooth animation instead of blurring
 */
function collapsePost(post, username, classification, confidence, reasoning) {
  // Remove any existing collapse overlay first
  const existingOverlay = post.querySelector('.grokguard-collapse-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Extract the post text for storage
  const tweetTextEl = post.querySelector('[data-testid="tweetText"]');
  const tweetText = tweetTextEl ? tweetTextEl.innerText : '';

  // Extract post link
  const statusLink = post.querySelector('a[href*="/status/"]');
  const postUrl = statusLink ? 'https://x.com' + statusLink.getAttribute('href') : null;

  // Store blocked post for later viewing (avoid duplicates)
  // Only add to blockedPosts if it's a scam/suspicious, not misinformation (misinformation is tracked separately)
  if (classification !== 'misinformation') {
    const existingBlock = blockedPosts.find(p => p.url === postUrl);
    if (!existingBlock) {
      blockedPosts.push({
        username,
        text: tweetText,
        classification,
        confidence,
        reasoning,
        url: postUrl,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  }

  // Store original height for expansion
  const originalHeight = post.offsetHeight;
  post.setAttribute('data-original-height', originalHeight.toString());
  post.setAttribute('data-grokguard-collapsed', 'true');

  // Ensure post has relative positioning and overflow hidden for smooth animation
  const computedStyle = window.getComputedStyle(post);
  if (computedStyle.position === 'static') {
  post.style.position = 'relative';
  }
  post.style.overflow = 'hidden';
  
  // Set up smooth, visible collapse animation (1.2 seconds for dramatic effect)
  post.style.transition = 'max-height 1.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.8s ease-out';
  post.style.maxHeight = originalHeight + 'px'; // Start at full height

  // Fade out all children except the overlay with staggered timing
  const children = Array.from(post.children).filter(child => 
    !child.classList.contains('grokguard-collapse-overlay')
  );
  children.forEach((child, index) => {
    child.style.transition = `opacity 0.6s ease-out ${index * 0.05}s, transform 0.8s ease-out ${index * 0.05}s`;
    child.style.opacity = '0';
    child.style.transform = 'translateY(-10px)'; // Slight upward movement
  });

  // Create collapse overlay (initially hidden, will fade in)
  const overlay = document.createElement('div');
  overlay.className = 'grokguard-collapse-overlay';
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.6s ease-in 0.4s'; // Fade in after collapse starts
  
  // Customize message based on classification
  const title = classification === 'misinformation' 
    ? 'Misinformation Detected by GrokGuard' 
    : 'Post Hidden by GrokGuard';
  const label = classification === 'misinformation'
    ? 'MISINFORMATION'
    : classification.toUpperCase();
  
  overlay.innerHTML = `
    <div class="grokguard-warning-box">
      <h3>${title}</h3>
      <p>@${username} · Flagged as ${label}</p>
      <p class="confidence">Confidence: ${confidence}%</p>
      <p class="reason">${reasoning.substring(0, 200)}${reasoning.length > 200 ? '...' : ''}</p>
      <button class="grokguard-show-anyway">Show Anyway</button>
      <button class="grokguard-learn-more" data-username="${username}">Learn More</button>
    </div>
  `;

  // Show anyway button - expand the post
  overlay.querySelector('.grokguard-show-anyway').addEventListener('click', (e) => {
    e.stopPropagation();
    expandPost(post);
    console.log('Post expanded by user');
  });

  // Learn more button
  overlay.querySelector('.grokguard-learn-more').addEventListener('click', (e) => {
    e.stopPropagation();
    // Trigger full analysis overlay
    window.postMessage({ type: 'GROKGUARD_ANALYZE', username }, '*');
  });

  post.appendChild(overlay);

  // Animate collapse with visible, smooth animation
  requestAnimationFrame(() => {
    // Ensure we start at full height
    post.style.maxHeight = originalHeight + 'px';
    
    requestAnimationFrame(() => {
      // Now collapse to 120px with smooth animation
      post.style.maxHeight = '120px';
      
      // Fade in overlay after a delay
      setTimeout(() => {
        overlay.style.opacity = '1';
      }, 400);
    });
  });

  console.log(`🔒 Post collapsed: @${username} (${classification}, ${confidence}%)`);
}

/**
 * Expand a collapsed post
 */
function expandPost(post) {
  const originalHeight = post.getAttribute('data-original-height');
  const overlay = post.querySelector('.grokguard-collapse-overlay');

  // Fade out overlay first
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.4s ease-out';
    setTimeout(() => overlay.remove(), 400);
  }

  // Get children to fade in
  const children = Array.from(post.children).filter(child => 
    !child.classList.contains('grokguard-collapse-overlay')
  );

  // Animate expansion with smooth animation
  const targetHeight = originalHeight ? parseInt(originalHeight) : 500;
  post.style.transition = 'max-height 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
  post.style.maxHeight = targetHeight + 'px';
  
  // Fade in children with staggered timing
  setTimeout(() => {
    children.forEach((child, index) => {
      child.style.transition = `opacity 0.6s ease-in ${index * 0.05}s, transform 0.8s ease-in ${index * 0.05}s`;
      child.style.opacity = '1';
      child.style.transform = 'translateY(0)';
    });
  }, 200);
  
  setTimeout(() => {
    post.removeAttribute('data-grokguard-collapsed');
    post.style.maxHeight = 'none';
    post.style.overflow = '';
    post.style.transition = '';
    
    // Reset children styles
    children.forEach(child => {
      child.style.opacity = '';
      child.style.transition = '';
      child.style.transform = '';
    });
  }, 1200);
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
    <span class="badge-icon"></span>
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
 * Add misinformation badge to post (label only, no collapse)
 */
function addMisinformationBadge(post, username, factCheckData) {
  // Don't add if already has a misinformation badge
  if (post.querySelector('.grokguard-misinfo-badge')) return;
  
  const verdict = factCheckData.verdict || 'false';
  const confidence = factCheckData.confidence || 0;
  const explanation = factCheckData.explanation || factCheckData.communityNote || 'Misinformation detected';
  
  const badge = document.createElement('div');
  badge.className = 'grokguard-misinfo-badge';
  badge.innerHTML = `
    <span class="misinfo-icon">⚠</span>
    <span class="misinfo-text">MISINFORMATION DETECTED</span>
    <span class="misinfo-confidence">${confidence}%</span>
    <div class="misinfo-tooltip">
      <strong>Fact-Check Result</strong><br>
      Verdict: ${verdict.replace('_', ' ').toUpperCase()}<br>
      Confidence: ${confidence}%<br>
      ${explanation.substring(0, 150)}...
    </div>
  `;

  // Insert at top of post
  const postInner = post.querySelector('[data-testid="tweetText"]')?.parentElement?.parentElement;
  if (postInner) {
    postInner.style.position = 'relative';
    postInner.insertBefore(badge, postInner.firstChild);
  } else {
    // Fallback: insert at top of post element
    post.style.position = 'relative';
    post.insertBefore(badge, post.firstChild);
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
    feedbackDiv.innerHTML = '<span class="feedback-thanks">THANKS FOR FEEDBACK!</span>';
  });

  // Thumbs down handler
  feedbackDiv.querySelector('.thumbs-down').addEventListener('click', () => {
    submitFeedback(username, classification, confidence, false);
    feedbackDiv.innerHTML = '<span class="feedback-thanks">FEEDBACK RECORDED</span>';
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

    console.log(`Feedback submitted for @${username}: ${wasCorrect ? 'Correct' : 'Incorrect'}`);
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

  // Render static structure once so hover/click doesn't flicker when stats change
  if (!statsBannerInitialized) {
  banner.innerHTML = `
    <div class="stats-content">
        <span class="stats-logo">GROKGUARD ACTIVE</span>
      <div class="stats-items">
        <span class="stat-item">
            <span class="stat-number" data-stat="scanned">0</span>
          <span class="stat-label">Scanned</span>
        </span>
          <span class="stat-item blocked clickable" id="grokguard-view-blocked" title="Click to view blocked posts">
            <span class="stat-number" data-stat="blocked">0</span>
          <span class="stat-label">Blocked</span>
        </span>
          <span class="stat-item clickable" id="grokguard-view-flagged" title="Click to view flagged posts">
            <span class="stat-number" data-stat="flagged">0</span>
          <span class="stat-label">Flagged</span>
        </span>
          <span class="stat-item clickable" id="grokguard-view-factchecked" title="Click to view fact-checked posts">
            <span class="stat-number" data-stat="factchecked">0</span>
            <span class="stat-label">Fact-Checked</span>
          </span>
          <span class="stat-item clickable" id="grokguard-view-misinfo" title="Click to view misinformation posts">
            <span class="stat-number" data-stat="misinfo">0</span>
            <span class="stat-label">Misinfo</span>
        </span>
      </div>
        <button class="stats-toggle" id="grokguard-toggle-banner" title="Collapse GrokGuard banner">▴</button>
    </div>
  `;

    // One-time click handlers
    const blockedBtn = banner.querySelector('#grokguard-view-blocked');
    if (blockedBtn) {
      blockedBtn.addEventListener('click', () => showSidebar('blocked'));
    }

    const flaggedBtn = banner.querySelector('#grokguard-view-flagged');
    if (flaggedBtn) {
      flaggedBtn.addEventListener('click', () => showSidebar('flagged'));
    }

    const factcheckedBtn = banner.querySelector('#grokguard-view-factchecked');
    if (factcheckedBtn) {
      factcheckedBtn.addEventListener('click', () => showSidebar('factchecked'));
    }
  
    const misinfoBtn = banner.querySelector('#grokguard-view-misinfo');
    if (misinfoBtn) {
      misinfoBtn.addEventListener('click', () => showSidebar('misinfo'));
    }

    const toggleBtn = banner.querySelector('#grokguard-toggle-banner');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isBannerCollapsed = !isBannerCollapsed;
        try {
          localStorage.setItem('grokguardBannerCollapsed', JSON.stringify(isBannerCollapsed));
        } catch (err) {
          // ignore storage errors
        }
        updateStatsBanner();
      });
    }

    statsBannerInitialized = true;
  }

  // Update counts without re-creating DOM
  const scannedEl = banner.querySelector('[data-stat="scanned"]');
  const blockedEl = banner.querySelector('[data-stat="blocked"]');
  const flaggedEl = banner.querySelector('[data-stat="flagged"]');
  const factcheckedEl = banner.querySelector('[data-stat="factchecked"]');
  const misinfoEl = banner.querySelector('[data-stat="misinfo"]');

  if (scannedEl) scannedEl.textContent = stats.totalScanned;
  if (blockedEl) blockedEl.textContent = stats.scamsBlocked;
  if (flaggedEl) flaggedEl.textContent = stats.suspicious;
  if (factcheckedEl) factcheckedEl.textContent = stats.factChecked;
  if (misinfoEl) misinfoEl.textContent = stats.misinformation;

  // Show/hide optional items based on counts
  const flaggedItem = banner.querySelector('#grokguard-view-flagged');
  if (flaggedItem) {
    flaggedItem.style.display = stats.suspicious > 0 ? 'flex' : 'none';
  }
  const factcheckedItem = banner.querySelector('#grokguard-view-factchecked');
  if (factcheckedItem) {
    factcheckedItem.style.display = stats.factChecked > 0 ? 'flex' : 'none';
  }
  const misinfoItem = banner.querySelector('#grokguard-view-misinfo');
  if (misinfoItem) {
    misinfoItem.style.display = stats.misinformation > 0 ? 'flex' : 'none';
  }

  // Apply collapsed state class & update toggle label
  const toggleBtnCurrent = banner.querySelector('#grokguard-toggle-banner');
  if (toggleBtnCurrent) {
    toggleBtnCurrent.textContent = isBannerCollapsed ? '▾' : '▴';
    toggleBtnCurrent.title = isBannerCollapsed ? 'Show GrokGuard stats' : 'Collapse GrokGuard banner';
  }

  if (isBannerCollapsed) {
    banner.classList.add('collapsed');
  } else {
    banner.classList.remove('collapsed');
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
    icon = '';
    posts = blockedPosts;
    emptyMessage = 'No posts blocked yet. GrokGuard is monitoring your feed.';
  } else if (type === 'flagged') {
    title = 'Flagged Posts';
    icon = '';
    posts = flaggedPosts;
    emptyMessage = 'No posts flagged yet.';
  } else if (type === 'factchecked') {
    title = 'Fact-Checked Posts';
    icon = '';
    posts = factCheckedPosts;
    emptyMessage = 'No posts with claims detected yet.';
  } else if (type === 'misinfo') {
    title = 'Misinformation Detected';
    icon = '';
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
        <div class="blocked-post-item" data-url="${post.url || ''}">
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
          ${post.url ? `<span class="blocked-post-link" style="cursor: pointer; color: #ffffff; text-decoration: underline;">View Original →</span>` : ''}
        </div>
      `).join('');
    } else {
      // Fact-checked or misinformation posts
      postsHtml = posts.map(post => {
        const verdictClass = post.verdict === 'false' || post.verdict === 'mostly_false' ? 'false' :
                            post.verdict === 'true' || post.verdict === 'mostly_true' ? 'true' : 'mixed';
        const verdictEmoji = {
          'true': '✓',
          'mostly_true': '✓',
          'mixed': '⚖',
          'mostly_false': '⚠',
          'false': '✕',
          'unverifiable': '?'
        }[post.verdict] || '?';
        
        return `
          <div class="blocked-post-item factcheck-item" data-url="${post.url || ''}">
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
            
            ${post.url ? `<span class="blocked-post-link" style="cursor: pointer; color: #ffffff; text-decoration: underline;">View Original →</span>` : ''}
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

  // Make sidebar items clickable to jump to the actual tweet
  const items = sidebar.querySelectorAll('.blocked-post-item');
  items.forEach(item => {
    // Prevent any default navigation behavior
    item.style.cursor = 'pointer';
    
    item.addEventListener('click', (e) => {
      // ALWAYS prevent default and stop propagation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const url = item.getAttribute('data-url');
      if (!url) {
        console.warn('No URL found for sidebar item');
        return;
      }
      
      // Scroll to the tweet on the current page
      focusTweetByUrl(url);
      
      // Return false to ensure no navigation
      return false;
    }, true); // Use capture phase to catch early
    
    // Also handle link clicks specifically (now spans, but just in case)
    const link = item.querySelector('.blocked-post-link');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const url = item.getAttribute('data-url');
        if (url) {
          focusTweetByUrl(url);
        }
        return false;
      }, true);
    }
  });

  // Close button handler
  sidebar.querySelector('.sidebar-close').addEventListener('click', () => {
    sidebar.remove();
  });

  document.body.appendChild(sidebar);
}

/**
 * Try to scroll to and highlight the tweet corresponding to a URL
 */
function focusTweetByUrl(url) {
  try {
    if (!url) {
      console.warn('No URL provided to focusTweetByUrl');
      return;
    }

    const parsed = new URL(url);
    const path = parsed.pathname; // e.g. /username/status/1234567890
    const statusId = path.split('/status/')[1]; // Extract status ID
    
    if (!statusId) {
      console.warn('Could not extract status ID from URL:', url);
      // Navigate to the URL in the same page instead of opening new tab
      window.location.href = url;
      return;
    }

    // Method 1: Find by exact href match (most reliable)
    const link = document.querySelector(`a[href="${path}"]`) || 
                 document.querySelector(`a[href*="/status/${statusId}"]`);
    
    if (link) {
      const tweet = link.closest('[data-testid="tweet"]') || 
                    link.closest('article') ||
                    link.closest('[role="article"]');
      
      if (tweet) {
        // Scroll to tweet with smooth animation
        tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight the tweet temporarily
        tweet.classList.add('grokguard-highlighted-tweet');
        tweet.style.transition = 'all 0.3s ease';
        setTimeout(() => {
          tweet.classList.remove('grokguard-highlighted-tweet');
        }, 3000);
        
        // Also try to focus/highlight the link itself
        link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        return;
      }
    }

    // Method 2: Find by status ID in any link within tweet containers
    const allTweets = document.querySelectorAll('[data-testid="tweet"], article[role="article"]');
    for (const tweet of allTweets) {
      const links = tweet.querySelectorAll('a[href*="/status/"]');
      for (const link of links) {
        if (link.getAttribute('href')?.includes(statusId)) {
          tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
          tweet.classList.add('grokguard-highlighted-tweet');
          setTimeout(() => {
            tweet.classList.remove('grokguard-highlighted-tweet');
          }, 3000);
          return;
        }
      }
    }

    // Method 3: Wait a bit and retry (tweets might be lazy-loaded)
    console.log('Tweet not found immediately, waiting for lazy load...');
    setTimeout(() => {
      const retryLink = document.querySelector(`a[href*="/status/${statusId}"]`);
      if (retryLink) {
        const retryTweet = retryLink.closest('[data-testid="tweet"]') || 
                          retryLink.closest('article') ||
                          retryLink.closest('[role="article"]');
        if (retryTweet) {
          retryTweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
          retryTweet.classList.add('grokguard-highlighted-tweet');
          setTimeout(() => {
            retryTweet.classList.remove('grokguard-highlighted-tweet');
          }, 3000);
          return;
        }
      }
      
      // If still not found, show a message but DON'T navigate
      console.warn('Tweet not found on current page. It may not be loaded yet. Try scrolling to load more tweets.');
      // Optionally show a toast notification
      const toast = document.createElement('div');
      toast.textContent = 'Tweet not found on current page. Try scrolling to load more.';
      toast.style.cssText = 'position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: #000; color: #fff; padding: 12px 24px; border: 1px solid #fff; border-radius: 8px; z-index: 999999;';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }, 500);
  } catch (e) {
    console.error('Error in focusTweetByUrl:', e);
    // Don't navigate on error - just log it
  }
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
  console.log('Feed monitoring active - scanning every 200ms for instant detection');

  updateStatsBanner();
  monitorFeed();

  // Start interval - scan every 200ms for ultra-fast detection as user scrolls
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
  }, 200); // Ultra-fast scanning for instant detection during scrolling
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

// Add scroll listener for instant detection when user scrolls
let scrollTimeout;
window.addEventListener('scroll', () => {
  // Debounce scroll events - scan immediately on scroll, then wait 100ms
  clearTimeout(scrollTimeout);
  monitorFeed(); // Immediate scan on scroll
  scrollTimeout = setTimeout(() => {
    monitorFeed(); // Follow-up scan after scroll settles
  }, 100);
}, { passive: true });

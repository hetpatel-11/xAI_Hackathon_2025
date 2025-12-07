/**
 * GrokGuard Content Script
 * Injects "Analyze with GrokGuard" button on X.com profiles
 */

console.log('GrokGuard extension loaded');

// Extract username from current profile page
function getProfileUsername() {
  // X.com profile URLs: https://x.com/username
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/([^\/]+)/);

  if (match && match[1] && !['home', 'explore', 'notifications', 'messages', 'settings', 'i'].includes(match[1])) {
    return match[1];
  }

  return null;
}

// Create and inject the analyze button
function injectAnalyzeButton() {
  const username = getProfileUsername();
  if (!username) return;

  // Check if button already exists
  if (document.querySelector('#grokguard-analyze-btn')) return;

  // Find the profile actions container - try multiple selectors
  let actionsContainer = document.querySelector('[data-testid="userActions"]');

  // Fallback: Look for any element containing a Follow button
  if (!actionsContainer) {
    const followButton = document.querySelector('[data-testid*="follow"]');
    if (followButton) {
      actionsContainer = followButton.parentElement;
    }
  }

  // Fallback: Look for the header actions area
  if (!actionsContainer) {
    actionsContainer = document.querySelector('[role="button"]')?.parentElement?.parentElement;
  }

  if (!actionsContainer) {
    console.log('Profile actions container not found, will retry');
    return;
  }

  // Create the analyze button
  const analyzeBtn = document.createElement('button');
  analyzeBtn.id = 'grokguard-analyze-btn';
  analyzeBtn.className = 'grokguard-btn';
  analyzeBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
    <span>Analyze</span>
  `;

  analyzeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    analyzeProfile(username);
  });

  // Insert button as first child
  actionsContainer.insertBefore(analyzeBtn, actionsContainer.firstChild);
  console.log(`Injected analyze button for @${username}`);
}

// Show loading overlay
function showOverlay(username) {
  // Remove existing overlay
  const existing = document.getElementById('grokguard-overlay');
  if (existing) existing.remove();

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'grokguard-overlay';
  overlay.innerHTML = `
    <div class="grokguard-overlay-content">
      <div class="grokguard-header">
        <h3>GROKGUARD ANALYSIS</h3>
        <button class="grokguard-close">&times;</button>
      </div>

      <div class="grokguard-body">
        <div class="grokguard-section">
          <h4>Analyzing @${username}</h4>
          <div class="grokguard-loading">
            <div class="spinner"></div>
            <p>Running autonomous agent investigation...</p>
          </div>
        </div>

        <div id="grokguard-investigation" class="grokguard-section" style="display:none;">
          <h4>INVESTIGATION PLAN</h4>
          <div id="investigation-content"></div>
        </div>

        <div id="grokguard-debate" class="grokguard-section" style="display:none;">
          <h4>MULTI-TURN DEBATE</h4>
          <div id="debate-content"></div>
        </div>

        <div id="grokguard-verdict" class="grokguard-section" style="display:none;">
          <h4>FINAL VERDICT</h4>
          <div id="verdict-content"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close button handler
  overlay.querySelector('.grokguard-close').addEventListener('click', () => {
    overlay.remove();
  });

  // Close on outside click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Update overlay with investigation results
function updateOverlay(data) {
  const { investigation, rounds, verdict } = data;

  // Hide loading
  document.querySelector('.grokguard-loading').style.display = 'none';

  // Show investigation
  const investigationSection = document.getElementById('grokguard-investigation');
  investigationSection.style.display = 'block';

  const investigationContent = document.getElementById('investigation-content');
  investigationContent.innerHTML = `
    <p class="reasoning">${investigation.plan.reasoning}</p>
    <div class="tools-list">
      ${investigation.plan.actions.map(action => `
        <div class="tool-item ${action.priority}">
          <span class="tool-name">${action.tool}</span>
          <span class="tool-priority">${action.priority}</span>
          <p class="tool-reason">${action.reason}</p>
        </div>
      `).join('')}
    </div>
    ${investigation.userProfile ? `
      <div class="profile-summary">
        <p><strong>Legitimacy Score:</strong> <span class="score">${investigation.userProfile.enrichedData.legitimacyScore}/100</span></p>
        <p><strong>Risk Level:</strong> <span class="risk-${investigation.userProfile.enrichedData.riskLevel.toLowerCase()}">${investigation.userProfile.enrichedData.riskLevel}</span></p>
      </div>
    ` : ''}
  `;

  // Show debate rounds
  if (rounds && rounds.length > 0) {
    const debateSection = document.getElementById('grokguard-debate');
    debateSection.style.display = 'block';

    const debateContent = document.getElementById('debate-content');
    debateContent.innerHTML = rounds.map(round => `
      <div class="debate-round">
        <div class="round-header">Round ${round.round}</div>
        <div class="debate-arguments">
          <div class="prosecutor">
            <div class="agent-label">PROSECUTOR</div>
            <div class="confidence">Confidence: ${round.prosecutorConfidence}%</div>
            <div class="argument">${round.prosecutorArgument.substring(0, 200)}...</div>
          </div>
          <div class="defender">
            <div class="agent-label">DEFENDER</div>
            <div class="confidence">Confidence: ${round.defenderConfidence}%</div>
            <div class="argument">${round.defenderArgument.substring(0, 200)}...</div>
          </div>
        </div>
        <div class="convergence">Convergence: ${round.convergenceScore}%</div>
      </div>
    `).join('');
  }

  // Show verdict
  const verdictSection = document.getElementById('grokguard-verdict');
  verdictSection.style.display = 'block';

  const verdictContent = document.getElementById('verdict-content');
  const verdictClass = verdict.classification.toLowerCase();
  verdictContent.innerHTML = `
    <div class="verdict-summary ${verdictClass}">
      <div class="classification">${verdict.classification.toUpperCase()}</div>
      <div class="confidence">Confidence: ${verdict.confidence}%</div>
      <div class="action">Recommended: ${verdict.recommendedAction.toUpperCase()}</div>
    </div>
    <p class="verdict-reasoning">${verdict.reasoning}</p>
  `;
}

// Analyze profile by sending message to background script
async function analyzeProfile(username) {
  console.log(`Analyzing @${username}`);

  // Show overlay with loading state
  showOverlay(username);

  try {
    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'analyzeProfile',
      username: username
    });

    if (response.success) {
      updateOverlay(response.data);
    } else {
      throw new Error(response.error || 'Analysis failed');
    }
  } catch (error) {
    console.error('Analysis error:', error);

    // Show error in overlay
    const errorMessage = error.message.includes('Extension context invalidated')
      ? 'Extension was reloaded. Please refresh this page to continue.'
      : error.message;

    document.querySelector('.grokguard-loading').innerHTML = `
      <div class="error">
        <p>ANALYSIS FAILED</p>
        <p>${errorMessage}</p>
        ${error.message.includes('Extension context invalidated') ? '<p style="margin-top: 12px; font-size: 12px;">Press Cmd+R (Mac) or Ctrl+R (Windows) to refresh</p>' : ''}
      </div>
    `;
  }
}

// Initialize extension when page loads
function init() {
  // Inject button immediately
  injectAnalyzeButton();

  // Watch for URL changes (X.com is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('URL changed, re-injecting button');
      setTimeout(injectAnalyzeButton, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

  // Also retry injection periodically (in case DOM loads slowly)
  setInterval(injectAnalyzeButton, 2000);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

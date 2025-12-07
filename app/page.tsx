'use client';

import { useState, useEffect, useRef } from 'react';

interface AnalyzedPost {
  id: string;
  username: string;
  text: string;
  classification: 'legitimate' | 'suspicious' | 'scam' | 'uncertain';
  confidence: number;
  reasoning: string;
  timestamp: string;
  tweetUrl?: string;
  factCheck?: {
    hasClaim: boolean;
    verdict?: string;
    claims?: string[];
    explanation?: string;
    sources?: string[];
  };
}

interface Stats {
  totalScanned: number;
  scamsBlocked: number;
  suspicious: number;
  factChecked: number;
  misinformation: number;
}

interface ActivityLog {
  time: string;
  text: string;
  type: string;
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#000000',
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#fff',
    position: 'relative' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#fff',
  },
  subtitle: {
    color: '#666',
    fontSize: '14px',
  },
  statusBadge: (connected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '999px',
    background: '#000',
    border: '1px solid #fff',
  }),
  statusDot: (connected: boolean) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: connected ? '#fff' : '#666',
    animation: connected ? 'pulse 2s infinite' : 'none',
  }),
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '16px',
    marginBottom: '32px',
  },
  statCard: {
    background: '#000',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '24px',
  },
  statHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '36px',
    fontWeight: 700,
    color: '#fff',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '24px',
  },
  card: {
    background: '#000',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '24px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
    color: '#fff',
  },
  tabContainer: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  tab: (active: boolean) => ({
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    background: active ? '#fff' : '#000',
    color: active ? '#000' : '#fff',
    transition: 'all 0.2s',
  }),
  postList: {
    maxHeight: '500px',
    overflowY: 'auto' as const,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#666',
  },
  postCard: (classification: string) => {
    const isBlocked = classification === 'scam' || classification === 'suspicious';
    return {
      background: '#000',
      border: `1px solid ${isBlocked ? '#fff' : '#333'}`,
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    };
  },
  badge: (classification: string) => {
    const isBlocked = classification === 'scam' || classification === 'suspicious';
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 12px',
      borderRadius: '999px',
      background: isBlocked ? '#fff' : '#000',
      border: '1px solid #fff',
      color: isBlocked ? '#000' : '#fff',
      fontSize: '11px',
      fontWeight: 600,
    };
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: '#000',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    width: '100%',
    textAlign: 'left' as const,
  },
  agentStatus: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: '#000',
    border: '1px solid #333',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  activityItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px',
    borderRadius: '4px',
    fontSize: '12px',
    borderBottom: '1px solid #222',
  },
};

// Component to show tweet link
function TweetLink({ tweetUrl }: { tweetUrl?: string }) {
  if (!tweetUrl) return null;

  return (
    <div style={{
      padding: '12px',
      background: '#111',
      borderRadius: '8px',
      marginBottom: '12px',
      border: '1px solid #333'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#fff',
            fontSize: '14px',
            textDecoration: 'none',
            fontWeight: 500,
            border: '1px solid #333',
            padding: '8px 12px',
            borderRadius: '6px',
            display: 'inline-block'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
            e.currentTarget.style.borderColor = '#fff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.textDecoration = 'none';
            e.currentTarget.style.borderColor = '#333';
          }}
        >
          View Original Post on X
        </a>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalScanned: 0,
    scamsBlocked: 0,
    suspicious: 0,
    factChecked: 0,
    misinformation: 0,
  });
  const [posts, setPosts] = useState<AnalyzedPost[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'blocked' | 'flagged' | 'factchecked' | 'misinfo'>('all');
  const [isConnected, setIsConnected] = useState(false);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);

  // Fetch stats and posts
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/stats', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-cache',
        });
        
        if (res.ok) {
          const data = await res.json();
          
          // Always update stats, even if they're 0
          setStats({
            totalScanned: data.stats?.totalScanned || 0,
            scamsBlocked: data.stats?.scamsBlocked || 0,
            suspicious: data.stats?.suspicious || 0,
            factChecked: data.stats?.factChecked || 0,
            misinformation: data.stats?.misinformation || 0,
          });
          
          setPosts(data.recentPosts || []);
          setActivityLog(data.activityLog || []);
          setIsConnected(true);
        } else {
          console.error('Failed to fetch stats:', res.status, res.statusText);
          setIsConnected(false);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
        setIsConnected(false);
      }
    };

    // Fetch immediately
    fetchStats();
    
    // Then fetch every 2 seconds
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  const filteredPosts = posts.filter(post => {
    if (activeTab === 'all') return true;
    if (activeTab === 'blocked') return post.classification === 'scam';
    if (activeTab === 'flagged') return post.classification === 'suspicious' || post.classification === 'uncertain';
    if (activeTab === 'factchecked') return post.factCheck?.hasClaim;
    if (activeTab === 'misinfo') {
      return post.factCheck?.hasClaim && 
             (post.factCheck.verdict === 'false' || post.factCheck.verdict === 'mostly_false');
    }
    return true;
  });

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .hover-scale:hover { border-color: #fff !important; }
        .hover-bg:hover { background: #111 !important; }

        /* Twitter embed styling */
        .twitter-tweet {
          margin: 0 !important;
        }
        .twitter-tweet-rendered {
          margin: 0 !important;
        }
      `}</style>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="8" fill="#fff"/>
            <path d="M14 24L20 30L34 16" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <h1 style={styles.title}>GrokGuard</h1>
            <p style={styles.subtitle}>AI Content Moderation Dashboard</p>
          </div>
        </div>
        <div style={styles.statusBadge(isConnected)}>
          <div style={styles.statusDot(isConnected)} />
          <span style={{ color: '#fff', fontSize: '14px' }}>
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </header>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statHeader}>
            <span style={styles.statLabel}>Scanned</span>
          </div>
          <div style={styles.statValue}>{stats.totalScanned}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statHeader}>
            <span style={styles.statLabel}>Blocked</span>
          </div>
          <div style={styles.statValue}>{stats.scamsBlocked}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statHeader}>
            <span style={styles.statLabel}>Flagged</span>
          </div>
          <div style={styles.statValue}>{stats.suspicious}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statHeader}>
            <span style={styles.statLabel}>Fact-Checked</span>
          </div>
          <div style={styles.statValue}>{stats.factChecked}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statHeader}>
            <span style={styles.statLabel}>Misinfo</span>
          </div>
          <div style={styles.statValue}>{stats.misinformation}</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainGrid}>
        {/* Feed Section */}
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={styles.cardTitle}>Analyzed Posts</h2>
            <div style={styles.tabContainer}>
              <button style={styles.tab(activeTab === 'all')} onClick={() => setActiveTab('all')}>All</button>
              <button style={styles.tab(activeTab === 'blocked')} onClick={() => setActiveTab('blocked')}>Blocked</button>
              <button style={styles.tab(activeTab === 'flagged')} onClick={() => setActiveTab('flagged')}>Flagged</button>
              <button style={styles.tab(activeTab === 'factchecked')} onClick={() => setActiveTab('factchecked')}>Fact-Checked</button>
              <button style={styles.tab(activeTab === 'misinfo')} onClick={() => setActiveTab('misinfo')}>Misinfo</button>
            </div>
          </div>

          <div style={styles.postList}>
            {filteredPosts.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>○</div>
                <p>No posts yet. Browse X.com with the extension active.</p>
              </div>
            ) : (
              filteredPosts.map((post, i) => (
                <div
                  key={post.id || i}
                  className="hover-scale"
                  style={styles.postCard(post.classification)}
                  onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                >
                  {/* GrokGuard Badge at Top */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#666' }}>GrokGuard Analysis • {post.timestamp}</span>
                    </div>
                    <div style={styles.badge(post.classification)}>
                      <span>{post.classification.toUpperCase()}</span>
                      <span style={{ opacity: 0.7 }}>{post.confidence}%</span>
                    </div>
                  </div>

                  {/* Post Content */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600, color: '#fff' }}>@{post.username}</span>
                    </div>
                    <p style={{ color: '#999', fontSize: '14px', lineHeight: 1.5, marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                      {post.text || 'No text content available'}
                    </p>
                    {post.tweetUrl && (
                      <div style={{ marginTop: '8px' }}>
                        <TweetLink tweetUrl={post.tweetUrl} />
                      </div>
                    )}
                  </div>

                  {expandedPost === post.id && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #333' }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                        AI Reasoning:
                      </div>
                      <p style={{ fontSize: '14px', color: '#ccc', lineHeight: 1.6 }}>{post.reasoning}</p>
                      
                      {post.factCheck?.hasClaim && (
                        <div style={{ marginTop: '16px', padding: '12px', background: '#111', border: '1px solid #333', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ color: '#fff', fontWeight: 600 }}>
                              Fact-Check: {post.factCheck.verdict?.toUpperCase()}
                            </span>
                          </div>
                          {post.factCheck.claims && (
                            <p style={{ fontSize: '12px', color: '#888' }}>
                              Claims: {post.factCheck.claims.join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={styles.sidebar}>
          {/* Quick Actions */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Quick Actions</h3>
            <button className="hover-bg" style={styles.actionBtn} onClick={() => window.location.reload()}>
              ↻ Refresh Stats
            </button>
            <button className="hover-bg" style={{ ...styles.actionBtn, marginTop: '8px' }}>
              ↓ Export Report
            </button>
            <button className="hover-bg" style={{ ...styles.actionBtn, marginTop: '8px' }}>
              ⚙ Settings
            </button>
          </div>

          {/* Agent Status */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Agent Status</h3>
            <div style={styles.agentStatus}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Instant Analyzer</div>
                <div style={{ fontSize: '12px', color: '#666' }}>grok-3-mini</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />
                <span style={{ fontSize: '12px' }}>active</span>
              </div>
            </div>
            <div style={styles.agentStatus}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Fact Checker</div>
                <div style={{ fontSize: '12px', color: '#666' }}>grok-4-1-fast</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />
                <span style={{ fontSize: '12px' }}>active</span>
              </div>
            </div>
            <div style={styles.agentStatus}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Debate System</div>
                <div style={{ fontSize: '12px', color: '#666' }}>grok-4-1-fast</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#666' }} />
                <span style={{ fontSize: '12px' }}>standby</span>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Activity Log</h3>
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {activityLog.length === 0 ? (
                <p style={{ color: '#666', fontSize: '12px' }}>No activity yet</p>
              ) : (
                activityLog.slice(0, 15).map((activity, i) => (
                  <div key={i} style={styles.activityItem}>
                    <span style={{ color: '#666', minWidth: '70px', fontSize: '11px' }}>{activity.time}</span>
                    <span style={{ color: '#fff', fontSize: '12px' }}>{activity.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

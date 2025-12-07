/**
 * IndexedDB wrapper for GrokGuard
 * Persistent storage for post analysis results
 */

const DB_NAME = 'GrokGuardDB';
const DB_VERSION = 1;
const STORE_NAME = 'analyzedPosts';

let db = null;

/**
 * Initialize the database
 */
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      console.log('GrokGuard DB initialized');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object store for posts
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'postId' });
        store.createIndex('classification', 'classification', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('📦 Created analyzedPosts store');
      }
    };
  });
}

/**
 * Save post analysis to DB
 */
async function savePost(postId, data) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const postData = {
      postId,
      ...data,
      timestamp: Date.now()
    };

    const request = store.put(postData);
    request.onsuccess = () => resolve(postData);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get post analysis from DB
 */
async function getPost(postId) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(postId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all posts by classification
 */
async function getPostsByClassification(classification) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('classification');
    const request = index.getAll(classification);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear old posts (keep last 7 days)
 */
async function clearOldPosts() {
  if (!db) await initDB();

  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const range = IDBKeyRange.upperBound(sevenDaysAgo);
    const request = index.openCursor(range);

    let deleted = 0;
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        deleted++;
        cursor.continue();
      } else {
        console.log(`Cleaned up ${deleted} old posts`);
        resolve(deleted);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// Initialize DB when script loads
initDB().catch(err => console.error('DB init error:', err));

// Clean up old posts once per day
setInterval(clearOldPosts, 24 * 60 * 60 * 1000);

// ==========================================================================
// Centralized Application Logic (app.js)
// ==========================================================================

const flipSound = new Audio('sfx/page-flip-01a.mp3');
flipSound.preload = 'auto';

// Helper Functions
function getCleanPath(pathname) {
  return pathname.split('#')[0].split('?')[0].toLowerCase();
}

function isBookCoverAllowed(pathname) {
  const p = getCleanPath(pathname);
  return (
    p === '/' ||
    p.endsWith('index.html') ||
    p.endsWith('404.html') ||
    p.endsWith('admin.html')
  );
}

function isNormalPageFlipAllowed(pathname) {
  const p = getCleanPath(pathname);
  return p.endsWith('about.html') || p.endsWith('reading-list.html');
}

// Helper: XSS Sanitization
function escapeHtml(str) {
  return str ? String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}

// 1. Supabase Initialization
const SUPABASE_URL = 'https://gpjzoiaikuwnfobwtftz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwanpvaWFpa3V3bmZvYnd0ZnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjAzMjAsImV4cCI6MjEwNDczNjMyMH0.0eDDirX0hWw0x0QTSIiHQL4Y9MMNzqnbz1SUgS_aehE';

let db = null;
if (typeof supabase !== 'undefined') {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 2. Navigation Link Listener
document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  
  if (link && link.href && link.origin === window.location.origin && link.target !== '_blank') {
    e.preventDefault();
    const destination = link.href;
    const destUrl = new URL(destination, window.location.href);
    const container = document.querySelector('.page-turn-container') || document.querySelector('.container');

    flipSound.currentTime = 0;
    flipSound.play().catch(() => {});

    if (container && isNormalPageFlipAllowed(destUrl.pathname)) {
      container.classList.add('page-turn-flip-out');
    }

    const delay = isNormalPageFlipAllowed(destUrl.pathname) ? 500 : 250;
    setTimeout(() => {
      window.location.href = destination;
    }, delay);
  }
});

// 3. Main DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.page-turn-container') || document.querySelector('.container');
  const currentPath = window.location.pathname;

  // Page Transition setup
  if (container && isNormalPageFlipAllowed(currentPath)) {
    container.classList.add('page-turn-flip-in');
    requestAnimationFrame(() => {
      setTimeout(() => {
        container.classList.remove('page-turn-flip-in');
      }, 50);
    });
  }

  // --- GUESTBOOK LOGIC (index.html) ---
  const commentForm = document.getElementById('commentForm');
  const commentsList = document.getElementById('commentsList');

  async function loadComments() {
    if (!commentsList) return;
    
    if (!db) {
      commentsList.innerHTML = '<p style="color: #b91c1c;">Error: Supabase client failed to initialize.</p>';
      return;
    }

    const { data, error } = await db
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase fetch error:', error);
      commentsList.innerHTML = `<p style="color: #b91c1c;">Failed to load comments: ${escapeHtml(error.message)}</p>`;
      return;
    }

    if (!data || data.length === 0) {
      commentsList.innerHTML = '<p style="font-style: italic; color: #8a857b;">No comments yet. Be the first!</p>';
      return;
    }

    commentsList.innerHTML = data.map(c => `
      <div class="comment-entry" style="margin-bottom: 1.25rem; border-bottom: 1px dashed #dcd6cd; padding-bottom: 0.75rem;">
        <div class="comment-header" style="font-weight: bold; color: #3a362e;">${escapeHtml(c.nickname)}</div>
        <div class="comment-body" style="color: #4a463d; margin-top: 0.25rem;">${escapeHtml(c.content)}</div>
      </div>
    `).join('');
  }

  if (commentForm && commentsList) {
    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nicknameInput = document.getElementById('nickname');
      const contentInput = document.getElementById('content');
      
      const nickname = nicknameInput.value.trim();
      const content = contentInput.value.trim();

      if (!nickname || !content) return;

      const { error } = await db.from('comments').insert([{ nickname, content }]);

      if (error) {
        alert('Failed to post comment: ' + error.message);
        console.error('Insert error:', error);
      } else {
        nicknameInput.value = '';
        contentInput.value = '';
        await loadComments();
      }
    });

    loadComments();
  }

  // --- READING LIST LOGIC (reading-list.html) ---
  const readBooksContainer = document.getElementById('readBooksContainer');
  if (readBooksContainer && db) {
    async function loadBooks() {
      const { data, error } = await db
        .from('read_books')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) {
        readBooksContainer.innerHTML = '<p class="empty-state">Nothing logged yet.</p>';
        return;
      }

      readBooksContainer.innerHTML = data.map(b => `
        <div class="book-item">
          <div class="book-title">${escapeHtml(b.book_title)}</div>
          <div class="book-author">by ${escapeHtml(b.book_author)}</div>
          ${b.notes ? `<div class="book-notes">${escapeHtml(b.notes)}</div>` : ''}
        </div>
      `).join('');
    }
    loadBooks();
  }

  // --- ADMIN LOGIC (admin.html) ---
  const bookForm = document.getElementById('bookForm');
  const statusMessage = document.getElementById('statusMessage');
  if (bookForm && statusMessage && db) {
    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      statusMessage.textContent = 'Saving...';

      const title = document.getElementById('bookTitle').value;
      const author = document.getElementById('bookAuthor').value;
      const notes = document.getElementById('bookNotes').value;

      const { error } = await db.from('read_books').insert([
        { book_title: title, book_author: author, notes: notes }
      ]);

      if (!error) {
        statusMessage.textContent = 'Success! Book logged to your reading list.';
        bookForm.reset();
      } else {
        statusMessage.textContent = 'Error saving book. Check Supabase RLS policies.';
      }
    });
  }
});

// 4. Book Loader Overlay Fade Out (Only triggers if loader element exists)
window.addEventListener('load', () => {
  const currentPath = window.location.pathname;
  
  if (isBookCoverAllowed(currentPath)) {
    const bookCoverLoader = document.getElementById('book-loader') || document.getElementById('book-cover-loader');
    if (bookCoverLoader) {
      setTimeout(() => {
        bookCoverLoader.classList.add('fade-out');
      }, 1200);
    }
  }
});

// 5. BACK TO TOP BOOKMARK FUNCTIONALITY
  const backToTopBtn = document.getElementById('backToTopBookmark');
  
  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    });

    backToTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });

  // 6. WRITE & SHARE STORY LOGIC (write-n-share-story.html) 
  const storyForm = document.getElementById('storyForm');
  const storyStatus = document.getElementById('storyStatus');

  if (storyForm && storyStatus && db) {
    storyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      storyStatus.style.color = '#7a756b';
      storyStatus.textContent = 'Publishing your story...';

      const author = document.getElementById('storyAuthor').value.trim();
      const title = document.getElementById('storyTitle').value.trim();
      const content = document.getElementById('storyContent').value.trim();

      // Insert directly into the new 'stories' table
      const { error } = await db.from('stories').insert([
        { author, title, content }
      ]);

      if (!error) {
        storyStatus.style.color = '#2e6f40';
        storyStatus.textContent = 'Story published successfully! Redirecting...';
        storyForm.reset();
        
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1500);
      } else {
        console.error('Supabase Insert Error:', error);
        storyStatus.style.color = '#b91c1c';
        storyStatus.textContent = 'Failed to publish: ' + error.message;
      }
    });
  }

  // --- 7.DISPLAY STORIES LOGIC ---
  // --- DISPLAY & SORT/SEARCH STORIES LOGIC ---
  const storiesContainer = document.getElementById('storiesContainer');
  const storySearch = document.getElementById('storySearch');
  const storySort = document.getElementById('storySort');

  let rawStoriesData = []; // Holds state for fast local filtering

  function renderStoriesList(stories) {
    if (!storiesContainer) return;

    if (!stories || stories.length === 0) {
      storiesContainer.innerHTML = '<p style="font-style: italic; color: #8a857b;">No matching stories found.</p>';
      return;
    }

    storiesContainer.innerHTML = stories.map(story => `
      <article class="published-story" style="margin-bottom: 2rem; border-bottom: 1px dashed #dcd6cd; padding-bottom: 1.5rem;">
        <h3 style="font-family: 'Libre Baskerville', serif; font-size: 1.25rem; color: #3a362e; margin-bottom: 0.25rem;">
          ${escapeHtml(story.title)}
        </h3>
        <div class="story-meta" style="font-size: 0.85rem; color: #7a756b; margin-bottom: 1rem;">
          By <strong>${escapeHtml(story.author)}</strong> • ${new Date(story.created_at).toLocaleDateString()}
        </div>
        <div class="story-body" style="white-space: pre-wrap; color: #4a463d; line-height: 1.7; font-size: 1rem;">
          ${escapeHtml(story.content)}
        </div>
      </article>
    `).join('');
  }

  function applyFilterAndSort() {
    if (!rawStoriesData.length) return;

    const query = storySearch ? storySearch.value.toLowerCase().trim() : '';
    const sortMode = storySort ? storySort.value : 'newest';

    // 1. Filter by Search Query
    let filtered = rawStoriesData.filter(s => 
      (s.title && s.title.toLowerCase().includes(query)) ||
      (s.author && s.author.toLowerCase().includes(query)) ||
      (s.content && s.content.toLowerCase().includes(query))
    );

    // 2. Sort Logic
    filtered.sort((a, b) => {
      switch (sortMode) {
        case 'title-asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'title-desc':
          return (b.title || '').localeCompare(a.title || '');
        case 'author-asc':
          return (a.author || '').localeCompare(b.author || '');
        case 'author-desc':
          return (b.author || '').localeCompare(a.author || '');
        case 'newest':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    renderStoriesList(filtered);
  }

  async function loadStories() {
    if (!storiesContainer || !db) return;

    const { data, error } = await db
      .from('stories')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase stories fetch error:', error);
      storiesContainer.innerHTML = `<p style="color: #b91c1c;">Failed to load stories: ${escapeHtml(error.message)}</p>`;
      return;
    }

    rawStoriesData = data || [];
    applyFilterAndSort();
  }

  // Event Listeners for controls
  if (storySearch) {
    storySearch.addEventListener('input', applyFilterAndSort);
  }
  if (storySort) {
    storySort.addEventListener('change', applyFilterAndSort);
  }

  // Load initial stories
  loadStories();

}
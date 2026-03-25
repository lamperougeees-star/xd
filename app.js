// ==================== STATE ====================
let currentUser = null;
let currentPage = 'home';
let currentCategory = 'Все';
let currentSort = 'newest';
let currentListingPage = 1;
let activeChatId = null;
let chatPollInterval = null;
let unreadPollInterval = null;

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  loadCategories();

  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page) {
      showPage(e.state.page, false);
      if (e.state.page === 'home') loadListings();
    }
  });

  // Check URL hash for initial route
  const hash = location.hash.replace('#', '');
  if (hash) {
    if (hash.startsWith('listing/')) {
      const id = hash.split('/')[1];
      showPage('listing', false);
      loadListingDetail(id);
    } else {
      navigate(hash, false);
    }
  } else {
    loadListings();
  }

  // Poll unread messages
  startUnreadPoll();
});

// ==================== AUTH ====================
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    currentUser = data.user;
    updateNavAuth();
  } catch (e) {}
}

function updateNavAuth() {
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  };
  const loggedIn = !!currentUser;
  const isAdmin = currentUser && currentUser.isAdmin;

  show('nav-auth-btn', !loggedIn);
  show('mob-auth-btn', !loggedIn);
  show('nav-logout-btn', loggedIn);
  show('mob-logout-btn', loggedIn);
  show('nav-profile-btn', loggedIn);
  show('mob-profile-btn', loggedIn);
  show('nav-chats-btn', loggedIn);
  show('mob-chats-btn', loggedIn);
  show('nav-admin-btn', isAdmin);
  show('mob-admin-btn', isAdmin);
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}

async function doLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  const email = document.getElementById('l-email').value.trim();
  const password = document.getElementById('l-pass').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
    currentUser = data.user;
    updateNavAuth();
    navigate('home');
  } catch { errEl.textContent = 'Ошибка сети'; errEl.classList.remove('hidden'); }
}

async function doRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.classList.add('hidden');
  const username = document.getElementById('r-name').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const password = document.getElementById('r-pass').value;
  const pass2 = document.getElementById('r-pass2').value;

  if (password !== pass2) { errEl.textContent = 'Пароли не совпадают'; errEl.classList.remove('hidden'); return; }

  try {
    const res = await fetch('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
    currentUser = data.user;
    updateNavAuth();
    navigate('home');
  } catch { errEl.textContent = 'Ошибка сети'; errEl.classList.remove('hidden'); }
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  updateNavAuth();
  stopChatPoll();
  navigate('home');
}

// ==================== NAVIGATION ====================
function navigate(page, pushState = true) {
  if (['create', 'profile', 'chats', 'admin'].includes(page) && !currentUser) {
    page = 'auth';
  }
  showPage(page, pushState);

  if (page === 'home') loadListings();
  else if (page === 'profile') loadProfile();
  else if (page === 'chats') loadChats();
  else if (page === 'admin') loadModeration('pending');
  else if (page === 'create') loadCreateForm();
}

function showPage(page, pushState = true) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const el = document.getElementById('page-' + page);
  if (el) {
    el.classList.remove('hidden');
    // Re-trigger animation
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
  }
  if (pushState) history.pushState({ page }, '', '#' + page);
  window.scrollTo(0, 0);

  if (page !== 'chats') stopChatPoll();
}

function toggleMenu() {
  document.getElementById('mobile-menu').classList.toggle('hidden');
}

function searchFromNav() {
  const q = document.getElementById('nav-search-input').value.trim();
  if (q) {
    navigate('home');
    setTimeout(() => loadListings(q), 50);
  }
}
document.getElementById('nav-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchFromNav();
});

// ==================== CATEGORIES ====================
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    const container = document.getElementById('filter-cats');
    container.innerHTML = '';
    ['Все', ...cats].forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-cat' + (cat === currentCategory ? ' active' : '');
      btn.textContent = cat;
      btn.onclick = () => {
        currentCategory = cat;
        container.querySelectorAll('.filter-cat').forEach(b => b.classList.toggle('active', b.textContent === cat));
        currentListingPage = 1;
        loadListings();
      };
      container.appendChild(btn);
    });

    // Also populate create form
    const sel = document.getElementById('c-category');
    if (sel) {
      sel.innerHTML = '<option value="">Категория</option>';
      cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    }
  } catch (e) {}
}

// ==================== LISTINGS ====================
async function loadListings(searchQuery) {
  const sort = document.getElementById('filter-sort').value;
  const sortMap = { newest: 'newest', price_asc: 'price_asc', price_desc: 'price_desc' };
  const q = searchQuery || document.getElementById('nav-search-input').value.trim();
  const params = new URLSearchParams({
    page: currentListingPage,
    sort: sortMap[sort] || 'newest',
    ...(currentCategory !== 'Все' && { category: currentCategory }),
    ...(q && { q })
  });

  try {
    const res = await fetch('/api/listings?' + params);
    const data = await res.json();
    const grid = document.getElementById('listings-grid');
    const emptyEl = document.getElementById('listings-empty');
    const pagEl = document.getElementById('listings-pagination');

    if (data.items.length === 0) {
      grid.innerHTML = '';
      emptyEl.classList.remove('hidden');
      pagEl.innerHTML = '';
      return;
    }
    emptyEl.classList.add('hidden');

    grid.innerHTML = data.items.map(l => `
      <div class="listing-card" onclick="openListing('${l.id}')">
        <div class="listing-thumb">
          ${l.images && l.images.length > 0
            ? `<img src="${l.images[0]}" alt="${esc(l.title)}" loading="lazy" />`
            : `<span class="no-img">📦</span>`}
        </div>
        <div class="listing-info">
          <div class="listing-title">${esc(l.title)}</div>
          <div class="listing-price">${esc(l.price)}</div>
          <div class="listing-meta">
            <span class="listing-cat">${esc(l.category)}</span>
            <span>${timeAgo(l.created_at)}</span>
          </div>
        </div>
      </div>
    `).join('');

    // Pagination
    pagEl.innerHTML = '';
    if (data.pages > 1) {
      for (let i = 1; i <= data.pages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = i === data.page ? 'active' : '';
        btn.onclick = () => { currentListingPage = i; loadListings(); };
        pagEl.appendChild(btn);
      }
    }
  } catch (e) {}
}

function openListing(id) {
  showPage('listing', true);
  location.hash = 'listing/' + id;
  loadListingDetail(id);
}

async function loadListingDetail(id) {
  const container = document.getElementById('listing-detail');
  container.innerHTML = '<div class="empty-state"><p>Загрузка...</p></div>';

  try {
    const res = await fetch('/api/listings/' + id);
    if (!res.ok) { container.innerHTML = '<div class="empty-state"><p>Объявление не найдено</p></div>'; return; }
    const l = await res.json();

    const mainImg = l.images && l.images.length > 0 ? l.images[0] : null;
    const isOwner = currentUser && currentUser.id === l.userId;

    container.innerHTML = `
      <span class="detail-back" onclick="navigate('home')">← Назад к объявлениям</span>
      <div class="detail-container">
        <div>
          <div class="detail-gallery" id="detail-main-img">
            ${mainImg ? `<img src="${mainImg}" />` : '<span class="no-img">📦</span>'}
          </div>
          ${l.images && l.images.length > 1 ? `
            <div class="detail-gallery-thumbs">
              ${l.images.map((img, i) => `
                <div class="gthumb ${i === 0 ? 'active' : ''}" onclick="switchDetailImg('${img}', this)">
                  <img src="${img}" />
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="detail-body">
          <span class="listing-cat" style="align-self:start">${esc(l.category)}</span>
          <div class="detail-title">${esc(l.title)}</div>
          <div class="detail-price">${esc(l.price)}</div>
          <div class="detail-desc">${esc(l.description)}</div>
          ${l.seller ? `
            <div class="detail-seller">
              <div class="detail-seller-name">👤 ${esc(l.seller.username)}</div>
              ${l.seller.telegram ? `<div class="detail-seller-tg">Telegram: ${esc(l.seller.telegram)}</div>` : ''}
              ${l.contact ? `<div class="detail-seller-tg">Контакт: ${esc(l.contact)}</div>` : ''}
            </div>
          ` : ''}
          <div class="detail-actions">
            ${!isOwner && currentUser && l.seller ? `
              <button class="btn-primary" style="width:auto;padding:12px 28px" onclick="startChat('${l.id}','${l.seller.id}')">
                💬 Написать продавцу
              </button>
            ` : ''}
            ${!currentUser ? '<span style="color:var(--text-dim);font-size:0.85rem">Войдите, чтобы написать продавцу</span>' : ''}
            ${isOwner ? `
              <button class="btn-danger" onclick="deleteListing('${l.id}')">🗑 Удалить</button>
            ` : ''}
            ${currentUser && currentUser.isAdmin && !isOwner ? `
              <button class="btn-danger" onclick="deleteListing('${l.id}')">🗑 Удалить (админ)</button>
            ` : ''}
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px">
            Опубликовано: ${new Date(l.created_at).toLocaleDateString('ru-RU')}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
  }
}

function switchDetailImg(src, thumbEl) {
  document.getElementById('detail-main-img').innerHTML = `<img src="${src}" />`;
  document.querySelectorAll('.gthumb').forEach(t => t.classList.remove('active'));
  thumbEl.classList.add('active');
}

async function deleteListing(id) {
  if (!confirm('Удалить объявление?')) return;
  try {
    await fetch('/api/listings/' + id, { method: 'DELETE' });
    navigate('home');
  } catch (e) {}
}

// ==================== CREATE LISTING ====================
function loadCreateForm() {
  document.getElementById('create-form').reset();
  document.getElementById('image-previews').innerHTML = '';
  document.getElementById('create-error').classList.add('hidden');
}

function previewImages(input) {
  const container = document.getElementById('image-previews');
  container.innerHTML = '';
  const files = Array.from(input.files).slice(0, 5);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'preview';
      div.innerHTML = `<img src="${e.target.result}" />`;
      container.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

async function doCreateListing(e) {
  e.preventDefault();
  const errEl = document.getElementById('create-error');
  errEl.classList.add('hidden');

  if (!currentUser) { navigate('auth'); return; }

  const form = new FormData();
  form.append('title', document.getElementById('c-title').value.trim());
  form.append('description', document.getElementById('c-desc').value.trim());
  form.append('price', document.getElementById('c-price').value.trim());
  form.append('category', document.getElementById('c-category').value);
  form.append('contact', document.getElementById('c-contact').value.trim());

  const files = document.getElementById('c-images').files;
  for (let i = 0; i < Math.min(files.length, 5); i++) {
    form.append('images', files[i]);
  }

  try {
    const res = await fetch('/api/listings', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
    alert('Объявление отправлено на модерацию!');
    navigate('home');
  } catch { errEl.textContent = 'Ошибка сети'; errEl.classList.remove('hidden'); }
}

// ==================== PROFILE ====================
async function loadProfile() {
  if (!currentUser) return;
  document.getElementById('p-username').value = currentUser.username || '';
  document.getElementById('p-telegram').value = currentUser.telegram || '';

  // Load my listings
  try {
    const res = await fetch('/api/listings?my=1');
    const data = await res.json();
    const grid = document.getElementById('my-listings');
    const emptyEl = document.getElementById('my-listings-empty');

    if (data.items.length === 0) {
      grid.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    grid.innerHTML = data.items.map(l => `
      <div class="listing-card" onclick="openListing('${l.id}')">
        <div class="listing-thumb" style="height:120px">
          ${l.images && l.images.length > 0
            ? `<img src="${l.images[0]}" />`
            : `<span class="no-img">📦</span>`}
        </div>
        <span class="listing-status status-${l.status}">${statusLabel(l.status)}</span>
        <div class="listing-info">
          <div class="listing-title">${esc(l.title)}</div>
          <div class="listing-price">${esc(l.price)}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {}
}

async function doUpdateProfile(e) {
  e.preventDefault();
  const msgEl = document.getElementById('profile-msg');
  msgEl.classList.add('hidden');

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('p-username').value.trim(),
        telegram: document.getElementById('p-telegram').value.trim()
      })
    });
    const data = await res.json();
    if (!res.ok) {
      msgEl.textContent = data.error; msgEl.className = 'form-error'; msgEl.classList.remove('hidden');
      return;
    }
    currentUser.username = document.getElementById('p-username').value.trim();
    currentUser.telegram = document.getElementById('p-telegram').value.trim();
    msgEl.textContent = 'Сохранено!'; msgEl.className = 'form-success'; msgEl.classList.remove('hidden');
    setTimeout(() => msgEl.classList.add('hidden'), 2000);
  } catch {
    msgEl.textContent = 'Ошибка сети'; msgEl.className = 'form-error'; msgEl.classList.remove('hidden');
  }
}

// ==================== CHATS ====================
async function startChat(listingId, sellerId) {
  if (!currentUser) { navigate('auth'); return; }
  try {
    const res = await fetch('/api/chats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId, sellerId })
    });
    const chat = await res.json();
    if (chat.error) { alert(chat.error); return; }
    navigate('chats');
    setTimeout(() => openChat(chat.id), 200);
  } catch (e) {}
}

async function loadChats() {
  try {
    const res = await fetch('/api/chats');
    const chats = await res.json();
    const list = document.getElementById('chats-list');
    const emptyEl = document.getElementById('chats-empty');

    if (chats.length === 0) {
      list.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    list.innerHTML = chats.map(c => `
      <div class="chat-item ${activeChatId === c.id ? 'active' : ''}" onclick="openChat('${c.id}')">
        <div class="chat-item-avatar">${c.otherUser ? c.otherUser.username[0].toUpperCase() : '?'}</div>
        <div class="chat-item-info">
          <div class="chat-item-name">${c.otherUser ? esc(c.otherUser.username) : 'Пользователь'}</div>
          <div class="chat-item-last">
            ${c.listing ? esc(c.listing.title) : ''}
            ${c.lastMessage ? ' — ' + esc(c.lastMessage.text.substring(0, 40)) : ''}
          </div>
        </div>
        ${c.unread > 0 ? `<div class="chat-item-unread">${c.unread}</div>` : ''}
      </div>
    `).join('');
  } catch (e) {}
}

async function openChat(chatId) {
  activeChatId = chatId;
  const layout = document.querySelector('.chats-layout');
  layout.classList.add('chat-open');
  document.getElementById('chat-input-area').classList.remove('hidden');

  // Highlight active chat
  document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
  const items = document.querySelectorAll('.chat-item');
  items.forEach(i => { if (i.onclick.toString().includes(chatId)) i.classList.add('active'); });

  await loadMessages(chatId);
  startChatPoll(chatId);
}

function closeChatWindow() {
  activeChatId = null;
  const layout = document.querySelector('.chats-layout');
  layout.classList.remove('chat-open');
  document.getElementById('chat-input-area').classList.add('hidden');
  document.getElementById('chat-messages').innerHTML = '<div class="chat-placeholder">Выберите чат</div>';
  stopChatPoll();
}

async function loadMessages(chatId) {
  try {
    const res = await fetch(`/api/chats/${chatId}/messages`);
    const messages = await res.json();
    const container = document.getElementById('chat-messages');

    if (messages.length === 0) {
      container.innerHTML = '<div class="chat-placeholder">Напишите первое сообщение</div>';
      return;
    }

    container.innerHTML = messages.map(m => `
      <div class="msg ${m.senderId === currentUser.id ? 'mine' : 'theirs'}">
        <div>${esc(m.text)}</div>
        <div class="msg-time">${formatTime(m.created_at)}</div>
      </div>
    `).join('');

    container.scrollTop = container.scrollHeight;
  } catch (e) {}
}

async function sendMessage(e) {
  e.preventDefault();
  if (!activeChatId) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  try {
    await fetch(`/api/chats/${activeChatId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    await loadMessages(activeChatId);
  } catch (e) {}
}

function startChatPoll(chatId) {
  stopChatPoll();
  chatPollInterval = setInterval(() => {
    if (activeChatId === chatId) loadMessages(chatId);
  }, 3000);
}

function stopChatPoll() {
  if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
}

function startUnreadPoll() {
  unreadPollInterval = setInterval(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/chats');
      const chats = await res.json();
      const total = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
      const badge = document.getElementById('unread-badge');
      if (total > 0) {
        badge.textContent = total;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (e) {}
  }, 10000);
}

// ==================== MODERATION ====================
async function loadModeration(status) {
  // Update tabs
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  try {
    const res = await fetch('/api/listings?status=' + status);
    const data = await res.json();
    const grid = document.getElementById('admin-listings');
    const emptyEl = document.getElementById('admin-empty');

    if (data.items.length === 0) {
      grid.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    grid.innerHTML = data.items.map(l => `
      <div class="listing-card">
        <div class="listing-thumb" style="height:120px" onclick="openListing('${l.id}')">
          ${l.images && l.images.length > 0
            ? `<img src="${l.images[0]}" />`
            : `<span class="no-img">📦</span>`}
        </div>
        <div class="listing-info">
          <div class="listing-title">${esc(l.title)}</div>
          <div class="listing-price">${esc(l.price)}</div>
          <div class="listing-meta">
            <span class="listing-cat">${esc(l.category)}</span>
            <span>${l.seller ? esc(l.seller.username) : ''}</span>
          </div>
          ${status === 'pending' ? `
            <div class="mod-actions">
              <button class="btn-success" onclick="moderate('${l.id}','approved')">✓ Одобрить</button>
              <button class="btn-danger" onclick="moderate('${l.id}','rejected')">✕ Отклонить</button>
            </div>
          ` : ''}
          ${status === 'rejected' ? `
            <div class="mod-actions">
              <button class="btn-success" onclick="moderate('${l.id}','approved')">✓ Одобрить</button>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {}
}

async function moderate(id, status) {
  try {
    await fetch(`/api/listings/${id}/moderate`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    // Reload current tab
    const activeTab = document.querySelector('.admin-tab.active');
    if (activeTab) activeTab.click();
  } catch (e) {}
}

// ==================== UTILS ====================
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(date) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин.';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч.';
  if (diff < 604800) return Math.floor(diff / 86400) + ' дн.';
  return new Date(date).toLocaleDateString('ru-RU');
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function statusLabel(s) {
  if (s === 'pending') return '⏳ На модерации';
  if (s === 'approved') return '✓ Активно';
  if (s === 'rejected') return '✕ Отклонено';
  return s;
}

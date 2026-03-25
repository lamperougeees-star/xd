const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure directories exist
[DATA_DIR, UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- JSON DB helpers ---
function loadJSON(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// --- Multer config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype.split('/')[1])) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения (jpg, png, gif, webp)'));
    }
  }
});

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'yuki-shop-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Необходима авторизация' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Необходима авторизация' });
  const users = loadJSON('users.json');
  const user = users.find(u => u.id === req.session.userId);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Нет прав' });
  next();
}

// ==================== AUTH ====================

app.post('/api/register', async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) return res.status(400).json({ error: 'Все поля обязательны' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: 'Имя: 2-20 символов' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль: минимум 6 символов' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Неверный формат email' });

  const users = loadJSON('users.json');
  if (users.find(u => u.email === email)) return res.status(409).json({ error: 'Email уже занят' });
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'Имя уже занято' });

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    email,
    username,
    password: hash,
    isAdmin: users.length === 0, // first user is admin
    telegram: '',
    avatar: '',
    created_at: new Date().toISOString()
  };
  users.push(user);
  saveJSON('users.json', users);
  req.session.userId = user.id;
  res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

  const users = loadJSON('users.json');
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  req.session.userId = user.id;
  res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin, telegram: user.telegram } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const users = loadJSON('users.json');
  const user = users.find(u => u.id === req.session.userId);
  if (!user) return res.json({ user: null });
  res.json({ user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin, telegram: user.telegram } });
});

app.put('/api/profile', requireAuth, (req, res) => {
  const { telegram, username } = req.body;
  const users = loadJSON('users.json');
  const idx = users.findIndex(u => u.id === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'Пользователь не найден' });

  if (username && username !== users[idx].username) {
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: 'Имя: 2-20 символов' });
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== req.session.userId)) {
      return res.status(409).json({ error: 'Имя уже занято' });
    }
    users[idx].username = username;
  }
  if (telegram !== undefined) users[idx].telegram = telegram;
  saveJSON('users.json', users);
  res.json({ success: true });
});

// ==================== LISTINGS ====================

const CATEGORIES = ['Telegram', 'Аккаунты', 'Игры', 'Услуги', 'Электроника', 'Другое'];

app.get('/api/categories', (req, res) => res.json(CATEGORIES));

app.post('/api/listings', requireAuth, upload.array('images', 5), (req, res) => {
  const { title, description, price, category, contact } = req.body;
  if (!title || !description || !price || !category) return res.status(400).json({ error: 'Заполните все поля' });
  if (title.length > 100) return res.status(400).json({ error: 'Название: максимум 100 символов' });
  if (description.length > 2000) return res.status(400).json({ error: 'Описание: максимум 2000 символов' });

  const images = (req.files || []).map(f => '/uploads/' + f.filename);
  const listing = {
    id: uuidv4(),
    userId: req.session.userId,
    title: title.trim(),
    description: description.trim(),
    price: price.trim(),
    category,
    contact: contact || '',
    images,
    status: 'pending', // pending | approved | rejected
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const listings = loadJSON('listings.json');
  listings.unshift(listing);
  saveJSON('listings.json', listings);
  res.json({ success: true, listing });
});

app.get('/api/listings', (req, res) => {
  const { q, category, sort, page = 1, my, status } = req.query;
  let listings = loadJSON('listings.json');
  const users = loadJSON('users.json');

  // If admin wants to see by status
  if (status && req.session.userId) {
    const user = users.find(u => u.id === req.session.userId);
    if (user && user.isAdmin) {
      listings = listings.filter(l => l.status === status);
    }
  } else if (my && req.session.userId) {
    listings = listings.filter(l => l.userId === req.session.userId);
  } else {
    listings = listings.filter(l => l.status === 'approved');
  }

  if (q) {
    const query = q.toLowerCase();
    listings = listings.filter(l =>
      l.title.toLowerCase().includes(query) ||
      l.description.toLowerCase().includes(query)
    );
  }
  if (category && category !== 'Все') {
    listings = listings.filter(l => l.category === category);
  }

  if (sort === 'price_asc') listings.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  else if (sort === 'price_desc') listings.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  else listings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const perPage = 12;
  const total = listings.length;
  const pages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const items = listings.slice(start, start + perPage).map(l => {
    const seller = users.find(u => u.id === l.userId);
    return { ...l, seller: seller ? { username: seller.username, telegram: seller.telegram } : null };
  });

  res.json({ items, total, pages, page: +page });
});

app.get('/api/listings/:id', (req, res) => {
  const listings = loadJSON('listings.json');
  const listing = listings.find(l => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Объявление не найдено' });

  const users = loadJSON('users.json');
  const seller = users.find(u => u.id === listing.userId);
  res.json({ ...listing, seller: seller ? { id: seller.id, username: seller.username, telegram: seller.telegram } : null });
});

app.delete('/api/listings/:id', requireAuth, (req, res) => {
  const listings = loadJSON('listings.json');
  const idx = listings.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });

  const users = loadJSON('users.json');
  const user = users.find(u => u.id === req.session.userId);
  if (listings[idx].userId !== req.session.userId && !(user && user.isAdmin)) {
    return res.status(403).json({ error: 'Нет прав' });
  }

  // Delete images
  listings[idx].images.forEach(img => {
    const p = path.join(__dirname, 'public', img);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  listings.splice(idx, 1);
  saveJSON('listings.json', listings);
  res.json({ success: true });
});

// ==================== MODERATION ====================

app.put('/api/listings/:id/moderate', requireAdmin, (req, res) => {
  const { status } = req.body; // approved | rejected
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Неверный статус' });

  const listings = loadJSON('listings.json');
  const idx = listings.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });

  listings[idx].status = status;
  listings[idx].updated_at = new Date().toISOString();
  saveJSON('listings.json', listings);
  res.json({ success: true });
});

// ==================== CHAT ====================

app.post('/api/chats', requireAuth, (req, res) => {
  const { listingId, sellerId } = req.body;
  if (!listingId || !sellerId) return res.status(400).json({ error: 'Не хватает данных' });
  if (sellerId === req.session.userId) return res.status(400).json({ error: 'Нельзя писать самому себе' });

  const chats = loadJSON('chats.json');
  let chat = chats.find(c =>
    c.listingId === listingId &&
    ((c.buyerId === req.session.userId && c.sellerId === sellerId) ||
     (c.buyerId === sellerId && c.sellerId === req.session.userId))
  );

  if (!chat) {
    chat = {
      id: uuidv4(),
      listingId,
      buyerId: req.session.userId,
      sellerId,
      created_at: new Date().toISOString()
    };
    chats.push(chat);
    saveJSON('chats.json', chats);
  }
  res.json(chat);
});

app.get('/api/chats', requireAuth, (req, res) => {
  const chats = loadJSON('chats.json');
  const users = loadJSON('users.json');
  const listings = loadJSON('listings.json');
  const messages = loadJSON('messages.json');

  const myChats = chats
    .filter(c => c.buyerId === req.session.userId || c.sellerId === req.session.userId)
    .map(c => {
      const otherId = c.buyerId === req.session.userId ? c.sellerId : c.buyerId;
      const other = users.find(u => u.id === otherId);
      const listing = listings.find(l => l.id === c.listingId);
      const chatMessages = messages.filter(m => m.chatId === c.id);
      const lastMsg = chatMessages[chatMessages.length - 1];
      const unread = chatMessages.filter(m => m.senderId !== req.session.userId && !m.read).length;
      return {
        ...c,
        otherUser: other ? { username: other.username } : null,
        listing: listing ? { title: listing.title, images: listing.images } : null,
        lastMessage: lastMsg || null,
        unread
      };
    })
    .sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.created_at) : new Date(a.created_at);
      const bTime = b.lastMessage ? new Date(b.lastMessage.created_at) : new Date(b.created_at);
      return bTime - aTime;
    });

  res.json(myChats);
});

app.get('/api/chats/:id/messages', requireAuth, (req, res) => {
  const chats = loadJSON('chats.json');
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ error: 'Чат не найден' });
  if (chat.buyerId !== req.session.userId && chat.sellerId !== req.session.userId) {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const messages = loadJSON('messages.json');
  const chatMessages = messages.filter(m => m.chatId === req.params.id);

  // Mark as read
  let changed = false;
  messages.forEach(m => {
    if (m.chatId === req.params.id && m.senderId !== req.session.userId && !m.read) {
      m.read = true;
      changed = true;
    }
  });
  if (changed) saveJSON('messages.json', messages);

  res.json(chatMessages);
});

app.post('/api/chats/:id/messages', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Пустое сообщение' });
  if (text.length > 1000) return res.status(400).json({ error: 'Максимум 1000 символов' });

  const chats = loadJSON('chats.json');
  const chat = chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ error: 'Чат не найден' });
  if (chat.buyerId !== req.session.userId && chat.sellerId !== req.session.userId) {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const msg = {
    id: uuidv4(),
    chatId: req.params.id,
    senderId: req.session.userId,
    text: text.trim(),
    read: false,
    created_at: new Date().toISOString()
  };

  const messages = loadJSON('messages.json');
  messages.push(msg);
  saveJSON('messages.json', messages);
  res.json(msg);
});

// ==================== SERVE SPA ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Yuki Marketplace запущен на http://localhost:${PORT}`);
});

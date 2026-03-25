require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const path = require('path');
const Database = require('better-sqlite3');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');

const app = express();

// ==================== КОНФИГУРАЦИЯ ====================
const EMAIL_USER = process.env.EMAIL_USER || 'your-email@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'your-app-password';
const SITE_NAME = 'Не грусти';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();

// ==================== БАЗА ДАННЫХ (SQLite) ====================
const db = new Database('data.db');

// Создаём таблицы если не существуют
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    verified INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS pending (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL
  );
`);

// ==================== EMAIL ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, code, type = 'verification') {
  const isReset = type === 'reset';
  const mailOptions = {
    from: `"${SITE_NAME}" <${EMAIL_USER}>`,
    to: email,
    subject: isReset ? `Сброс пароля — ${SITE_NAME}` : `Код подтверждения — ${SITE_NAME}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #fff; font-size: 24px; margin: 0;">${isReset ? '🔐 Сброс пароля' : '✉️ Подтверждение email'}</h1>
        </div>
        <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 30px; text-align: center;">
          <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 0 0 20px;">${isReset ? 'Ваш код для сброса пароля:' : 'Ваш код подтверждения:'}</p>
          <div style="background: rgba(102,126,234,0.15); border: 2px solid rgba(102,126,234,0.4); border-radius: 12px; padding: 20px; display: inline-block; margin-bottom: 20px;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #667eea;">${code}</span>
          </div>
          <p style="color: rgba(255,255,255,0.5); font-size: 13px; margin: 0;">Код действителен 10 минут</p>
        </div>
        <p style="color: rgba(255,255,255,0.3); font-size: 12px; text-align: center; margin-top: 20px;">
          Если вы не запрашивали этот код, просто проигнорируйте письмо.
        </p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: '100kb' }));

// Блокировка доступа к чувствительным файлам
app.use((req, res, next) => {
  const sensitiveFiles = ['users.json', 'pending.json', '.env', '.git', 'data.db'];
  const filename = req.path.split('/').pop();
  if (sensitiveFiles.includes(filename)) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// Подключаем helmet для безопасности
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false
}));

// Ограничение частоты запросов
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Слишком много запросов. Попробуйте позже.' }
});
app.use('/api/', apiLimiter);

// Сессии с куками
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // true для HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
  }
}));

// Статические файлы - только из папки с проектом (но защищённые)
app.use(express.static(__dirname, { index: false }));

// index.html доступен в корне
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== API: ПРОВЕРКА СЕССИИ ====================
app.get('/api/check-session', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ 
      loggedIn: true, 
      email: req.session.email,
      userId: req.session.userId 
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// ==================== РЕГИСТРАЦИЯ ====================
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Неверный формат email' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }

  // Проверяем существующего пользователя
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
  }

  // Генерируем код и сохраняем pending
  const code = generateCode();
  const hash = await bcrypt.hash(password, 10);
  const now = Date.now();

  // Удаляем старые pending записи для этого email
  db.prepare('DELETE FROM pending WHERE email = ?').run(email);

  // Вставляем новую pending запись
  db.prepare(`
    INSERT INTO pending (email, passwordHash, code, attempts, createdAt, expiresAt)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(email, hash, code, now, now + 10 * 60 * 1000);

  // Отправляем email
  try {
    await sendVerificationEmail(email, code);
    console.log(`Код ${code} отправлен на ${email}`);
    res.json({ success: true, message: 'Код отправлен на email' });
  } catch (err) {
    console.error('Ошибка отправки email:', err.message);
    res.status(500).json({ error: 'Не удалось отправить письмо. Проверьте настройки email.' });
  }
});

// ==================== ВЕРИФИКАЦИЯ ====================
app.post('/api/verify', async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email и код обязательны' });
  }

  const entry = db.prepare('SELECT * FROM pending WHERE email = ?').get(email);

  if (!entry) {
    return res.status(404).json({ error: 'Регистрация не найдена. Попробуйте заново.' });
  }

  if (Date.now() > entry.expiresAt) {
    db.prepare('DELETE FROM pending WHERE email = ?').run(email);
    return res.status(410).json({ error: 'Код истёк. Зарегистрируйтесь заново.' });
  }

  if (entry.attempts >= 5) {
    db.prepare('DELETE FROM pending WHERE email = ?').run(email);
    return res.status(429).json({ error: 'Слишком много попыток. Зарегистрируйтесь заново.' });
  }

  if (entry.code !== code) {
    db.prepare('UPDATE pending SET attempts = attempts + 1 WHERE email = ?').run(email);
    const remaining = 5 - (entry.attempts + 1);
    return res.status(400).json({ error: `Неверный код. Осталось попыток: ${remaining}` });
  }

  // Код верный — создаём пользователя
  const hash = entry.passwordHash;
  
  // Проверяем ещё раз на дубликат
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare('DELETE FROM pending WHERE email = ?').run(email);
    return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
  }

  db.prepare('INSERT INTO users (email, password, verified) VALUES (?, ?, 1)').run(email, hash);
  db.prepare('DELETE FROM pending WHERE email = ?').run(email);

  console.log(`Пользователь ${email} успешно зарегистрирован`);
  res.json({ success: true, message: 'Email подтверждён. Регистрация завершена!' });
});

// ==================== ПОВТОРНАЯ ОТПРАВКА КОДА ====================
app.post('/api/resend-code', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email обязателен' });
  }

  const entry = db.prepare('SELECT * FROM pending WHERE email = ?').get(email);

  if (!entry) {
    return res.status(404).json({ error: 'Регистрация не найдена. Попробуйте заново.' });
  }

  const code = generateCode();
  const now = Date.now();
  
  db.prepare(`
    UPDATE pending SET code = ?, attempts = 0, expiresAt = ? WHERE email = ?
  `).run(code, now + 10 * 60 * 1000, email);

  try {
    await sendVerificationEmail(email, code);
    console.log(`Новый код ${code} отправлен на ${email}`);
    res.json({ success: true, message: 'Новый код отправлен' });
  } catch (err) {
    console.error('Ошибка повторной отправки:', err.message);
    res.status(500).json({ error: 'Не удалось отправить письмо' });
  }
});

// ==================== ВХОД ====================
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  if (!user.verified) {
    return res.status(403).json({ error: 'Email не подтверждён' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  // Создаём сессию
  const sessionId = uuidv4();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 дней
  
  db.prepare(`
    INSERT INTO sessions (id, user_id, email, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, user.id, email, expiresAt);

  // Устанавливаем куку
  req.session.userId = user.id;
  req.session.email = email;
  req.session.sessionId = sessionId;

  res.json({ success: true });
});

// ==================== ВЫХОД ====================
app.post('/api/logout', (req, res) => {
  const sessionId = req.session.sessionId;
  
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
  
  req.session.destroy();
  res.json({ success: true });
});

// ==================== ЗАБЫЛИ ПАРОЛЬ ====================
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email обязателен' });
  }

  // Проверяем существует ли пользователь
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  
  if (!user) {
    // Не сообщаем что email не существует (безопасность)
    return res.json({ success: true, message: 'Если email существует, код будет отправлен' });
  }

  const code = generateCode();
  const now = Date.now();

  // Удаляем старые коды сброса
  db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);

  // Создаём новый код сброса
  db.prepare(`
    INSERT INTO password_resets (email, code, attempts, createdAt, expiresAt)
    VALUES (?, ?, 0, ?, ?)
  `).run(email, code, now, now + 10 * 60 * 1000);

  try {
    await sendVerificationEmail(email, code, 'reset');
    console.log(`Код сброса ${code} отправлен на ${email}`);
    res.json({ success: true, message: 'Код отправлен на email' });
  } catch (err) {
    console.error('Ошибка отправки email:', err.message);
    res.status(500).json({ error: 'Не удалось отправить письмо' });
  }
});

// ==================== ПРОВЕРКА КОДА СБРОСА ====================
app.post('/api/verify-reset-code', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email и код обязательны' });
  }

  const entry = db.prepare('SELECT * FROM password_resets WHERE email = ?').get(email);

  if (!entry) {
    return res.status(404).json({ error: 'Запрос на сброс не найден' });
  }

  if (Date.now() > entry.expiresAt) {
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    return res.status(410).json({ error: 'Код истёк. Попробуйте снова.' });
  }

  if (entry.attempts >= 5) {
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    return res.status(429).json({ error: 'Слишком много попыток. Попробуйте снова.' });
  }

  if (entry.code !== code) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE email = ?').run(email);
    const remaining = 5 - (entry.attempts + 1);
    return res.status(400).json({ error: `Неверный код. Осталось попыток: ${remaining}` });
  }

  res.json({ success: true, message: 'Код подтверждён' });
});

// ==================== НОВЫЙ ПАРОЛЬ ====================
app.post('/api/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }

  const entry = db.prepare('SELECT * FROM password_resets WHERE email = ?').get(email);

  if (!entry) {
    return res.status(404).json({ error: 'Запрос на сброс не найден' });
  }

  if (Date.now() > entry.expiresAt) {
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    return res.status(410).json({ error: 'Код истёк. Попробуйте снова.' });
  }

  if (entry.code !== code) {
    return res.status(400).json({ error: 'Неверный код' });
  }

  // Обновляем пароль
  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hash, email);

  // Удаляем код сброса
  db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);

  // Инвалидируем все сессии пользователя
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (user) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  }

  console.log(`Пароль для ${email} сброшен`);
  res.json({ success: true, message: 'Пароль успешно изменён' });
});

// ==================== МАГАЗИН ====================
app.get('/api/products', (req, res) => {
  const products = [
    { id: 'acc_basic', name: 'Базовый аккаунт', description: 'Доступ к базовым функциям', price: 99, icon: '👤' },
    { id: 'acc_premium', name: 'Премиум аккаунт', description: 'Полный доступ + бонусы', price: 299, icon: '⭐' },
    { id: 'acc_vip', name: 'VIP аккаунт', description: 'Эксклюзивные возможности', price: 599, icon: '👑' },
    { id: 'skin_custom', name: 'Уникальный скин', description: 'Персональный дизайн', price: 199, icon: '🎨' },
    { id: 'boost_1w', name: 'Буст на 7 дней', description: 'Ускорение прогресса', price: 149, icon: '🚀' }
  ];
  res.json(products);
});

// ==================== ЗАПУСК ====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log('База данных: SQLite (data.db)');
  if (EMAIL_USER === 'your-email@gmail.com') {
    console.log('⚠️  ВНИМАНИЕ: Настройте EMAIL_USER и EMAIL_PASS в переменных окружения');
  }
});

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();

// ==================== БЕЗОПАСНОСТЬ ====================
// Helmet — устанавливает защитные HTTP-заголовки
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ==================== КОНФИГУРАЦИЯ ====================
const EMAIL_USER = process.env.EMAIL_USER || 'your-email@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'your-app-password';
const SITE_NAME = 'Не грусти';
const BCRYPT_ROUNDS = 12;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 минут
const MAX_CODE_ATTEMPTS = 5;

// ==================== ХРАНИЛИЩЕ ====================
// Файлы данных хранятся вне публичной папки (в data/)
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending.json');

// Создаём папку data если её нет
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsers() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function loadPending() {
  try {
    if (!fs.existsSync(PENDING_FILE)) return {};
    const raw = fs.readFileSync(PENDING_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePending(pending) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

// Очистка устаревших pending-записей (вызывается при каждой загрузке)
function cleanupExpiredPending() {
  const pending = loadPending();
  const now = Date.now();
  let changed = false;
  for (const email of Object.keys(pending)) {
    if (pending[email].expiresAt < now) {
      delete pending[email];
      changed = true;
    }
  }
  if (changed) savePending(pending);
}

// Очистка каждые 5 минут
setInterval(cleanupExpiredPending, 5 * 60 * 1000);

// ==================== EMAIL ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

function generateCode() {
  // Криптографически более надёжная генерация кода
  const { randomInt } = require('crypto');
  return String(randomInt(100000, 999999));
}

async function sendVerificationEmail(email, code) {
  const mailOptions = {
    from: `"${SITE_NAME}" <${EMAIL_USER}>`,
    to: email,
    subject: `Код подтверждения — ${SITE_NAME}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #fff; font-size: 24px; margin: 0;">✉️ Подтверждение email</h1>
        </div>
        <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 30px; text-align: center;">
          <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 0 0 20px;">Ваш код подтверждения:</p>
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
// Ограничение размера тела запроса
app.use(express.json({ limit: '10kb' }));

// Блокируем прямой доступ к чувствительным файлам ДО статики
app.get('/data/*', (req, res) => res.status(403).json({ error: 'Доступ запрещён' }));
app.get('/users.json', (req, res) => res.status(403).json({ error: 'Доступ запрещён' }));
app.get('/pending.json', (req, res) => res.status(403).json({ error: 'Доступ запрещён' }));
app.get('/*.cs', (req, res) => res.status(403).json({ error: 'Доступ запрещён' }));
app.get('/.env*', (req, res) => res.status(403).json({ error: 'Доступ запрещён' }));
app.get('/package.json', (req, res) => res.status(403).json({ error: 'Доступ запрещён' }));
app.get('/package-lock.json', (req, res) => res.status(403).json({ error: 'Доступ запрещён' }));

// Статика с правильными заголовками кэширования
app.use(express.static(__dirname, {
  index: 'index.html',
  maxAge: '1h', // Кэшировать статику на 1 час
  setHeaders: (res, filePath) => {
    // CSS и JS — кэшируем с обязательной ревалидацией
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
    // HTML — не кэшируем (всегда свежая версия)
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    // Изображения — кэшируем на день
    if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.gif') || filePath.endsWith('.svg') || filePath.endsWith('.webp')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// ==================== RATE LIMITING ====================
// Общий лимит
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте позже.' }
});

// Жёсткий лимит для чувствительных операций
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Подождите 15 минут.' }
});

// Лимит на отправку кода
const codeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Подождите перед повторной отправкой кода.' }
});

app.use('/api/', globalLimiter);

// ==================== ВАЛИДАЦИЯ ====================
function sanitizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase().slice(0, 254);
}

function validateEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function validateCode(code) {
  return typeof code === 'string' && /^\d{6}$/.test(code);
}

// ==================== РЕГИСТРАЦИЯ (шаг 1 — отправка кода) ====================
app.post('/api/register', authLimiter, async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Неверный формат email' });
  }

  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Пароль должен быть от 6 до 128 символов' });
  }

  const users = loadUsers();
  const existing = users.find(u => u.email === email);
  if (existing) {
    return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
  }

  // Проверяем, нет ли уже активной pending-записи (защита от флуда)
  const pending = loadPending();
  const existingPending = pending[email];
  if (existingPending && existingPending.expiresAt > Date.now()) {
    // Разрешаем повторно только если прошло больше 60 секунд
    const elapsed = Date.now() - (existingPending.expiresAt - CODE_EXPIRY_MS);
    if (elapsed < 60 * 1000) {
      return res.status(429).json({ error: 'Код уже отправлен. Подождите 60 секунд.' });
    }
  }

  // Генерируем код и сохраняем pending-регистрацию
  const code = generateCode();
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  pending[email] = {
    passwordHash: hash,
    code: code,
    attempts: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + CODE_EXPIRY_MS
  };

  savePending(pending);

  // Отправляем email
  try {
    await sendVerificationEmail(email, code);
    // НЕ логируем сам код в продакшене!
    console.log(`Код отправлен на ${email}`);
    res.json({ success: true, message: 'Код отправлен на email' });
  } catch (err) {
    console.error('Ошибка отправки email:', err.message);
    // Удаляем pending-запись при ошибке отправки
    delete pending[email];
    savePending(pending);
    res.status(500).json({ error: 'Не удалось отправить письмо. Проверьте настройки email.' });
  }
});

// ==================== ВЕРИФИКАЦИЯ (шаг 2 — проверка кода) ====================
app.post('/api/verify', authLimiter, async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const code = req.body?.code;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email и код обязательны' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Неверный формат email' });
  }

  if (!validateCode(code)) {
    return res.status(400).json({ error: 'Код должен состоять из 6 цифр' });
  }

  const pending = loadPending();
  const entry = pending[email];

  if (!entry) {
    return res.status(404).json({ error: 'Регистрация не найдена. Попробуйте заново.' });
  }

  // Проверяем срок действия
  if (Date.now() > entry.expiresAt) {
    delete pending[email];
    savePending(pending);
    return res.status(410).json({ error: 'Код истёк. Зарегистрируйтесь заново.' });
  }

  // Проверяем количество попыток
  if (entry.attempts >= MAX_CODE_ATTEMPTS) {
    delete pending[email];
    savePending(pending);
    return res.status(429).json({ error: 'Слишком много попыток. Зарегистрируйтесь заново.' });
  }

  // Сравнение кодов (timing-safe через constant-time comparison)
  const { timingSafeEqual } = require('crypto');
  const inputBuf = Buffer.from(code.padEnd(6, '\0'));
  const storedBuf = Buffer.from(entry.code.padEnd(6, '\0'));
  const codeMatch = timingSafeEqual(inputBuf, storedBuf) && code === entry.code;

  if (!codeMatch) {
    entry.attempts++;
    savePending(pending);
    const remaining = MAX_CODE_ATTEMPTS - entry.attempts;
    return res.status(400).json({ error: `Неверный код. Осталось попыток: ${remaining}` });
  }

  // Код верный — создаём пользователя
  const users = loadUsers();

  // Финальная проверка на дубликат
  const existing = users.find(u => u.email === email);
  if (existing) {
    delete pending[email];
    savePending(pending);
    return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
  }

  users.push({
    email,
    password: entry.passwordHash,
    verified: true,
    created_at: new Date().toISOString()
  });
  saveUsers(users);

  // Удаляем pending
  delete pending[email];
  savePending(pending);

  console.log(`Пользователь ${email} успешно зарегистрирован`);
  res.json({ success: true, message: 'Email подтверждён. Регистрация завершена!' });
});

// ==================== ПОВТОРНАЯ ОТПРАВКА КОДА ====================
app.post('/api/resend-code', codeLimiter, async (req, res) => {
  const email = sanitizeEmail(req.body?.email);

  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: 'Неверный email' });
  }

  const pending = loadPending();
  const entry = pending[email];

  if (!entry) {
    return res.status(404).json({ error: 'Регистрация не найдена. Попробуйте заново.' });
  }

  // Генерируем новый код
  const code = generateCode();
  entry.code = code;
  entry.attempts = 0;
  entry.expiresAt = Date.now() + CODE_EXPIRY_MS;
  savePending(pending);

  try {
    await sendVerificationEmail(email, code);
    console.log(`Новый код отправлен на ${email}`);
    res.json({ success: true, message: 'Новый код отправлен' });
  } catch (err) {
    console.error('Ошибка повторной отправки:', err.message);
    res.status(500).json({ error: 'Не удалось отправить письмо' });
  }
});

// ==================== ВХОД ====================
app.post('/api/login', authLimiter, async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  if (!validateEmail(email) || !validatePassword(password)) {
    // Одинаковое сообщение для защиты от перечисления пользователей
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const users = loadUsers();
  const user = users.find(u => u.email === email);

  // Всегда выполняем bcrypt.compare для защиты от timing-атак
  const dummyHash = '$2b$12$invalidhashfortimingresistexxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const match = user ? await bcrypt.compare(password, user.password) : await bcrypt.compare(password, dummyHash).catch(() => false);

  if (!user || !match) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  if (!user.verified) {
    return res.status(403).json({ error: 'Email не подтверждён' });
  }

  res.json({ success: true });
});

// ==================== ОБРАБОТКА ОШИБОК ====================
// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Необработанная ошибка:', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// 404 для API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// ==================== ЗАПУСК ====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  if (EMAIL_USER === 'your-email@gmail.com') {
    console.warn('⚠️  ВНИМАНИЕ: Настройте EMAIL_USER и EMAIL_PASS в файле .env');
  }
  // Первичная очистка устаревших записей
  cleanupExpiredPending();
});

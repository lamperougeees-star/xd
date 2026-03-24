const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();

// ==================== КОНФИГУРАЦИЯ ====================
// Замените эти данные на свои
const EMAIL_USER = process.env.EMAIL_USER || 'your-email@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'your-app-password';
const SITE_NAME = 'Не грусти';

// ==================== ХРАНИЛИЩЕ ====================
const DB_FILE = path.join(__dirname, 'users.json');
const PENDING_FILE = path.join(__dirname, 'pending.json');

function loadUsers() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function loadPending() {
  if (!fs.existsSync(PENDING_FILE)) return {};
  return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
}

function savePending(pending) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

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
app.use(express.json());
app.use(express.static(__dirname));

// ==================== РЕГИСТРАЦИЯ (шаг 1 — отправка кода) ====================
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

  const users = loadUsers();
  const existing = users.find(u => u.email === email);
  if (existing) {
    return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
  }

  // Генерируем код и сохраняем pending-регистрацию
  const code = generateCode();
  const hash = await bcrypt.hash(password, 10);
  const pending = loadPending();

  pending[email] = {
    passwordHash: hash,
    code: code,
    attempts: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 минут
  };

  savePending(pending);

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

// ==================== ВЕРИФИКАЦИЯ (шаг 2 — проверка кода) ====================
app.post('/api/verify', async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email и код обязательны' });
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
  if (entry.attempts >= 5) {
    delete pending[email];
    savePending(pending);
    return res.status(429).json({ error: 'Слишком много попыток. Зарегистрируйтесь заново.' });
  }

  // Проверяем код
  if (entry.code !== code) {
    entry.attempts++;
    savePending(pending);
    const remaining = 5 - entry.attempts;
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

  console.log(`Пользователь ${email} успешно зарегистрирован и подтверждён`);
  res.json({ success: true, message: 'Email подтверждён. Регистрация завершена!' });
});

// ==================== ПОВТОРНАЯ ОТПРАВКА КОДА ====================
app.post('/api/resend-code', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email обязателен' });
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
  entry.expiresAt = Date.now() + 10 * 60 * 1000;
  savePending(pending);

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

  const users = loadUsers();
  const user = users.find(u => u.email === email);
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

  res.json({ success: true });
});

// ==================== ЗАПУСК ====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  if (EMAIL_USER === 'your-email@gmail.com') {
    console.log('⚠️  ВНИМАНИЕ: Настройте EMAIL_USER и EMAIL_PASS в переменных окружения или в файле .env');
  }
});

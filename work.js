// ==================== SLIDER ====================
const overlay = document.getElementById('welcome-overlay');
const choiceScreen = document.getElementById('choice-screen');
const loginScreen = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const verifyScreen = document.getElementById('verify-screen');
const continueScreen = document.getElementById('continue-screen');
const scaryScreen = document.getElementById('scary-screen');

const thumb = document.getElementById('slider-thumb');
const track = document.getElementById('slider-track');
const fill = document.getElementById('slider-fill');
const sliderText = document.getElementById('slider-text');

let dragging = false;
let startX = 0;
let thumbX = 0;
let maxX = 0;
let unlocked = false;

// Хранение email для верификации
let pendingEmail = '';
let resendTimerInterval = null;

function getMaxX() {
  return track.offsetWidth - thumb.offsetWidth - 8;
}

function onStart(e) {
  if (unlocked) return;
  dragging = true;
  startX = (e.touches ? e.touches[0].clientX : e.clientX) - thumbX;
  maxX = getMaxX();
  thumb.style.transition = 'none';
  fill.style.transition = 'none';
}

function onMove(e) {
  if (!dragging || unlocked) return;
  e.preventDefault();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  let newX = clientX - startX;
  newX = Math.max(0, Math.min(newX, maxX));
  thumbX = newX;
  thumb.style.left = (4 + newX) + 'px';
  fill.style.width = (newX + thumb.offsetWidth / 2) + 'px';

  const progress = newX / maxX;
  sliderText.style.opacity = Math.max(0, 1 - progress * 2);

  if (progress > 0.85) {
    unlock();
  }
}

function onEnd() {
  if (!dragging || unlocked) return;
  dragging = false;
  thumb.style.transition = 'left 0.3s ease';
  fill.style.transition = 'width 0.3s ease';
  thumbX = 0;
  thumb.style.left = '4px';
  fill.style.width = '0px';
  sliderText.style.opacity = '';
}

function unlock() {
  unlocked = true;
  dragging = false;
  thumb.classList.add('unlocked');
  thumb.textContent = '✓';
  thumb.style.transition = 'left 0.2s ease';
  fill.style.transition = 'width 0.2s ease';
  thumb.style.left = (4 + maxX) + 'px';
  fill.style.width = '100%';
  sliderText.textContent = 'Добро пожаловать!';
  sliderText.style.opacity = '1';
  sliderText.style.color = '#fff';
  sliderText.style.animation = 'none';

  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.remove();
      choiceScreen.classList.remove('hidden');
    }, 500);
  }, 600);
}

// Mouse events
thumb.addEventListener('mousedown', onStart);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onEnd);

// Touch events
thumb.addEventListener('touchstart', onStart, { passive: true });
window.addEventListener('touchmove', onMove, { passive: false });
window.addEventListener('touchend', onEnd);

// ==================== ВЫБОР ====================
document.getElementById('go-login-btn').addEventListener('click', () => {
  choiceScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

document.getElementById('go-register-btn').addEventListener('click', () => {
  choiceScreen.classList.add('hidden');
  registerScreen.classList.remove('hidden');
});

document.getElementById('back-from-login').addEventListener('click', () => {
  loginScreen.classList.add('hidden');
  choiceScreen.classList.remove('hidden');
});

document.getElementById('back-from-register').addEventListener('click', () => {
  registerScreen.classList.add('hidden');
  choiceScreen.classList.remove('hidden');
});

document.getElementById('back-from-verify').addEventListener('click', () => {
  verifyScreen.classList.add('hidden');
  registerScreen.classList.remove('hidden');
  clearVerifyForm();
  if (resendTimerInterval) clearInterval(resendTimerInterval);
});

// ==================== REGISTRATION ====================
const form = document.getElementById('register-form');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');

function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove('hidden'); }
function hideError() { errorMsg.classList.add('hidden'); }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm-password').value;

  if (password !== confirm) { showError('Пароли не совпадают'); return; }
  if (password.length < 6) { showError('Пароль должен быть не менее 6 символов'); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Регистрация...';

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Ошибка регистрации');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Зарегистрироваться';
      return;
    }
    // Успешно — переходим на экран верификации
    pendingEmail = email;
    document.getElementById('verify-email-display').textContent = email;
    registerScreen.classList.add('hidden');
    verifyScreen.classList.remove('hidden');
    startResendTimer();
    focusFirstDigit();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Зарегистрироваться';
  } catch {
    showError('Нет соединения с сервером');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Зарегистрироваться';
  }
});

// ==================== VERIFICATION CODE ====================
const codeDigits = document.querySelectorAll('.code-digit');
const verifyForm = document.getElementById('verify-form');
const verifyErrorMsg = document.getElementById('verify-error-msg');
const verifyBtn = document.getElementById('verify-btn');
const resendBtn = document.getElementById('resend-btn');
const resendTimer = document.getElementById('resend-timer');
const timerCount = document.getElementById('timer-count');

function showVerifyError(msg) {
  verifyErrorMsg.textContent = msg;
  verifyErrorMsg.classList.remove('hidden');
  // Добавляем анимацию тряски на все цифры
  codeDigits.forEach(d => {
    d.classList.add('error-shake');
    setTimeout(() => d.classList.remove('error-shake'), 500);
  });
}
function hideVerifyError() { verifyErrorMsg.classList.add('hidden'); }

function focusFirstDigit() {
  setTimeout(() => codeDigits[0].focus(), 100);
}

function clearVerifyForm() {
  codeDigits.forEach(d => {
    d.value = '';
    d.classList.remove('filled');
  });
  hideVerifyError();
}

function getCode() {
  return Array.from(codeDigits).map(d => d.value).join('');
}

// Логика ввода кода — автофокус на следующий инпут
codeDigits.forEach((digit, index) => {
  digit.addEventListener('input', (e) => {
    const val = e.target.value;
    // Разрешаем только цифры
    if (!/^\d$/.test(val)) {
      e.target.value = '';
      e.target.classList.remove('filled');
      return;
    }
    e.target.classList.add('filled');
    // Переход к следующему
    if (index < 5) {
      codeDigits[index + 1].focus();
    }
  });

  digit.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      if (digit.value === '' && index > 0) {
        codeDigits[index - 1].focus();
        codeDigits[index - 1].value = '';
        codeDigits[index - 1].classList.remove('filled');
      } else {
        digit.value = '';
        digit.classList.remove('filled');
      }
    }
    // Стрелки влево/вправо
    if (e.key === 'ArrowLeft' && index > 0) {
      codeDigits[index - 1].focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      codeDigits[index + 1].focus();
    }
  });

  // Поддержка вставки кода из буфера
  digit.addEventListener('paste', (e) => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (/^\d{6}$/.test(paste)) {
      for (let i = 0; i < 6; i++) {
        codeDigits[i].value = paste[i];
        codeDigits[i].classList.add('filled');
      }
      codeDigits[5].focus();
    }
  });
});

// Отправка кода верификации
verifyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideVerifyError();

  const code = getCode();
  if (code.length !== 6) {
    showVerifyError('Введите все 6 цифр кода');
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Проверка...';

  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, code })
    });
    const data = await res.json();
    if (!res.ok) {
      showVerifyError(data.error || 'Неверный код');
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Подтвердить';
      return;
    }
    // Успех — переходим дальше
    verifyScreen.classList.add('hidden');
    continueScreen.classList.remove('hidden');
    if (resendTimerInterval) clearInterval(resendTimerInterval);
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Подтвердить';
  } catch {
    showVerifyError('Нет соединения с сервером');
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Подтвердить';
  }
});

// Таймер повторной отправки
function startResendTimer() {
  let seconds = 60;
  resendBtn.classList.add('hidden');
  resendTimer.classList.remove('hidden');
  timerCount.textContent = seconds;

  if (resendTimerInterval) clearInterval(resendTimerInterval);
  resendTimerInterval = setInterval(() => {
    seconds--;
    timerCount.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(resendTimerInterval);
      resendTimer.classList.add('hidden');
      resendBtn.classList.remove('hidden');
    }
  }, 1000);
}

// Повторная отправка кода
resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  resendBtn.textContent = 'Отправка...';

  try {
    const res = await fetch('/api/resend-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail })
    });
    const data = await res.json();
    if (!res.ok) {
      showVerifyError(data.error || 'Ошибка отправки');
    } else {
      clearVerifyForm();
      focusFirstDigit();
    }
  } catch {
    showVerifyError('Нет соединения с сервером');
  }

  resendBtn.disabled = false;
  resendBtn.textContent = 'Отправить код повторно';
  startResendTimer();
});

// ==================== LOGIN ====================
const loginFormEl = document.getElementById('login-form');
const loginErrorMsg = document.getElementById('login-error-msg');
const loginBtn = document.getElementById('login-btn');

function showLoginError(msg) { loginErrorMsg.textContent = msg; loginErrorMsg.classList.remove('hidden'); }
function hideLoginError() { loginErrorMsg.classList.add('hidden'); }

loginFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideLoginError();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Вход...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showLoginError(data.error || 'Ошибка входа');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Войти';
      return;
    }
    loginScreen.classList.add('hidden');
    continueScreen.classList.remove('hidden');
  } catch {
    showLoginError('Нет соединения с сервером');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Войти';
  }
});

// ==================== SCARY SCREEN ====================
const continueBtn = document.getElementById('continue-btn');
const bloodContainer = document.getElementById('blood-container');

continueBtn.addEventListener('click', () => {
  continueScreen.classList.add('hidden');
  scaryScreen.classList.remove('hidden');
  startBlood();
  startFlash();
  startScarySound();
});

function startBlood() {
  for (let i = 0; i < 35; i++) setTimeout(() => spawnBloodDrop(), i * 120);
  setInterval(() => {
    for (let i = 0; i < 8; i++) setTimeout(() => spawnBloodDrop(), i * 150);
  }, 3000);
}

function spawnBloodDrop() {
  const drop = document.createElement('div');
  drop.className = 'blood-drop';
  const duration = 2 + Math.random() * 3;
  drop.style.left = `${Math.random() * 100}%`;
  drop.style.width = `${10 + Math.random() * 16}px`;
  drop.style.height = `${80 + Math.random() * 200}px`;
  drop.style.animationDuration = `${duration}s`;
  bloodContainer.appendChild(drop);
  setTimeout(() => drop.remove(), duration * 1000 + 500);
}

function startFlash() {
  let count = 0;
  const interval = setInterval(() => {
    scaryScreen.classList.add('scary-flash');
    setTimeout(() => scaryScreen.classList.remove('scary-flash'), 100);
    if (++count > 5) clearInterval(interval);
  }, 300);
}

function startScarySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    function playCreepyNote(freq, startTime, duration, type = 'sawtooth') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.3, ctx.currentTime + startTime + duration);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
      osc.start(ctx.currentTime + startTime);
      osc.stop(ctx.currentTime + startTime + duration);
    }
    playCreepyNote(220, 0, 1.5);
    playCreepyNote(110, 0.5, 1.5);
    playCreepyNote(165, 1, 2);
    playCreepyNote(55, 1.5, 2.5, 'square');
    playCreepyNote(82, 2.5, 2, 'sawtooth');
    playCreepyNote(41, 3, 3, 'square');
  } catch (e) {}
}

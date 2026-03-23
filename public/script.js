// ==================== WELCOME MESSAGE ====================
const overlay = document.getElementById('welcome-overlay');
const registerScreen = document.getElementById('register-screen');
const continueScreen = document.getElementById('continue-screen');
const scaryScreen = document.getElementById('scary-screen');

setTimeout(() => {
  overlay.classList.add('fade-out');
  setTimeout(() => {
    overlay.remove();
    registerScreen.classList.remove('hidden');
  }, 500);
}, 2000);

// ==================== TABS ====================
const tabs = document.querySelectorAll('.tab');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.tab === 'register') {
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    } else {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    }
    hideError();
    hideLoginError();
  });
});

// ==================== REGISTRATION ====================
const form = document.getElementById('register-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm-password');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}
function hideError() {
  errorMsg.classList.add('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm = confirmInput.value;

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
    registerScreen.classList.add('hidden');
    continueScreen.classList.remove('hidden');
  } catch (err) {
    showError('Нет соединения с сервером');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Зарегистрироваться';
  }
});

// ==================== LOGIN ====================
const loginFormEl = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginErrorMsg = document.getElementById('login-error-msg');
const loginBtn = document.getElementById('login-btn');

function showLoginError(msg) {
  loginErrorMsg.textContent = msg;
  loginErrorMsg.classList.remove('hidden');
}
function hideLoginError() {
  loginErrorMsg.classList.add('hidden');
}

loginFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideLoginError();

  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

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
    registerScreen.classList.add('hidden');
    continueScreen.classList.remove('hidden');
  } catch (err) {
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
  const count = 35;
  for (let i = 0; i < count; i++) {
    setTimeout(() => spawnBloodDrop(), i * 120);
  }
  setInterval(() => {
    for (let i = 0; i < 8; i++) {
      setTimeout(() => spawnBloodDrop(), i * 150);
    }
  }, 3000);
}

function spawnBloodDrop() {
  const drop = document.createElement('div');
  drop.className = 'blood-drop';
  const x = Math.random() * 100;
  const width = 10 + Math.random() * 16;
  const height = 80 + Math.random() * 200;
  const duration = 2 + Math.random() * 3;
  drop.style.left = `${x}%`;
  drop.style.width = `${width}px`;
  drop.style.height = `${height}px`;
  drop.style.animationDuration = `${duration}s`;
  bloodContainer.appendChild(drop);
  setTimeout(() => drop.remove(), duration * 1000 + 500);
}

function startFlash() {
  let count = 0;
  const interval = setInterval(() => {
    scaryScreen.classList.add('scary-flash');
    setTimeout(() => scaryScreen.classList.remove('scary-flash'), 100);
    count++;
    if (count > 5) clearInterval(interval);
  }, 300);
}

function startScarySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    function playCreepyNote(freq, startTime, duration, type = 'sawtooth') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
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

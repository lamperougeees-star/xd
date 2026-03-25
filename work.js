// ==================== SLIDER ====================
const overlay = document.getElementById('welcome-overlay');
const choiceScreen = document.getElementById('choice-screen');
const loginScreen = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const verifyScreen = document.getElementById('verify-screen');
const continueScreen = document.getElementById('continue-screen');
const scaryScreen = document.getElementById('scary-screen');

// Forgot password screens
const forgotScreen = document.getElementById('forgot-screen');
const resetCodeScreen = document.getElementById('reset-code-screen');
const newPasswordScreen = document.getElementById('new-password-screen');

// Кнопки
const continueBtn = document.getElementById('continue-btn');

// ==================== ПРОВЕРКА СЕССИИ ПРИ ЗАГРУЗКЕ ====================
async function checkSession() {
  try {
    const res = await fetch('/api/check-session');
    const data = await res.json();
    if (data.loggedIn) {
      // Пользователь уже залогинен - сразу в магазин
      console.log('Сессия найдена:', data.email);
      if (overlay) overlay.remove();
      if (choiceScreen) hideScreen(choiceScreen);
      showScreen(shopScreen);
      await loadProducts();
      return true;
    }
  } catch (e) {
    console.log('Не удалось проверить сессию');
  }
  return false;
}

// Запускаем проверку сессии
checkSession();

// Функция плавного перехода между экранами
function showScreen(el) {
  el.classList.remove('hidden');
  // Перезапуск анимации
  if (el.classList.contains('screen-transition')) {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }
}

function hideScreen(el) {
  el.classList.add('hidden');
}

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
      showScreen(choiceScreen);
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
  hideScreen(choiceScreen);
  showScreen(loginScreen);
});

document.getElementById('go-register-btn').addEventListener('click', () => {
  hideScreen(choiceScreen);
  showScreen(registerScreen);
});

document.getElementById('back-from-login').addEventListener('click', () => {
  hideScreen(loginScreen);
  showScreen(choiceScreen);
});

document.getElementById('back-from-register').addEventListener('click', () => {
  hideScreen(registerScreen);
  showScreen(choiceScreen);
});

document.getElementById('back-from-verify').addEventListener('click', () => {
  hideScreen(verifyScreen);
  showScreen(registerScreen);
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
    hideScreen(registerScreen);
    showScreen(verifyScreen);
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
    hideScreen(verifyScreen);
    showScreen(continueScreen);
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
    hideScreen(loginScreen);
    showScreen(continueScreen);
  } catch {
    showLoginError('Нет соединения с сервером');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Войти';
  }
});

// ==================== SHOP SCREEN ====================
const shopScreen = document.getElementById('shop-screen');
const productsGrid = document.getElementById('products-grid');

// Товары магазина (будут загружаться с сервера)
let products = [];

continueBtn.addEventListener('click', async () => {
  hideScreen(continueScreen);
  showScreen(shopScreen);
  await loadProducts();
});

// Загрузка товаров с сервера
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (response.ok) {
      products = await response.json();
      renderProducts();
    } else {
      // Если API не доступен, показываем тестовые товары
      renderTestProducts();
    }
  } catch (error) {
    console.error('Ошибка загрузки товаров:', error);
    renderTestProducts();
  }
}

// Рендер товаров
function renderProducts() {
  if (!products || products.length === 0) {
    renderTestProducts();
    return;
  }
  
  productsGrid.innerHTML = products.map(product => `
    <div class="product-card">
      <div class="product-image">${product.icon || '📦'}</div>
      <h3 class="product-name">${product.name}</h3>
      <p class="product-description">${product.description}</p>
      <div class="product-price">${product.price} ₽</div>
      <button class="btn btn-primary" onclick="buyProduct('${product.id}')">Купить</button>
    </div>
  `).join('');
}

// Тестовые товары (если сервер недоступен)
function renderTestProducts() {
  products = [
    { id: 'acc_basic', name: 'Базовый аккаунт', description: 'Доступ к базовым функциям', price: 99, icon: '👤' },
    { id: 'acc_premium', name: 'Премиум аккаунт', description: 'Полный доступ + бонусы', price: 299, icon: '⭐' },
    { id: 'acc_vip', name: 'VIP аккаунт', description: 'Эксклюзивные возможности', price: 599, icon: '👑' }
  ];
  renderProducts();
}

// Покупка товара
async function buyProduct(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  // Здесь будет логика оплаты
  alert(`Покупка: ${product.name} за ${product.price} ₽\n\nВ разработке!`);
}

// Кнопка назад из магазина
document.getElementById('back-from-shop')?.addEventListener('click', () => {
  hideScreen(shopScreen);
  showScreen(choiceScreen);
});

// ==================== ЗАБЫЛИ ПАРОЛЬ ====================
// Кнопка "Забыли пароль" на экране входа
document.getElementById('forgot-password-btn')?.addEventListener('click', () => {
  hideScreen(loginScreen);
  showScreen(forgotScreen);
});

// Кнопка "Назад" с экрана "Забыли пароль"
document.getElementById('back-from-forgot')?.addEventListener('click', () => {
  hideScreen(forgotScreen);
  showScreen(loginScreen);
  document.getElementById('forgot-email').value = '';
  document.getElementById('forgot-error-msg').classList.add('hidden');
});

// Отправка email для сброса пароля
const forgotForm = document.getElementById('forgot-form');
const forgotErrorMsg = document.getElementById('forgot-error-msg');
const forgotBtn = document.getElementById('forgot-btn');

forgotForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  forgotErrorMsg.classList.add('hidden');

  const email = document.getElementById('forgot-email').value.trim();
  if (!email) {
    forgotErrorMsg.textContent = 'Введите email';
    forgotErrorMsg.classList.remove('hidden');
    return;
  }

  forgotBtn.disabled = true;
  forgotBtn.textContent = 'Отправка...';

  try {
    const res = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    
    if (!res.ok) {
      forgotErrorMsg.textContent = data.error || 'Ошибка';
      forgotErrorMsg.classList.remove('hidden');
      forgotBtn.disabled = false;
      forgotBtn.textContent = 'Отправить код';
      return;
    }
    
    // Успех - переходим на экран ввода кода
    pendingEmail = email;
    document.getElementById('reset-email-display').textContent = email;
    hideScreen(forgotScreen);
    showScreen(resetCodeScreen);
    focusFirstResetDigit();
    startResetResendTimer();
    
    forgotBtn.disabled = false;
    forgotBtn.textContent = 'Отправить код';
    
  } catch {
    forgotErrorMsg.textContent = 'Нет соединения с сервером';
    forgotErrorMsg.classList.remove('hidden');
    forgotBtn.disabled = false;
    forgotBtn.textContent = 'Отправить код';
  }
});

// ==================== ВВОД КОДА СБРОСА ====================
// Селекторы для кодов сброса (нужно использовать селекторы с учётом разных экранов)
const resetCodeForm = document.getElementById('reset-code-form');
const resetCodeErrorMsg = document.getElementById('reset-code-error-msg');
const resetCodeBtn = document.getElementById('reset-code-btn');
const resetResendBtn = document.getElementById('reset-resend-btn');
const resetResendTimer = document.getElementById('reset-resend-timer');
const resetTimerCount = document.getElementById('reset-timer-count');
let resetResendTimerInterval = null;

// Используем те же codeDigits, но нужно учесть что они на разных экранах
// Для экрана сброса нужно отдельные селекторы
const resetDigits = resetCodeScreen?.querySelectorAll('.code-digit');

function focusFirstResetDigit() {
  if (resetDigits && resetDigits[0]) {
    setTimeout(() => resetDigits[0].focus(), 100);
  }
}

function getResetCode() {
  if (!resetDigits) return '';
  return Array.from(resetDigits).map(d => d.value).join('');
}

function clearResetForm() {
  if (resetDigits) {
    resetDigits.forEach(d => {
      d.value = '';
      d.classList.remove('filled');
    });
  }
  resetCodeErrorMsg?.classList.add('hidden');
}

// Обработчики ввода для кодов сброса
resetDigits?.forEach((digit, index) => {
  digit.addEventListener('input', (e) => {
    const val = e.target.value;
    if (!/^\d$/.test(val)) {
      e.target.value = '';
      e.target.classList.remove('filled');
      return;
    }
    e.target.classList.add('filled');
    if (index < 5) {
      resetDigits[index + 1].focus();
    }
  });

  digit.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      if (digit.value === '' && index > 0) {
        resetDigits[index - 1].focus();
        resetDigits[index - 1].value = '';
        resetDigits[index - 1].classList.remove('filled');
      } else {
        digit.value = '';
        digit.classList.remove('filled');
      }
    }
  });
});

// Кнопка назад с экрана ввода кода
document.getElementById('back-from-reset-code')?.addEventListener('click', () => {
  hideScreen(resetCodeScreen);
  showScreen(forgotScreen);
  clearResetForm();
  if (resetResendTimerInterval) clearInterval(resetResendTimerInterval);
});

// Отправка кода сброса
resetCodeForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetCodeErrorMsg.classList.add('hidden');

  const code = getResetCode();
  if (code.length !== 6) {
    resetCodeErrorMsg.textContent = 'Введите все 6 цифр кода';
    resetCodeErrorMsg.classList.remove('hidden');
    return;
  }

  resetCodeBtn.disabled = true;
  resetCodeBtn.textContent = 'Проверка...';

  try {
    const res = await fetch('/api/verify-reset-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, code })
    });
    const data = await res.json();
    
    if (!res.ok) {
      resetCodeErrorMsg.textContent = data.error || 'Неверный код';
      resetCodeErrorMsg.classList.remove('hidden');
      resetCodeBtn.disabled = false;
      resetCodeBtn.textContent = 'Продолжить';
      return;
    }
    
    // Успех - переходим на экран нового пароля
    hideScreen(resetCodeScreen);
    showScreen(newPasswordScreen);
    if (resetResendTimerInterval) clearInterval(resendTimerInterval);
    
    resetCodeBtn.disabled = false;
    resetCodeBtn.textContent = 'Продолжить';
    
  } catch {
    resetCodeErrorMsg.textContent = 'Нет соединения с сервером';
    resetCodeErrorMsg.classList.remove('hidden');
    resetCodeBtn.disabled = false;
    resetCodeBtn.textContent = 'Продолжить';
  }
});

// Таймер повторной отправки для сброса
function startResetResendTimer() {
  let seconds = 60;
  resetResendBtn?.classList.add('hidden');
  resetResendTimer?.classList.remove('hidden');
  if (resetTimerCount) resetTimerCount.textContent = seconds;

  if (resetResendTimerInterval) clearInterval(resetResendTimerInterval);
  resetResendTimerInterval = setInterval(() => {
    seconds--;
    if (resetTimerCount) resetTimerCount.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(resetResendTimerInterval);
      resetResendTimer?.classList.add('hidden');
      resetResendBtn?.classList.remove('hidden');
    }
  }, 1000);
}

// Повторная отправка кода сброса
resetResendBtn?.addEventListener('click', async () => {
  resetResendBtn.disabled = true;
  resetResendBtn.textContent = 'Отправка...';

  try {
    const res = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail })
    });
    
    if (res.ok) {
      clearResetForm();
      focusFirstResetDigit();
    }
  } catch {
    // ignore
  }

  resetResendBtn.disabled = false;
  resetResendBtn.textContent = 'Отправить код повторно';
  startResetResendTimer();
});

// ==================== НОВЫЙ ПАРОЛЬ ====================
const newPasswordForm = document.getElementById('new-password-form');
const newPasswordErrorMsg = document.getElementById('new-password-error-msg');
const newPasswordBtn = document.getElementById('new-password-btn');

// Кнопка назад с экрана нового пароля
document.getElementById('back-from-new-password')?.addEventListener('click', () => {
  hideScreen(newPasswordScreen);
  showScreen(resetCodeScreen);
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-new-password').value = '';
  newPasswordErrorMsg.classList.add('hidden');
});

// Сохранение нового пароля
newPasswordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  newPasswordErrorMsg.classList.add('hidden');

  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-new-password').value;

  if (newPassword.length < 6) {
    newPasswordErrorMsg.textContent = 'Пароль должен быть не менее 6 символов';
    newPasswordErrorMsg.classList.remove('hidden');
    return;
  }

  if (newPassword !== confirmPassword) {
    newPasswordErrorMsg.textContent = 'Пароли не совпадают';
    newPasswordErrorMsg.classList.remove('hidden');
    return;
  }

  newPasswordBtn.disabled = true;
  newPasswordBtn.textContent = 'Сохранение...';

  try {
    // Сначала нужно получить код с экрана ввода
    const code = getResetCode();
    
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, code, newPassword })
    });
    const data = await res.json();
    
    if (!res.ok) {
      newPasswordErrorMsg.textContent = data.error || 'Ошибка';
      newPasswordErrorMsg.classList.remove('hidden');
      newPasswordBtn.disabled = false;
      newPasswordBtn.textContent = 'Сохранить пароль';
      return;
    }
    
    // Успех
    alert('Пароль успешно изменён! Теперь войдите с новым паролем.');
    
    // Переходим на экран входа
    hideScreen(newPasswordScreen);
    showScreen(loginScreen);
    document.getElementById('login-password').value = '';
    
    newPasswordBtn.disabled = false;
    newPasswordBtn.textContent = 'Сохранить пароль';
    
  } catch {
    newPasswordErrorMsg.textContent = 'Нет соединения с сервером';
    newPasswordErrorMsg.classList.remove('hidden');
    newPasswordBtn.disabled = false;
    newPasswordBtn.textContent = 'Сохранить пароль';
  }
});


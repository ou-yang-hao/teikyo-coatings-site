const form = document.querySelector('#login-form');
const errorElement = document.querySelector('#login-error');

// 已登录用户无需重复输入账号，直接进入管理后台。
fetch('/api/admin/me').then((response) => {
  if (response.ok) window.location.replace('/admin/');
}).catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorElement.hidden = true;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '正在登录…';

  try {
    const body = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '登录失败。');
    window.location.replace('/admin/');
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = '登录';
  }
});

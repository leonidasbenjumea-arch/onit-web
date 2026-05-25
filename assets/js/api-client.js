export function adminPassword() {
  return sessionStorage.getItem('onit_admin_password') || '';
}

export function setAdminPassword(value) {
  sessionStorage.setItem('onit_admin_password', value || '');
}

export async function adminApi(action, payload = {}) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': adminPassword()
    },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || 'Error en la solicitud.');
  return data;
}

export async function publicApi(action, payload = {}) {
  const res = await fetch('/api/public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.message || 'Error en la solicitud.');
  return data;
}

export function money(value) {
  return '$' + Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

export function qs(selector, root = document) { return root.querySelector(selector); }
export function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4200);
}

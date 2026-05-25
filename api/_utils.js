export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(new Error('El cuerpo de la solicitud no es JSON válido.')); }
    });
    req.on('error', reject);
  });
}

export function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function cleanPhone(value) {
  return String(value ?? '').replace(/[^\d]/g, '').trim();
}

export function normalizePhone(value) {
  const phone = cleanPhone(value);
  if (phone.startsWith('57') && phone.length > 10) return phone.slice(2);
  return phone;
}

export function money(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').replace(/\$/g, '').replace(/COP/gi, '').replace(/[^\d,.-]/g, '');
  if (!text) return 0;
  const normalized = text.includes(',') && text.includes('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthRange(monthKey) {
  const now = new Date();
  const [y, m] = String(monthKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), monthKey: `${y}-${String(m).padStart(2, '0')}` };
}

export function requireAdmin(req) {
  const expected = process.env.APP_ADMIN_PASSWORD || '1234';
  const provided = req.headers['x-admin-password'] || '';
  if (String(provided) !== String(expected)) throw new Error('Contraseña administrativa incorrecta.');
}

export function nextDatesForSchedule(dayOfWeek, days = 14) {
  const dates = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === Number(dayOfWeek)) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

import { publicApi, qs, toast } from './api-client.js';

let current = null;

const txt = {
  es: {
    title: 'Reserva de clases',
    sub: 'Ingresa tu teléfono para consultar clases disponibles según tu plan.',
    phone: 'Teléfono',
    enter: 'Ingresar',
    active: 'Plan activo',
    noActive: 'No encontramos plan activo o clases disponibles.',
    reserve: 'Reservar',
    back: 'Volver al inicio',
    confirmed: 'Reserva confirmada.'
  },
  en: {
    title: 'Class booking',
    sub: 'Enter your phone number to see available classes according to your plan.',
    phone: 'Phone',
    enter: 'Enter',
    active: 'Active plan',
    noActive: 'We could not find an active plan or available classes.',
    reserve: 'Book',
    back: 'Back to start',
    confirmed: 'Booking confirmed.'
  }
};
let lang = 'es';

window.addEventListener('DOMContentLoaded', () => {
  setLang('es');
  qs('#langEs').addEventListener('click', () => setLang('es'));
  qs('#langEn').addEventListener('click', () => setLang('en'));
  qs('#phoneForm').addEventListener('submit', findStudent);
});

function setLang(next) {
  lang = next;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = txt[lang][el.dataset.t]; });
}

async function findStudent(e) {
  e.preventDefault();
  qs('#results').innerHTML = '<p>Cargando...</p>';
  try {
    current = await publicApi('findStudentForReservation', { phone: qs('#phone').value });
    if (!current.access?.active) {
      qs('#results').innerHTML = `<div class="card"><h3>${current.student?.name || ''}</h3><p>${txt[lang].noActive}</p></div>`;
      return;
    }
    renderOptions(current.options || []);
  } catch (err) { toast(err.message); qs('#results').innerHTML = ''; }
}

function renderOptions(options) {
  const access = current.access;
  const credit = access.creditsAvailable == null ? '' : ` · ${access.creditsAvailable} clases disponibles`;
  const items = options.filter(o => o.available > 0).map(o => `
    <div class="option">
      <div>
        <strong>${escapeHtml(o.class_name)}</strong><br>
        <span style="color:var(--muted)">${o.class_date} · ${String(o.start_time).slice(0,5)} · ${o.available} cupos</span>
      </div>
      <button class="btn primary" data-schedule="${o.schedule_id}" data-date="${o.class_date}">${txt[lang].reserve}</button>
    </div>
  `).join('') || `<p>${txt[lang].noActive}</p>`;
  qs('#results').innerHTML = `<div class="card"><h3>${escapeHtml(current.student.name)}</h3><p>${txt[lang].active}${credit}</p><div class="option-list">${items}</div></div>`;
  document.querySelectorAll('[data-schedule]').forEach(btn => btn.addEventListener('click', () => reserve(btn.dataset.schedule, btn.dataset.date)));
}

async function reserve(schedule_id, class_date) {
  try {
    await publicApi('reserveClass', { phone: qs('#phone').value, schedule_id, class_date });
    toast(txt[lang].confirmed);
    qs('#phoneForm').dispatchEvent(new Event('submit', { cancelable: true }));
  } catch (err) { toast(err.message); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

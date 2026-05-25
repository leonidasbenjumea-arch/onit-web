import { publicApi, qs, toast } from './api-client.js';

const txt = {
  es: {
    title: 'Clase de cortesía',
    sub: 'Completa tus datos y elige una clase disponible.',
    privacy: 'Acepto el tratamiento de mis datos personales.',
    submit: 'Solicitar clase',
    back: 'Volver al inicio',
    ok: 'Solicitud registrada. Revisa tu correo si está configurado el envío automático.'
  },
  en: {
    title: 'Courtesy class',
    sub: 'Fill in your information and choose an available class.',
    privacy: 'I accept the processing of my personal data.',
    submit: 'Request class',
    back: 'Back to start',
    ok: 'Request registered. Check your email if automatic sending is configured.'
  }
};
let lang = 'es';
let options = [];

window.addEventListener('DOMContentLoaded', async () => {
  setLang('es');
  qs('#langEs').addEventListener('click', () => setLang('es'));
  qs('#langEn').addEventListener('click', () => setLang('en'));
  qs('#courtesyForm').addEventListener('submit', submitForm);
  await loadOptions();
});

function setLang(next) {
  lang = next;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = txt[lang][el.dataset.t]; });
  qs('#language').value = lang;
}

async function loadOptions() {
  try {
    const data = await publicApi('getCourtesyOptions');
    options = data.options || [];
    const html = '<option value="">Seleccionar clase</option>' + options.filter(o => o.available > 0).map(o => `<option value="${o.schedule_id}|${o.class_date}">${escapeHtml(o.class_name)} · ${o.class_date} · ${String(o.start_time).slice(0,5)} · ${o.available} cupos</option>`).join('');
    qs('#classOption').innerHTML = html;
  } catch (err) { toast(err.message); }
}

async function submitForm(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const [schedule_id, class_date] = String(data.classOption || '').split('|');
  data.schedule_id = schedule_id;
  data.class_date = class_date;
  data.data_processing_accepted = qs('#dataProcessing').checked;
  data.is_minor = qs('#isMinor').checked;
  data.has_martial_arts_experience = qs('#hasExperience').checked;
  try {
    await publicApi('submitCourtesy', data);
    e.target.reset();
    setLang(lang);
    await loadOptions();
    toast(txt[lang].ok);
  } catch (err) { toast(err.message); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

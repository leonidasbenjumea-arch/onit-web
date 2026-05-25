import { adminApi, setAdminPassword, money, qs, qsa, toast } from './api-client.js';

let state = { monthKey: new Date().toISOString().slice(0,7), data: null };

window.addEventListener('DOMContentLoaded', () => {
  qs('#monthKey').value = state.monthKey;
  qs('#loginForm').addEventListener('submit', login);
  qs('#refreshBtn').addEventListener('click', load);
  qs('#monthKey').addEventListener('change', e => { state.monthKey = e.target.value; load(); });
  qsa('[data-section]').forEach(btn => btn.addEventListener('click', () => showSection(btn.dataset.section)));
  bindForms();
});

async function login(e) {
  e.preventDefault();
  setAdminPassword(qs('#adminPassword').value);
  qs('#loginScreen').style.display = 'none';
  qs('#appShell').style.display = 'grid';
  await load();
}

async function load() {
  try {
    toast('Cargando información...');
    state.data = await adminApi('bootstrap', { monthKey: state.monthKey });
    renderAll();
    toast('Información actualizada.');
  } catch (err) {
    toast(err.message);
    qs('#loginScreen').style.display = 'grid';
    qs('#appShell').style.display = 'none';
  }
}

function showSection(id) {
  qsa('.section').forEach(s => s.classList.toggle('active', s.id === id));
  qsa('[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === id));
}

function renderAll() {
  const d = state.data;
  document.documentElement.style.setProperty('--brand', d.academy.primary_color || '#111827');
  document.documentElement.style.setProperty('--accent', d.academy.accent_color || '#D8FF3E');
  qs('#academyName').textContent = d.academy.name;
  qs('#academySub').textContent = d.academy.app_name || 'ONIT Platform';
  qs('#mIngresos').textContent = money(d.dashboard.totalIncomes);
  qs('#mEgresos').textContent = money(d.dashboard.totalExpenses);
  qs('#mSaldo').textContent = money(d.dashboard.operativeBalance);
  qs('#mCartera').textContent = money(d.dashboard.receivables);
  qs('#mInvCosto').textContent = money(d.dashboard.inventoryCost);
  qs('#mInvVenta').textContent = money(d.dashboard.inventorySaleValue);
  renderGroups('incomeGroups', d.dashboard.incomesByRubric);
  renderGroups('expenseGroups', d.dashboard.expensesByRubric);
  renderGroups('expenseTypeGroups', d.dashboard.expensesByType);
  renderTables();
  populateSelects();
}

function renderGroups(id, rows) {
  const el = qs('#' + id);
  el.innerHTML = (rows || []).map(r => `<tr><td>${escapeHtml(r.label)}</td><td>${money(r.value)}</td></tr>`).join('') || '<tr><td colspan="2">Sin datos</td></tr>';
}

function renderTables() {
  const d = state.data;
  qs('#paymentsRows').innerHTML = d.payments.map(p => `<tr><td>${p.paid_at || ''}</td><td>${escapeHtml(p.students?.name || '')}</td><td>${escapeHtml(p.rubrics?.name || '')}</td><td>${escapeHtml(p.concept)}</td><td>${money(p.amount)}</td><td>${p.due_at || ''}</td></tr>`).join('') || '<tr><td colspan="6">Sin ingresos este mes</td></tr>';
  qs('#expensesRows').innerHTML = d.expenses.map(x => `<tr><td>${x.expense_date || ''}</td><td>${escapeHtml(x.rubrics?.name || '')}</td><td>${escapeHtml(x.expense_type || '')}</td><td>${escapeHtml(x.description)}</td><td>${money(x.amount)}</td></tr>`).join('') || '<tr><td colspan="5">Sin egresos este mes</td></tr>';
  qs('#studentsRows').innerHTML = d.students.map(s => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.phone || '')}</td><td>${escapeHtml(s.email || '')}</td><td>${escapeHtml(s.eps || '')}</td></tr>`).join('') || '<tr><td colspan="4">Sin alumnos</td></tr>';
  qs('#itemsRows').innerHTML = d.items.map(i => `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.rubrics?.name || '')}</td><td>${escapeHtml(i.item_type)}</td><td>${money(i.price)}</td><td>${money(i.cost)}</td><td>${i.stock ?? ''}</td></tr>`).join('') || '<tr><td colspan="6">Sin productos o planes</td></tr>';
  qs('#receivablesRows').innerHTML = d.receivables.map(r => `<tr><td>${r.delivered_at || ''}</td><td>${escapeHtml(r.students?.name || '')}</td><td>${escapeHtml(r.concept)}</td><td>${money(r.amount)}</td><td><button class="btn" data-pay-receivable="${r.id}">Marcar pagado</button></td></tr>`).join('') || '<tr><td colspan="5">Sin cartera pendiente</td></tr>';
  qsa('[data-pay-receivable]').forEach(btn => btn.addEventListener('click', () => markReceivablePaid(btn.dataset.payReceivable)));
  qs('#schedulesRows').innerHTML = d.schedules.map(s => `<tr><td>${dayName(s.day_of_week)}</td><td>${s.start_time || ''}</td><td>${escapeHtml(s.class_name)}</td><td>${escapeHtml(s.rubrics?.name || '')}</td><td>${s.capacity}</td><td>${s.allow_courtesy ? 'SI' : 'NO'}</td></tr>`).join('') || '<tr><td colspan="6">Sin clases configuradas</td></tr>';
  qs('#movementsRows').innerHTML = d.movements.map(m => `<tr><td>${m.movement_date || ''}</td><td>${escapeHtml(m.catalog_items?.name || '')}</td><td>${m.quantity}</td><td>${money(m.total)}</td><td>${escapeHtml(m.payment_status)}</td><td>${escapeHtml(m.students?.name || '')}</td></tr>`).join('') || '<tr><td colspan="6">Sin ventas de inventario</td></tr>';
}

function populateSelects() {
  const d = state.data;
  const rubricsOptions = '<option value="">Sin rubro</option>' + d.rubrics.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  qsa('[data-rubric-select]').forEach(s => s.innerHTML = rubricsOptions);

  const studentOptions = '<option value="">Sin alumno</option>' + d.students.map(s => `<option value="${s.id}">${escapeHtml(s.name)} · ${escapeHtml(s.phone || '')}</option>`).join('');
  qsa('[data-student-select]').forEach(s => s.innerHTML = studentOptions);

  const itemOptions = '<option value="">Seleccionar</option>' + d.items.map(i => `<option value="${i.id}">${escapeHtml(i.name)} · ${money(i.price)} · ${escapeHtml(i.item_type)}</option>`).join('');
  qsa('[data-item-select]').forEach(s => s.innerHTML = itemOptions);

  const productOptions = '<option value="">Seleccionar producto</option>' + d.items.filter(i => i.item_type === 'product').map(i => `<option value="${i.id}">${escapeHtml(i.name)} · Stock ${i.stock}</option>`).join('');
  qsa('[data-product-select]').forEach(s => s.innerHTML = productOptions);
}

function bindForms() {
  bind('studentForm', 'createStudent');
  bind('rubricForm', 'createRubric');
  bind('itemForm', 'createItem');
  bind('paymentForm', 'createPayment');
  bind('expenseForm', 'createExpense');
  bind('saleForm', 'sellProduct');
  bind('scheduleForm', 'createSchedule');
}

function bind(formId, action) {
  qs('#' + formId).addEventListener('submit', async e => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    if (action === 'sellProduct') payload.payment_status = qs('#salePaid').checked ? 'paid' : 'pending';
    if (action === 'createSchedule') payload.allow_courtesy = qs('#allowCourtesy').checked;
    try {
      await adminApi(action, payload);
      e.target.reset();
      await load();
      toast('Guardado correctamente.');
    } catch (err) {
      toast(err.message);
    }
  });
}

async function markReceivablePaid(id) {
  if (!confirm('¿Marcar esta cuenta como pagada?')) return;
  try {
    await adminApi('markReceivablePaid', { id, paid_at: new Date().toISOString().slice(0,10) });
    await load();
    toast('Cartera pagada.');
  } catch (err) { toast(err.message); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function dayName(n) {
  return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][Number(n)] || '';
}

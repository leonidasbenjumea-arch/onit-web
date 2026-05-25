import { supabaseAdmin, getAcademy } from './_supabase.js';
import { json, readBody, requireAdmin, cleanText, cleanPhone, normalizePhone, money, monthRange, todayISO } from './_utils.js';

async function loadBootstrap(db, academy, monthKey) {
  const range = monthRange(monthKey);
  const [students, rubrics, items, payments, expenses, receivables, schedules, movements] = await Promise.all([
    db.from('students').select('*').eq('academy_id', academy.id).order('name'),
    db.from('rubrics').select('*').eq('academy_id', academy.id).order('name'),
    db.from('catalog_items').select('*, rubrics(name)').eq('academy_id', academy.id).order('name'),
    db.from('payments').select('*, students(name, phone), rubrics(name), catalog_items(name, item_type)').eq('academy_id', academy.id).gte('paid_at', range.start).lt('paid_at', range.end).order('paid_at', { ascending: false }),
    db.from('expenses').select('*, rubrics(name)').eq('academy_id', academy.id).gte('expense_date', range.start).lt('expense_date', range.end).order('expense_date', { ascending: false }),
    db.from('receivables').select('*, students(name, phone), catalog_items(name)').eq('academy_id', academy.id).eq('status', 'pending').order('delivered_at', { ascending: false }),
    db.from('class_schedules').select('*, rubrics(name)').eq('academy_id', academy.id).order('day_of_week').order('start_time'),
    db.from('inventory_movements').select('*, catalog_items(name), students(name)').eq('academy_id', academy.id).order('movement_date', { ascending: false }).limit(200)
  ]);

  for (const result of [students, rubrics, items, payments, expenses, receivables, schedules, movements]) {
    if (result.error) throw new Error(result.error.message);
  }

  const paidRows = payments.data || [];
  const expenseRows = expenses.data || [];
  const receivableRows = receivables.data || [];
  const productRows = (items.data || []).filter(i => i.item_type === 'product');
  const totalIncomes = paidRows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const totalExpenses = expenseRows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const cartera = receivableRows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const inventoryCost = productRows.reduce((a, r) => a + Number(r.stock || 0) * Number(r.cost || 0), 0);
  const inventorySaleValue = productRows.reduce((a, r) => a + Number(r.stock || 0) * Number(r.price || 0), 0);

  return {
    ok: true,
    academy,
    monthKey: range.monthKey,
    dashboard: {
      totalIncomes,
      totalExpenses,
      operativeBalance: totalIncomes - totalExpenses,
      receivables: cartera,
      inventoryCost,
      inventorySaleValue,
      incomesByRubric: groupByName(paidRows, r => r.rubrics?.name || 'Sin rubro', 'amount'),
      expensesByRubric: groupByName(expenseRows, r => r.rubrics?.name || 'Sin rubro', 'amount'),
      expensesByType: groupByName(expenseRows, r => r.expense_type || 'Sin tipo', 'amount')
    },
    students: students.data || [],
    rubrics: rubrics.data || [],
    items: items.data || [],
    payments: paidRows,
    expenses: expenseRows,
    receivables: receivableRows,
    schedules: schedules.data || [],
    movements: movements.data || []
  };
}

function groupByName(rows, getLabel, amountKey) {
  const map = new Map();
  for (const r of rows) {
    const label = getLabel(r);
    map.set(label, (map.get(label) || 0) + Number(r[amountKey] || 0));
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

async function findStudent(db, academyId, studentId, phone, name) {
  if (studentId) {
    const { data, error } = await db.from('students').select('*').eq('academy_id', academyId).eq('id', studentId).single();
    if (!error && data) return data;
  }
  const clean = normalizePhone(phone);
  if (clean) {
    const { data } = await db.from('students').select('*').eq('academy_id', academyId).eq('phone', clean).limit(1);
    if (data && data[0]) return data[0];
  }
  if (name) {
    const { data } = await db.from('students').select('*').eq('academy_id', academyId).ilike('name', cleanText(name)).limit(1);
    if (data && data[0]) return data[0];
  }
  return null;
}

async function createStudent(db, academy, body) {
  const payload = {
    academy_id: academy.id,
    name: cleanText(body.name),
    country_code: cleanText(body.country_code || body.countryCode || '57'),
    phone: normalizePhone(body.phone),
    email: cleanText(body.email),
    eps: cleanText(body.eps),
    emergency_contact: cleanText(body.emergency_contact || body.emergencyContact),
    emergency_phone: cleanPhone(body.emergency_phone || body.emergencyPhone),
    notes: cleanText(body.notes)
  };
  if (!payload.name) throw new Error('El nombre del alumno es obligatorio.');
  const { data, error } = await db.from('students').insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return { ok: true, student: data };
}

async function createRubric(db, academy, body) {
  const name = cleanText(body.name);
  if (!name) throw new Error('El nombre del rubro es obligatorio.');
  const { data, error } = await db.from('rubrics').insert({ academy_id: academy.id, name, description: cleanText(body.description), active: body.active !== false }).select('*').single();
  if (error) throw new Error(error.message);
  return { ok: true, rubric: data };
}

async function createItem(db, academy, body) {
  const payload = {
    academy_id: academy.id,
    rubric_id: body.rubric_id || null,
    name: cleanText(body.name),
    item_type: body.item_type || 'plan',
    price: money(body.price),
    cost: money(body.cost),
    stock: money(body.stock),
    class_credits: body.class_credits ? Number(body.class_credits) : null,
    validity_days: body.validity_days ? Number(body.validity_days) : null,
    active: body.active !== false
  };
  if (!payload.name) throw new Error('El nombre del plan o producto es obligatorio.');
  const { data, error } = await db.from('catalog_items').insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return { ok: true, item: data };
}

async function createPayment(db, academy, body) {
  const student = await findStudent(db, academy.id, body.student_id, body.phone, body.student_name);
  const itemId = body.item_id || null;
  let item = null;
  if (itemId) {
    const { data } = await db.from('catalog_items').select('*').eq('academy_id', academy.id).eq('id', itemId).single();
    item = data;
  }
  const paidAt = body.paid_at || todayISO();
  const amount = money(body.amount || item?.price || 0);
  const payload = {
    academy_id: academy.id,
    student_id: student?.id || null,
    rubric_id: body.rubric_id || item?.rubric_id || null,
    item_id: itemId,
    concept: cleanText(body.concept || item?.name || 'Pago'),
    source: body.source || (item?.item_type === 'product' ? 'product' : 'membership'),
    amount,
    payment_method: cleanText(body.payment_method || body.paymentMethod),
    paid_at: paidAt,
    due_at: body.due_at || null,
    status: 'paid',
    class_credits_total: body.class_credits_total ? Number(body.class_credits_total) : item?.class_credits || null,
    class_credits_used: 0,
    notes: cleanText(body.notes)
  };
  if (!payload.amount) throw new Error('El valor del pago debe ser mayor a cero.');
  const { data, error } = await db.from('payments').insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return { ok: true, payment: data };
}

async function createExpense(db, academy, body) {
  const payload = {
    academy_id: academy.id,
    rubric_id: body.rubric_id || null,
    expense_type: cleanText(body.expense_type || body.expenseType || 'Operacion'),
    description: cleanText(body.description),
    amount: money(body.amount),
    expense_date: body.expense_date || body.expenseDate || todayISO(),
    source: cleanText(body.source),
    notes: cleanText(body.notes)
  };
  if (!payload.description) throw new Error('La descripción del egreso es obligatoria.');
  if (!payload.amount) throw new Error('El valor del egreso debe ser mayor a cero.');
  const { data, error } = await db.from('expenses').insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return { ok: true, expense: data };
}

async function sellProduct(db, academy, body) {
  const itemId = body.item_id;
  const qty = Number(body.quantity || 1);
  if (!itemId) throw new Error('Selecciona un producto.');
  if (!qty || qty <= 0) throw new Error('La cantidad debe ser mayor a cero.');

  const { data: item, error: itemError } = await db.from('catalog_items').select('*').eq('academy_id', academy.id).eq('id', itemId).single();
  if (itemError || !item) throw new Error('No encontré el producto.');
  if (item.item_type !== 'product') throw new Error('El ítem seleccionado no es un producto.');
  if (Number(item.stock || 0) < qty) throw new Error('No hay stock suficiente para esta venta.');

  const student = await findStudent(db, academy.id, body.student_id, body.phone, body.student_name);
  const total = qty * Number(item.price || 0);
  const paid = String(body.payment_status || 'paid') === 'paid';
  const date = body.movement_date || todayISO();

  const updates = [];
  const { error: stockError } = await db.from('catalog_items').update({ stock: Number(item.stock || 0) - qty }).eq('id', item.id);
  if (stockError) throw new Error(stockError.message);

  const { error: movError } = await db.from('inventory_movements').insert({
    academy_id: academy.id,
    item_id: item.id,
    student_id: student?.id || null,
    movement_type: 'out',
    quantity: qty,
    unit_price: Number(item.price || 0),
    unit_cost: Number(item.cost || 0),
    total,
    payment_status: paid ? 'paid' : 'pending',
    movement_date: date,
    notes: cleanText(body.notes)
  });
  if (movError) throw new Error(movError.message);

  if (paid) {
    const result = await createPayment(db, academy, {
      student_id: student?.id,
      item_id: item.id,
      rubric_id: item.rubric_id,
      concept: item.name,
      source: 'product',
      amount: total,
      paid_at: date,
      payment_method: body.payment_method,
      notes: body.notes
    });
    updates.push(result.payment);
  } else {
    const { data, error } = await db.from('receivables').insert({
      academy_id: academy.id,
      student_id: student?.id || null,
      item_id: item.id,
      concept: item.name,
      source: 'product',
      amount: total,
      delivered_at: date,
      due_date: body.due_date || null,
      status: 'pending',
      notes: cleanText(body.notes)
    }).select('*').single();
    if (error) throw new Error(error.message);
    updates.push(data);
  }
  return { ok: true, message: paid ? 'Venta registrada como ingreso.' : 'Venta registrada en cartera y descontada del inventario.' };
}

async function markReceivablePaid(db, academy, body) {
  const id = body.id;
  const paidAt = body.paid_at || todayISO();
  if (!id) throw new Error('Falta el ID de la cartera.');
  const { data: rec, error } = await db.from('receivables').select('*').eq('academy_id', academy.id).eq('id', id).single();
  if (error || !rec) throw new Error('No encontré la cuenta por cobrar.');
  if (rec.status === 'paid') return { ok: true, message: 'La cuenta ya estaba pagada.' };

  const { error: updError } = await db.from('receivables').update({ status: 'paid', paid_at: paidAt }).eq('id', id);
  if (updError) throw new Error(updError.message);

  await createPayment(db, academy, {
    student_id: rec.student_id,
    item_id: rec.item_id,
    concept: rec.concept,
    source: rec.source,
    amount: rec.amount,
    paid_at: paidAt,
    payment_method: body.payment_method,
    notes: 'Pago de cartera'
  });

  return { ok: true, message: 'Cuenta por cobrar marcada como pagada.' };
}

async function createSchedule(db, academy, body) {
  const payload = {
    academy_id: academy.id,
    rubric_id: body.rubric_id || null,
    class_name: cleanText(body.class_name || body.className),
    day_of_week: Number(body.day_of_week),
    start_time: body.start_time,
    duration_minutes: Number(body.duration_minutes || 60),
    capacity: Number(body.capacity || 20),
    allow_courtesy: body.allow_courtesy !== false,
    active: body.active !== false
  };
  if (!payload.class_name) throw new Error('El nombre de la clase es obligatorio.');
  const { data, error } = await db.from('class_schedules').insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return { ok: true, schedule: data };
}

async function deleteRecord(db, academy, body) {
  const allowed = new Set(['students', 'rubrics', 'catalog_items', 'payments', 'expenses', 'receivables', 'class_schedules', 'reservations']);
  if (!allowed.has(body.table)) throw new Error('Tabla no permitida.');
  const { error } = await db.from(body.table).delete().eq('academy_id', academy.id).eq('id', body.id);
  if (error) throw new Error(error.message);
  return { ok: true, message: 'Registro eliminado.' };
}

export default async function handler(req, res) {
  try {
    requireAdmin(req);
    const body = req.method === 'GET' ? req.query : await readBody(req);
    const db = supabaseAdmin();
    const academy = await getAcademy(db, body.academy);
    const action = body.action || 'bootstrap';

    let result;
    if (action === 'bootstrap') result = await loadBootstrap(db, academy, body.monthKey);
    else if (action === 'createStudent') result = await createStudent(db, academy, body);
    else if (action === 'createRubric') result = await createRubric(db, academy, body);
    else if (action === 'createItem') result = await createItem(db, academy, body);
    else if (action === 'createPayment') result = await createPayment(db, academy, body);
    else if (action === 'createExpense') result = await createExpense(db, academy, body);
    else if (action === 'sellProduct') result = await sellProduct(db, academy, body);
    else if (action === 'markReceivablePaid') result = await markReceivablePaid(db, academy, body);
    else if (action === 'createSchedule') result = await createSchedule(db, academy, body);
    else if (action === 'deleteRecord') result = await deleteRecord(db, academy, body);
    else throw new Error('Acción no reconocida.');

    json(res, 200, result);
  } catch (err) {
    json(res, 400, { ok: false, message: err.message });
  }
}

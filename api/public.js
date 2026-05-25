import { supabaseAdmin, getAcademy } from './_supabase.js';
import { json, readBody, cleanText, cleanPhone, normalizePhone, todayISO, nextDatesForSchedule } from './_utils.js';

async function findStudent(db, academyId, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await db.from('students').select('*').eq('academy_id', academyId).eq('phone', normalized).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function activeAccess(db, academyId, studentId) {
  const today = todayISO();
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('academy_id', academyId)
    .eq('student_id', studentId)
    .eq('status', 'paid')
    .or(`due_at.gte.${today},class_credits_total.not.is.null`)
    .order('paid_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data || [];
  const unlimited = rows.find(r => r.due_at && r.due_at >= today && !r.class_credits_total);
  const packagePlan = rows.find(r => Number(r.class_credits_total || 0) > Number(r.class_credits_used || 0));
  return { ok: Boolean(unlimited || packagePlan), unlimited, packagePlan, rows };
}

async function schedulesWithAvailability(db, academyId, allowCourtesyOnly = false) {
  let query = db.from('class_schedules').select('*, rubrics(name)').eq('academy_id', academyId).eq('active', true).order('day_of_week').order('start_time');
  if (allowCourtesyOnly) query = query.eq('allow_courtesy', true);
  const { data: schedules, error } = await query;
  if (error) throw new Error(error.message);

  const options = [];
  for (const s of schedules || []) {
    for (const date of nextDatesForSchedule(s.day_of_week, 14)) {
      const { count, error: countError } = await db
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('schedule_id', s.id)
        .eq('class_date', date)
        .neq('status', 'cancelled');
      if (countError) throw new Error(countError.message);
      const reserved = count || 0;
      options.push({
        schedule_id: s.id,
        class_name: s.class_name,
        rubric: s.rubrics?.name || '',
        class_date: date,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        duration_minutes: s.duration_minutes,
        capacity: s.capacity,
        reserved,
        available: Math.max(Number(s.capacity || 0) - reserved, 0),
        allow_courtesy: s.allow_courtesy
      });
    }
  }
  return options.sort((a, b) => `${a.class_date} ${a.start_time}`.localeCompare(`${b.class_date} ${b.start_time}`));
}

async function findStudentForReservation(db, academy, body) {
  const student = await findStudent(db, academy.id, body.phone);
  if (!student) return { ok: false, message: 'No encontramos un alumno con ese teléfono.' };
  const access = await activeAccess(db, academy.id, student.id);
  const options = access.ok ? await schedulesWithAvailability(db, academy.id, false) : [];
  return {
    ok: true,
    student: { id: student.id, name: student.name, phone: student.phone },
    access: {
      active: access.ok,
      type: access.unlimited ? 'monthly' : access.packagePlan ? 'package' : 'none',
      creditsAvailable: access.packagePlan ? Number(access.packagePlan.class_credits_total || 0) - Number(access.packagePlan.class_credits_used || 0) : null
    },
    options
  };
}

async function reserveClass(db, academy, body) {
  const student = await findStudent(db, academy.id, body.phone);
  if (!student) throw new Error('No encontramos un alumno con ese teléfono.');

  const access = await activeAccess(db, academy.id, student.id);
  if (!access.ok) throw new Error('No encontramos un plan activo o clases disponibles para reservar.');

  const scheduleId = body.schedule_id;
  const classDate = body.class_date;
  if (!scheduleId || !classDate) throw new Error('Selecciona clase y fecha.');

  const { data: schedule, error: scheduleError } = await db.from('class_schedules').select('*').eq('academy_id', academy.id).eq('id', scheduleId).single();
  if (scheduleError || !schedule) throw new Error('Horario no encontrado.');

  const { count, error: countError } = await db.from('reservations').select('*', { count: 'exact', head: true }).eq('schedule_id', scheduleId).eq('class_date', classDate).neq('status', 'cancelled');
  if (countError) throw new Error(countError.message);
  if ((count || 0) >= Number(schedule.capacity || 0)) throw new Error('Esta clase ya no tiene cupos disponibles.');

  const { data, error } = await db.from('reservations').insert({
    academy_id: academy.id,
    student_id: student.id,
    schedule_id: scheduleId,
    class_date: classDate,
    source: 'student',
    status: 'reserved'
  }).select('*').single();
  if (error) throw new Error(error.message);

  if (access.packagePlan) {
    await db.from('payments').update({ class_credits_used: Number(access.packagePlan.class_credits_used || 0) + 1 }).eq('id', access.packagePlan.id);
  }

  return { ok: true, message: 'Reserva confirmada.', reservation: data };
}

async function submitCourtesy(db, academy, body) {
  if (!body.data_processing_accepted) throw new Error('Debes aceptar el tratamiento de datos para solicitar la clase.');
  const name = cleanText(body.name);
  const phone = normalizePhone(body.phone);
  const email = cleanText(body.email);
  if (!name || !phone || !email) throw new Error('Nombre, teléfono y correo son obligatorios.');

  let student = await findStudent(db, academy.id, phone);
  if (!student) {
    const { data, error } = await db.from('students').insert({
      academy_id: academy.id,
      name,
      country_code: cleanText(body.country_code || '57'),
      phone,
      email,
      eps: cleanText(body.eps),
      emergency_contact: cleanText(body.emergency_contact),
      emergency_phone: cleanPhone(body.emergency_phone),
      weight_kg: body.weight_kg || null,
      height_cm: body.height_cm || null,
      injuries: cleanText(body.injuries),
      is_minor: Boolean(body.is_minor),
      guardian_name: cleanText(body.guardian_name),
      guardian_phone: cleanPhone(body.guardian_phone),
      has_martial_arts_experience: Boolean(body.has_martial_arts_experience),
      martial_art: cleanText(body.martial_art),
      belt: cleanText(body.belt),
      data_processing_accepted: true,
      data_processing_accepted_at: new Date().toISOString(),
      notes: 'Registro creado desde clase de cortesía.'
    }).select('*').single();
    if (error) throw new Error(error.message);
    student = data;
  }

  const scheduleId = body.schedule_id;
  const classDate = body.class_date;
  if (!scheduleId || !classDate) throw new Error('Selecciona una clase de cortesía.');

  const { data: schedule, error: scheduleError } = await db.from('class_schedules').select('*').eq('academy_id', academy.id).eq('id', scheduleId).eq('allow_courtesy', true).single();
  if (scheduleError || !schedule) throw new Error('La clase seleccionada no está disponible para cortesía.');

  const { count } = await db.from('reservations').select('*', { count: 'exact', head: true }).eq('schedule_id', scheduleId).eq('class_date', classDate).neq('status', 'cancelled');
  if ((count || 0) >= Number(schedule.capacity || 0)) throw new Error('Esta clase ya no tiene cupos disponibles.');

  const { data: reservation, error: reservationError } = await db.from('reservations').insert({
    academy_id: academy.id,
    student_id: student.id,
    schedule_id: scheduleId,
    class_date: classDate,
    source: 'courtesy',
    status: 'reserved'
  }).select('*').single();
  if (reservationError) throw new Error(reservationError.message);

  const { data: request, error: requestError } = await db.from('courtesy_requests').insert({
    academy_id: academy.id,
    student_id: student.id,
    schedule_id: scheduleId,
    class_date: classDate,
    language: cleanText(body.language || 'es'),
    data_processing_accepted: true,
    status: 'confirmed',
    notes: cleanText(body.notes)
  }).select('*').single();
  if (requestError) throw new Error(requestError.message);

  await sendCourtesyEmailIfConfigured(academy, student, schedule, classDate, body.language || 'es');

  return { ok: true, message: 'Clase de cortesía solicitada y reservada.', request, reservation };
}

async function getCourtesyOptions(db, academy) {
  return { ok: true, academy: publicAcademy(academy), options: await schedulesWithAvailability(db, academy.id, true) };
}

function publicAcademy(academy) {
  return {
    name: academy.name,
    slug: academy.slug,
    logoUrl: academy.logo_url,
    primaryColor: academy.primary_color,
    accentColor: academy.accent_color,
    privacyText: academy.privacy_text
  };
}

async function sendCourtesyEmailIfConfigured(academy, student, schedule, classDate, language) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !student.email) return;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const isEn = language === 'en';
    const subject = isEn ? `Courtesy class confirmation - ${academy.name}` : `Confirmación de clase de cortesía - ${academy.name}`;
    const html = `
      <div style="font-family:Arial,sans-serif;background:#eef3ea;padding:24px;border-radius:24px;color:#111827;max-width:620px">
        <h2 style="margin:0 0 12px">${subject}</h2>
        <p>${isEn ? 'Hi' : 'Hola'} <strong>${student.name}</strong>,</p>
        <p>${isEn ? 'Your courtesy class has been registered.' : 'Tu clase de cortesía quedó registrada.'}</p>
        <div style="background:white;border-radius:18px;padding:16px;margin:16px 0">
          <p><strong>${isEn ? 'Class' : 'Clase'}:</strong> ${schedule.class_name}</p>
          <p><strong>${isEn ? 'Date' : 'Fecha'}:</strong> ${classDate}</p>
          <p><strong>${isEn ? 'Time' : 'Hora'}:</strong> ${schedule.start_time}</p>
        </div>
        <p>${isEn ? 'See you soon.' : 'Nos vemos pronto.'}</p>
      </div>`;
    await resend.emails.send({ from: process.env.EMAIL_FROM, to: student.email, subject, html });
  } catch (err) {
    console.error('Email not sent:', err.message);
  }
}

export default async function handler(req, res) {
  try {
    const body = req.method === 'GET' ? req.query : await readBody(req);
    const db = supabaseAdmin();
    const academy = await getAcademy(db, body.academy);
    const action = body.action || 'getCourtesyOptions';

    let result;
    if (action === 'findStudentForReservation') result = await findStudentForReservation(db, academy, body);
    else if (action === 'reserveClass') result = await reserveClass(db, academy, body);
    else if (action === 'getCourtesyOptions') result = await getCourtesyOptions(db, academy);
    else if (action === 'submitCourtesy') result = await submitCourtesy(db, academy, body);
    else throw new Error('Acción pública no reconocida.');

    json(res, 200, result);
  } catch (err) {
    json(res, 400, { ok: false, message: err.message });
  }
}

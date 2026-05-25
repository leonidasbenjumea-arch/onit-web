import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function getAcademy(db, slug) {
  const academySlug = slug || process.env.DEFAULT_ACADEMY_SLUG || 'onit';
  const { data, error } = await db.from('academies').select('*').eq('slug', academySlug).single();
  if (error) throw new Error('No encontré la academia configurada: ' + error.message);
  return data;
}

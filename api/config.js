import { supabaseAdmin, getAcademy } from './_supabase.js';
import { json } from './_utils.js';

export default async function handler(req, res) {
  try {
    const db = supabaseAdmin();
    const academy = await getAcademy(db, req.query?.academy);
    json(res, 200, {
      ok: true,
      academy: {
        slug: academy.slug,
        name: academy.name,
        appName: academy.app_name,
        logoUrl: academy.logo_url,
        primaryColor: academy.primary_color,
        accentColor: academy.accent_color,
        currency: academy.currency,
        privacyText: academy.privacy_text
      }
    });
  } catch (err) {
    json(res, 500, { ok: false, message: err.message });
  }
}

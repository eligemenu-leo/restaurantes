// Envío de correos con Resend (https://resend.com). Si falta RESEND_API_KEY, no envía y lo deja en el registro.
// Para cambiar de proveedor basta con reescribir esta función.

export async function enviarCorreo(m: { para: string; asunto: string; html: string; responderA?: string }): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('CORREO_REMITENTE');
  if (!key || !from) {
    console.warn(`Correo sin enviar (falta RESEND_API_KEY o CORREO_REMITENTE): "${m.asunto}" para ${m.para}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [m.para], subject: m.asunto, html: m.html, reply_to: m.responderA }),
  });
  if (!res.ok) console.error(`Resend ${res.status}: ${await res.text()}`);
  return res.ok;
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const euros = (cent: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: cent % 100 ? 2 : 0 }).format(cent / 100);

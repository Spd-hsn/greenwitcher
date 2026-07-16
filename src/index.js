const JSON_HEADERS = {
  'content-type': 'application/json; charset=UTF-8',
  'cache-control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clean(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function verifyTurnstile(token, request, env) {
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body,
  });
  return response.ok ? response.json() : { success: false };
}

async function handleContact(request, env) {
  if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY) {
    console.error('Missing Worker secrets');
    return json({ success: false, message: 'Server configuration error.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, message: 'Invalid request.' }, 400);
  }

  // Honeypot: silently accept bot submissions without sending email.
  if (clean(payload.website, 200)) return json({ success: true });

  const name = clean(payload.name, 100);
  const email = clean(payload.email, 254).toLowerCase();
  const message = clean(payload.message, 3000);
  const language = clean(payload.language, 5) || 'sk';
  const token = clean(payload.turnstileToken, 3000);

  if (name.length < 2 || !validEmail(email) || message.length < 10 || !token) {
    return json({ success: false, message: 'Please complete all required fields.' }, 400);
  }

  const verification = await verifyTurnstile(token, request, env);
  if (!verification.success) {
    return json({ success: false, message: 'Spam verification failed.' }, 403);
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const subject = `New GreenWitcher enquiry from ${name}`.slice(0, 180);

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      from: 'GreenWitcher Website <contact@forms.greenwitcher.eu>',
      to: ['info@greenwitcher.eu'],
      reply_to: email,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#1E2A22">
          <h2 style="color:#266A55">New website enquiry</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
          <p><strong>Website language:</strong> ${escapeHtml(language.toUpperCase())}</p>
          <hr style="border:0;border-top:1px solid #dce7d2;margin:24px 0">
          <p><strong>Message:</strong></p>
          <p style="line-height:1.6">${safeMessage}</p>
        </div>`,
      text: `New GreenWitcher enquiry\n\nName: ${name}\nEmail: ${email}\nLanguage: ${language.toUpperCase()}\n\nMessage:\n${message}`,
      tags: [{ name: 'source', value: 'contact-form' }],
    }),
  });

  if (!resendResponse.ok) {
    const details = await resendResponse.text();
    console.error('Resend error:', resendResponse.status, details);
    return json({ success: false, message: 'Email delivery failed.' }, 502);
  }

  return json({ success: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact') {
      if (request.method === 'POST') return handleContact(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
      return json({ success: false, message: 'Method not allowed.' }, 405);
    }

    return env.ASSETS.fetch(request);
  },
};

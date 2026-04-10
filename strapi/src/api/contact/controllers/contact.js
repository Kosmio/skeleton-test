'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { name: 200, email: 254, subject: 500, message: 10000 };

module.exports = {
  send: async (ctx) => {
    const { email, message, name, subject, captchaToken } = ctx.request.body;

    if (!email || !message) {
      return ctx.send({ message: 'Email et message sont requis', errors: { email: !email ? 'required' : null, message: !message ? 'required' : null } }, 400);
    }

    if (!EMAIL_RE.test(email)) {
      return ctx.send({ message: 'Adresse email invalide', errors: { email: 'format' } }, 400);
    }

    const fields = { name, email, subject, message };
    for (const [field, value] of Object.entries(fields)) {
      if (value && typeof value === 'string' && value.length > LIMITS[field]) {
        return ctx.send({ message: `Le champ ${field} dépasse la limite de ${LIMITS[field]} caractères`, errors: { [field]: 'maxlength' } }, 400);
      }
    }

    // Verify captcha (provider-agnostic)
    const captchaService = require('../../captcha/services/captcha');
    const isHuman = await captchaService.verify(captchaToken, 'contactForm');

    if (!isHuman) {
      return ctx.send({ message: 'Captcha verification failed' }, 403);
    }

    // Send via Brevo
    const { BrevoClient } = require('@getbrevo/brevo');
    const client = new BrevoClient({ apiKey: strapi.config.get('server.email.apiKey') });

    const templateId = parseInt(strapi.config.get('server.email.contact.templateId'));
    const contactTo = strapi.config.get('server.email.contact.to');

    try {
      await client.transactionalEmails.sendTransacEmail({
        templateId,
        to: [{ email: contactTo, name: 'Contact' }],
        replyTo: { email, name: name || 'Unknown' },
        params: { name, email, subject, message },
      });
      ctx.send({ message: 'success' }, 200);
    } catch {
      ctx.send({ message: 'error' }, 500);
    }
  },
};

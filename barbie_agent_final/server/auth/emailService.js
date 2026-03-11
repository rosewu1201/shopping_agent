const axios = require('axios');
const { log } = require('../utils/logger');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Barbie Collector Hub <onboarding@resend.dev>';

async function sendVerificationEmail(toEmail, code, userName) {
  if (!RESEND_API_KEY) {
    log('EMAIL', `No RESEND_API_KEY set. Verification code for ${toEmail}: ${code}`);
    return { sent: false, reason: 'no_api_key', code };
  }

  try {
    const response = await axios.post('https://api.resend.com/emails', {
      from: FROM_EMAIL,
      to: [toEmail],
      subject: `Your Barbie Collector Hub verification code: ${code}`,
      html: `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#FFFAFB;border-radius:16px;border:1px solid #F0D0E0">
          <div style="text-align:center;margin-bottom:1.5rem">
            <h1 style="font-size:1.4rem;color:#1A0A10;margin:0">Barbie <span style="color:#E0218A">Collector Hub</span></h1>
          </div>
          <p style="font-size:0.95rem;color:#5C3D4E;line-height:1.6">Hi ${userName || 'there'},</p>
          <p style="font-size:0.95rem;color:#5C3D4E;line-height:1.6">Welcome! Please verify your email address by entering this code:</p>
          <div style="text-align:center;margin:1.5rem 0">
            <div style="display:inline-block;padding:16px 32px;background:linear-gradient(135deg,#E0218A,#E91E90);color:#fff;font-size:2rem;font-weight:700;letter-spacing:8px;border-radius:12px;box-shadow:0 4px 16px rgba(224,33,138,0.25)">${code}</div>
          </div>
          <p style="font-size:0.82rem;color:#9B7A8A;line-height:1.6">This code expires in 15 minutes. If you didn't sign up for Barbie Collector Hub, please ignore this email.</p>
          <hr style="border:none;border-top:1px solid #F0D0E0;margin:1.5rem 0">
          <p style="font-size:0.72rem;color:#9B7A8A;text-align:center">Barbie Collector Hub is not affiliated with Mattel, Inc.</p>
        </div>
      `,
    }, {
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    log('EMAIL', `Verification email sent to ${toEmail} (id: ${response.data?.id})`);
    return { sent: true };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    log('EMAIL', `Failed to send email to ${toEmail}: ${msg}`);
    return { sent: false, reason: msg, code };
  }
}

module.exports = { sendVerificationEmail };

import nodemailer from 'nodemailer';

export const sendEmail = async ({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}) => {
  // Create a transporter using SMTP settings from .env
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465, // Default to 465 if not provided
    secure: true, // Use SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  const msg = {
    from: `Veda AI <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: text || '',
    html: html || '',
  };

  try {
    const info = await transporter.sendMail(msg);
    console.log('[Email] Sent via Gmail SMTP to:', to);
    return info;
  } catch (error: any) {
    console.error('[Email] Failed to send:', error.message);
    throw new Error(error.message);
  }
};

// Called on server startup to confirm email is configured
export const verifySMTP = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('[Email] EMAIL_USER or EMAIL_APP_PASSWORD is not set — emails will not work.');
  } else {
    console.log('[Email] Nodemailer (Gmail) is configured and ready.');
  }
};

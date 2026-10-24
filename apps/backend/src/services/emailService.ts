import nodemailer, { Transporter } from 'nodemailer';
import { Sender, Email } from '@prisma/client';

const transporterMap = new Map<string, Transporter>();

function getTransporter(sender: Sender): Transporter {
  if (transporterMap.has(sender.id)) {
    return transporterMap.get(sender.id)!;
  }

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpPort === 465,
    auth: {
      user: sender.smtpUser,
      pass: sender.smtpPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  transporterMap.set(sender.id, transporter);
  return transporter;
}

export async function sendEmailViaEthereal(
  email: Pick<Email, 'id' | 'toAddress' | 'subject' | 'body'> & { attachments?: any },
  sender: Sender
): Promise<{ messageId: string; etherealUrl: string | null }> {
  const transporter = getTransporter(sender);

  const mailAttachments = Array.isArray(email.attachments)
    ? email.attachments.map((att: any) => {
        if (att.dataUrl && att.dataUrl.includes(';base64,')) {
          return {
            filename: att.filename,
            content: att.dataUrl.split(';base64,').pop(),
            encoding: 'base64',
            contentType: att.contentType,
          };
        }
        return {
          filename: att.filename,
          content: att.dataUrl || '',
          contentType: att.contentType,
        };
      })
    : undefined;

  const info = await transporter.sendMail({
    from: `"${sender.name || 'Outbox Reach'}" <${sender.address}>`,
    to: email.toAddress,
    subject: email.subject,
    html: email.body,
    text: email.body.replace(/<[^>]*>/g, ''), // Plaintext fallback
    attachments: mailAttachments,
  });

  const etherealUrl = nodemailer.getTestMessageUrl(info) || null;

  return {
    messageId: info.messageId,
    etherealUrl: etherealUrl ? etherealUrl.toString() : null,
  };
}

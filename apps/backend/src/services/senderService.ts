import nodemailer from 'nodemailer';
import { prisma } from '../config/db';

export async function ensureDefaultSenders() {
  const existingCount = await prisma.sender.count();
  if (existingCount >= 3) {
    return prisma.sender.findMany();
  }

  const needed = 3 - existingCount;
  console.log(`[SenderService] Creating ${needed} Ethereal SMTP test sender accounts...`);

  const createdSenders = [];
  for (let i = 0; i < needed; i++) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      const sender = await prisma.sender.upsert({
        where: { address: testAccount.user },
        update: {
          smtpHost: testAccount.smtp.host,
          smtpPort: testAccount.smtp.port,
          smtpUser: testAccount.user,
          smtpPass: testAccount.pass,
          etherealUrl: `https://ethereal.email/messages`,
        },
        create: {
          address: testAccount.user,
          name: `Campaign Sender ${existingCount + i + 1}`,
          smtpHost: testAccount.smtp.host,
          smtpPort: testAccount.smtp.port,
          smtpUser: testAccount.user,
          smtpPass: testAccount.pass,
          etherealUrl: `https://ethereal.email/messages`,
        },
      });
      createdSenders.push(sender);
      console.log(`[SenderService] Created Ethereal sender: ${sender.address}`);
    } catch (error) {
      console.error('[SenderService] Failed to create Ethereal test account:', error);
    }
  }

  return prisma.sender.findMany();
}

export async function getAllSenders() {
  return prisma.sender.findMany({
    orderBy: { createdAt: 'asc' },
  });
}

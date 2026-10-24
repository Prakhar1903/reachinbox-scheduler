export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  slackTeamId?: string | null;
  slackChannelId?: string | null;
  hasSlackConnected?: boolean;
}

export interface Sender {
  id: string;
  address: string;
  name?: string | null;
  etherealUrl?: string | null;
}

export type EmailStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'RATE_LIMITED';

export interface EmailItem {
  id: string;
  userId: string;
  senderId: string;
  toAddress: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatus;
  bullJobId?: string | null;
  etherealUrl?: string | null;
  delaySeconds: number;
  hourlyLimit: number;
  retryCount: number;
  isStarred?: boolean;
  isArchived?: boolean;
  errorMessage?: string | null;
  createdAt: string;
  sender?: Sender;
}

export interface EmailListResponse {
  emails: EmailItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    scheduled: number;
    sent: number;
  };
}

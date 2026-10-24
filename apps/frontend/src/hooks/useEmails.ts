import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EmailItem, EmailListResponse } from '@/types';

export function useEmails(status: 'SCHEDULED' | 'SENT' | 'ALL' = 'SCHEDULED', page = 1) {
  return useQuery({
    queryKey: ['emails', status, page],
    queryFn: async () => {
      const res = await api.get<EmailListResponse>('/api/emails', {
        params: { status, page, limit: 50 },
      });
      return res.data;
    },
    refetchInterval: 5000, // Live poll every 5s for scheduler status transitions
  });
}

export function useSearchEmails(query: string, status?: string) {
  return useQuery({
    queryKey: ['searchEmails', query, status],
    queryFn: async () => {
      if (!query || query.trim().length === 0) {
        return null;
      }
      const res = await api.get<{ total: number; emails: any[] }>('/api/emails/search', {
        params: { q: query, status, limit: 50 },
      });
      return res.data;
    },
    enabled: Boolean(query && query.trim().length > 0),
  });
}

export function useEmailDetail(id: string) {
  return useQuery({
    queryKey: ['emailDetail', id],
    queryFn: async () => {
      const res = await api.get<{ email: EmailItem }>(`/api/emails/${id}`);
      return res.data.email;
    },
    enabled: Boolean(id),
  });
}

export function useScheduleEmails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      senderId: string;
      toAddresses: string[];
      subject: string;
      body: string;
      scheduledAt: string;
      delaySeconds: number;
      hourlyLimit: number;
    }) => {
      const res = await api.post('/api/emails/schedule', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });
}

export function useToggleStarEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (emailId: string) => {
      const res = await api.patch<{ isStarred: boolean }>(`/api/emails/${emailId}/star`);
      return res.data;
    },
    onSuccess: (_, emailId) => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['emailDetail', emailId] });
    },
  });
}

export function useToggleArchiveEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (emailId: string) => {
      const res = await api.patch<{ isArchived: boolean }>(`/api/emails/${emailId}/archive`);
      return res.data;
    },
    onSuccess: (_, emailId) => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['emailDetail', emailId] });
    },
  });
}

export function useDeleteEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (emailId: string) => {
      const res = await api.delete(`/api/emails/${emailId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });
}

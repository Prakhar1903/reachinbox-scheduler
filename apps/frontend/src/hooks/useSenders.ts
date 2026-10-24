import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Sender } from '@/types';

export function useSenders() {
  return useQuery({
    queryKey: ['senders'],
    queryFn: async () => {
      const res = await api.get<{ senders: Sender[] }>('/api/senders');
      return res.data.senders;
    },
    staleTime: 60 * 1000,
  });
}

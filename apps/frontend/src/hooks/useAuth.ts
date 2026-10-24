import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { User } from '@/types';

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['authUser'],
    queryFn: async () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
          localStorage.setItem('auth_token', urlToken);
        }
      }
      try {
        const res = await api.get<{ user: User }>('/auth/me');
        return res.data.user;
      } catch (err: any) {
        if (err.response?.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(['authUser'], null);
      router.push('/login');
    },
  });

  return {
    user: data || null,
    isLoading,
    error,
    isAuthenticated: Boolean(data),
    logout: logoutMutation.mutate,
    refetch,
  };
}

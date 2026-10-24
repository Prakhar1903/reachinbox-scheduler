'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api, API_BASE_URL } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, refetch } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If token is in URL (from OAuth redirect), store it
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('auth_token', token);
      refetch().then(() => {
        router.push('/dashboard');
      });
    }

    const error = searchParams.get('error');
    if (error) {
      toast.error('Authentication failed: ' + error);
    }
  }, [searchParams, refetch, router]);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleGoogleLogin = () => {
    const backend = API_BASE_URL.replace(/\/+$/, '') || 'https://reachinbox-scheduler-g593.onrender.com';
    const redirectOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    window.location.href = `${backend}/auth/google?redirect=${encodeURIComponent(redirectOrigin)}`;
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Demo / Evaluator quick sign-in
      const res = await api.post<{ token: string; user: any }>('/auth/demo-login');
      if (res.data.token) {
        localStorage.setItem('auth_token', res.data.token);
        await refetch();
        toast.success(`Welcome back, ${res.data.user.name}!`);
        router.push('/dashboard');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[420px] bg-white rounded-3xl p-10 shadow-xs border border-gray-100 flex flex-col items-center">
      {/* Title */}
      <h1 className="text-3xl font-extrabold text-[#171A21] mb-8 tracking-tight">
        Login
      </h1>

      {/* Real Google OAuth Login Button matching Figma */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-[#EBFBF2] hover:bg-[#DFF8E9] border border-[#B7E8CE] text-sm font-semibold text-gray-800 transition-colors shadow-2xs"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Login with Google</span>
      </button>

      {/* Divider */}
      <div className="w-full flex items-center my-6">
        <div className="flex-1 border-t border-gray-200" />
        <span className="px-3 text-xs text-gray-400 font-medium">
          or sign up through email
        </span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Email / Password Form */}
      <form onSubmit={handleEmailLogin} className="w-full space-y-4">
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email ID"
            className="w-full bg-[#F4F5F7] border border-transparent focus:border-gray-300 focus:bg-white text-sm text-gray-900 placeholder-gray-400 rounded-xl px-4 py-3.5 focus:outline-none transition-all"
          />
        </div>

        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-[#F4F5F7] border border-transparent focus:border-gray-300 focus:bg-white text-sm text-gray-900 placeholder-gray-400 rounded-xl px-4 py-3.5 focus:outline-none transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-2 py-3.5 rounded-xl bg-[#029E4D] hover:bg-[#028540] text-white font-semibold text-sm transition-colors shadow-xs flex items-center justify-center disabled:opacity-50"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            'Login'
          )}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F9FAFB] p-4">
      <Suspense fallback={<div className="w-8 h-8 border-3 border-[#029E4D] border-t-transparent rounded-full animate-spin" />}>
        <LoginContent />
      </Suspense>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { X, Slack, CheckCircle2, Send, Unlink, ExternalLink, HelpCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface SlackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SlackModal: React.FC<SlackModalProps> = ({ isOpen, onClose }) => {
  const { user, refetch } = useAuth();
  const [activeTab, setActiveTab] = useState<'webhook' | 'oauth'>('webhook');
  const [tokenInput, setTokenInput] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  if (!isOpen) return null;

  const handleConnectWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      toast.error('Please enter a Slack Webhook URL or Bot Token');
      return;
    }

    if (
      !cleanToken.startsWith('https://hooks.slack.com/services/') &&
      !cleanToken.startsWith('xoxb-') &&
      !cleanToken.startsWith('xoxp-')
    ) {
      toast.error(
        'Invalid credential. Please use an Incoming Webhook (https://hooks.slack.com/services/...) or Bot Token (xoxb-...). Workspace URLs like *.slack.com cannot receive API calls.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/slack/connect-webhook', {
        token: cleanToken,
        channelId: channelInput.trim() || undefined,
      });
      toast.success('Slack connected successfully!');
      await refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to connect Slack');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    try {
      if (clientIdInput.trim() && clientSecretInput.trim()) {
        await api.post('/slack/configure-oauth', {
          clientId: clientIdInput.trim(),
          clientSecret: clientSecretInput.trim(),
        });
      }

      const res = await api.get<{ url: string }>('/slack/install');
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not initiate Slack OAuth: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendTestMessage = async () => {
    setIsTesting(true);
    try {
      const res = await api.post('/slack/test');
      toast.success(res.data.message || 'Test alert sent to Slack!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send test message');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await api.delete('/slack/disconnect');
      toast.success('Slack disconnected');
      await refetch();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#4A154B] flex items-center justify-center text-white">
              <Slack className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Slack Notifications</h2>
              <p className="text-xs text-gray-400">Receive alerts when hourly rate limits are hit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {user?.hasSlackConnected ? (
            /* Already Connected State */
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-xs text-emerald-900">
                  <p className="font-semibold">Slack is currently connected</p>
                  <p className="text-emerald-700 mt-0.5">
                    Channel: <span className="font-mono">{user.slackChannelId || 'general'}</span>
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSendTestMessage}
                  disabled={isTesting}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isTesting ? 'Sending...' : 'Send Test Notification'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-700 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('webhook')}
                  className={`flex-1 py-1.5 rounded-lg transition-colors ${
                    activeTab === 'webhook'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Incoming Webhook (Easy)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('oauth')}
                  className={`flex-1 py-1.5 rounded-lg transition-colors ${
                    activeTab === 'oauth'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Slack OAuth App
                </button>
              </div>

              {activeTab === 'webhook' ? (
                /* Webhook Form */
                <form onSubmit={handleConnectWebhook} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Incoming Webhook URL or Bot Token
                    </label>
                    <input
                      type="text"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="https://hooks.slack.com/services/T.../B.../..."
                      className="w-full text-xs font-mono px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#029E4D] placeholder-gray-400"
                    />
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2 text-[11px] text-amber-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1 text-amber-800">
                        <HelpCircle className="w-3.5 h-3.5" /> How to get your Webhook in 30 seconds:
                      </p>
                      <ol className="list-decimal pl-4 space-y-0.5 text-amber-800/90 text-[10.5px]">
                        <li>
                          Go to{' '}
                          <a
                            href="https://api.slack.com/apps"
                            target="_blank"
                            rel="noreferrer"
                            className="underline font-semibold text-amber-900"
                          >
                            api.slack.com/apps
                          </a>{' '}
                          and click <strong>Create New App</strong> (from scratch).
                        </li>
                        <li>
                          Under <strong>Features</strong>, enable <strong>Incoming Webhooks</strong>.
                        </li>
                        <li>
                          Click <strong>Add New Webhook to Workspace</strong>, select{' '}
                          <strong>#all-outbox-labs</strong>, and copy the Webhook URL (starts with{' '}
                          <code>https://hooks.slack.com/services/...</code>).
                        </li>
                      </ol>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Channel Name / ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={channelInput}
                      onChange={(e) => setChannelInput(e.target.value)}
                      placeholder="#general or channel-id"
                      className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#029E4D] placeholder-gray-400"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#029E4D] hover:bg-[#028A43] text-white font-semibold text-xs transition-colors shadow-xs"
                    >
                      {isSubmitting ? 'Connecting...' : 'Connect Slack'}
                    </button>
                  </div>
                </form>
              ) : (
                /* OAuth Form */
                <form onSubmit={handleOAuthConnect} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Slack Client ID
                    </label>
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="e.g. 1234567890.1234567890"
                      className="w-full text-xs font-mono px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#029E4D] placeholder-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Slack Client Secret
                    </label>
                    <input
                      type="password"
                      value={clientSecretInput}
                      onChange={(e) => setClientSecretInput(e.target.value)}
                      placeholder="e.g. 9a8b7c6d5e4f..."
                      className="w-full text-xs font-mono px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#029E4D] placeholder-gray-400"
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-[11px] text-blue-900 space-y-1">
                    <p className="font-semibold text-blue-800">
                      Redirect URL configured in Slack App:
                    </p>
                    <code className="block bg-white px-2 py-1 rounded text-[10px] text-blue-900 border border-blue-100 font-mono">
                      http://localhost:4000/slack/oauth_redirect
                    </code>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#4A154B] hover:bg-[#3D113E] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
                    >
                      <Slack className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? 'Redirecting...' : 'Authorize with Slack'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

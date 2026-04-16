'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { getApiBaseUrl, getInternalSecret } from '@/lib/api-url';

interface Props {
  threadId: string;
  onSend: (content: string, blocks?: unknown[], attachmentIds?: string[]) => void;
}

export function MessageComposer({ threadId, onSend }: Props) {
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ id: string; name: string; size: number; previewUrl?: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isNewSession, setIsNewSession] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiBase = getApiBaseUrl();

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [content]);

  // Draft persistence
  useEffect(() => {
    const saved = sessionStorage.getItem(`draft:${threadId}`);
    if (saved) setContent(saved);
  }, [threadId]);

  useEffect(() => {
    if (content) {
      sessionStorage.setItem(`draft:${threadId}`, content);
    } else {
      sessionStorage.removeItem(`draft:${threadId}`);
    }
  }, [content, threadId]);

  const sendTyping = useCallback((status: 'start' | 'stop') => {
    fetch(`${apiBase}/v1/messaging/threads/${threadId}/typing`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }, [apiBase, threadId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    sendTyping('start');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping('stop'), 3000);
  };

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping('stop');

    // Slash command: /new — start a fresh agent session
    if (trimmed === '/new' && pendingAttachments.length === 0) {
      if (isNewSession) return; // prevent double-fire
      setIsNewSession(true);
      setContent('');
      sessionStorage.removeItem(`draft:${threadId}`);
      fetch(`${apiBase}/v1/messaging/threads/${threadId}/new-session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-internal-shared-secret': getInternalSecret() },
      }).catch(() => {}).finally(() => setIsNewSession(false));
      textareaRef.current?.focus();
      return;
    }

    onSend(trimmed, undefined, pendingAttachments.map((a) => a.id));
    setContent('');
    setPendingAttachments([]);
    sessionStorage.removeItem(`draft:${threadId}`);
    textareaRef.current?.focus();
  };

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const res = await fetch(`${apiBase}/v1/messaging/uploads/presign`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-internal-shared-secret': getInternalSecret() },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
      });
      if (!res.ok) return;
      const { attachmentId, presignedPutUrl } = await res.json();

      await fetch(presignedPutUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
      });

      let previewUrl: string | undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      setPendingAttachments((prev) => [...prev, { id: attachmentId, name: file.name, size: file.size, previewUrl }]);
    } finally {
      setIsUploading(false);
    }
  }, [apiBase, threadId]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(uploadFile);
  }, [uploadFile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFiles(e.clipboardData.files);
    }
  };

  const canSend = content.trim().length > 0 || pendingAttachments.length > 0;

  return (
    <div
      className="relative shrink-0 border-t border-divider"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-t-[8px] border-2 border-dashed border-brand-teal bg-brand-teal/5">
          <p className="text-[13px] font-medium text-brand-teal">Drop files to attach</p>
        </div>
      ) : null}


      {/* Pending attachments */}
      {pendingAttachments.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-b border-divider px-4 py-2">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="relative flex items-center gap-1.5 rounded-[6px] border border-divider bg-[var(--app-bg-elevated)] px-2 py-1.5"
            >
              {att.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={att.previewUrl} alt={att.name} className="h-8 w-8 rounded object-cover" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--app-muted)]" />
              )}
              <span className="max-w-[100px] truncate text-[11px]">{att.name}</span>
              <button
                type="button"
                aria-label={`Remove ${att.name}`}
                onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                className="ml-1 text-[var(--app-muted)] hover:text-[var(--app-fg)]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Composer main */}
      <div className="px-4 py-3">
        <div className="flex flex-col rounded-[10px] border border-divider bg-[var(--app-input-bg)]">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Message... (Shift+Enter for new line)"
            rows={1}
            className="max-h-[180px] min-h-[40px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-relaxed placeholder:text-[var(--app-muted)] focus:outline-none focus:ring-0"
            style={{ outline: 'none', boxShadow: 'none' }}
            aria-label="Message input"
            data-testid="message-input"
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-0.5">
              {/* File upload */}
              <button
                type="button"
                aria-label="Attach file"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--app-fg)] disabled:opacity-40"
              >
                {isUploading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border border-brand-teal border-t-transparent" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                aria-hidden="true"
                onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              data-testid="send-message-btn"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors',
                canSend
                  ? 'bg-brand-teal text-white hover:bg-brand-teal/90'
                  : 'text-[var(--app-muted)]',
              )}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--app-muted)]/60">Enter to send · Shift+Enter for new line · /new to start fresh session</p>
      </div>
    </div>
  );
}

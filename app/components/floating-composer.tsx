"use client";

import React, { FormEvent, useState, useRef, useEffect } from "react";

interface FloatingComposerProps {
  command: string;
  setCommand: (cmd: string) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  sessionExpired: boolean;
  commandError: string | null;
  isBriefingOpen?: boolean;
}

export function FloatingComposer({
  command,
  setCommand,
  handleSubmit,
  isSubmitting,
  sessionExpired,
  commandError,
  isBriefingOpen = false,
}: FloatingComposerProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const commandInputRef = useRef<HTMLTextAreaElement>(null);

  // Unified height adjustment logic
  const adjustHeight = React.useCallback((textarea: HTMLTextAreaElement, animate: boolean) => {
    if (textarea.value.length === 0) {
      if (animate) {
        const currentAnimatedHeight = window.getComputedStyle(textarea).height;
        textarea.style.transition = "none";
        textarea.style.height = currentAnimatedHeight;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        textarea.offsetHeight;
        textarea.style.transition = "";
        textarea.style.height = "40px";
      } else {
        textarea.style.transition = "none";
        textarea.style.height = "40px";
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        textarea.offsetHeight;
        textarea.style.transition = "";
      }
      return;
    }

    if (animate) {
      const currentAnimatedHeight = window.getComputedStyle(textarea).height;
      textarea.style.transition = "none";
      textarea.style.height = "40px";
      const newHeight = `${Math.min(textarea.scrollHeight, 200)}px`;

      textarea.style.height = currentAnimatedHeight;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      textarea.offsetHeight;

      textarea.style.transition = "";
      textarea.style.height = newHeight;
    } else {
      textarea.style.transition = "none";
      textarea.style.height = "40px";
      const newHeight = `${Math.min(textarea.scrollHeight, 200)}px`;
      textarea.style.height = newHeight;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      textarea.offsetHeight;
      textarea.style.transition = "";
    }
  }, []);

  // Focus input when maximized and adjust height
  useEffect(() => {
    if (!isMinimized) {
      const textarea = commandInputRef.current;
      if (!textarea) return;

      adjustHeight(textarea, false);

      let lastWidth = textarea.clientWidth;
      const observer = new ResizeObserver(() => {
        if (textarea.clientWidth !== lastWidth) {
          lastWidth = textarea.clientWidth;
          adjustHeight(textarea, false);
        }
      });
      observer.observe(textarea);

      const timeoutId = setTimeout(() => {
        textarea.focus();
      }, 300); // slight delay to allow animation

      return () => {
        observer.disconnect();
        clearTimeout(timeoutId);
      };
    }
  }, [isMinimized, adjustHeight]);

  // Adjust height when command changes (e.g. typing or cleared after submit)
  useEffect(() => {
    if (commandInputRef.current) {
      adjustHeight(commandInputRef.current, true);
    }
  }, [command, adjustHeight]);

  // Handle Ctrl+K shortcut to expand and focus
  useEffect(() => {
    function focusComposer(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditingControl =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA";
      if (isEditingControl || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k")
        return;

      event.preventDefault();
      setIsMinimized(false);
    }

    window.addEventListener("keydown", focusComposer);
    return () => window.removeEventListener("keydown", focusComposer);
  }, []);

  return (
    <div
      className="fixed bottom-8 left-1/2 z-50 flex flex-col items-center justify-end w-full max-w-2xl px-4 pointer-events-none"
      style={{
        transform: `translateX(calc(-50% + ${isBriefingOpen ? "190px" : "0px"}))`,
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Animated Pill Container */}
      <div
        className={`pointer-events-auto overflow-hidden border border-white/10 shadow-2xl backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center ${
          isMinimized
            ? "w-[120px] h-12 rounded-full bg-white/10 cursor-pointer hover:bg-white/20 hover:scale-105"
            : "w-full rounded-[28px] bg-white/5"
        }`}
        onClick={() => {
          if (isMinimized) setIsMinimized(false);
        }}
        title={isMinimized ? "Chat (Ctrl+K)" : undefined}
      >
        {/* Minimized Content */}
        {isMinimized ? (
          <div className="flex h-full w-full items-center justify-center gap-2 font-medium text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
              />
            </svg>
            <span>Chat</span>
          </div>
        ) : (
          /* Expanded Content */
          <form onSubmit={handleSubmit} className="flex w-full items-center gap-2 p-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(true);
              }}
              className="flex flex-shrink-0 h-10 w-10 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Minimize composer"
              title="Minimize (Esc)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>

            <textarea
              id="command-input"
              name="command"
              ref={commandInputRef}
              value={command}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              onChange={(event) => setCommand(event.target.value)}
              placeholder="Try “triage my inbox” or “find time for a team sync”..."
              rows={1}
              className="flex-grow resize-none bg-transparent py-2 text-base text-white placeholder-white/40 border-none outline-none focus:outline-none focus:ring-0 !shadow-none m-0 transition-[height] duration-200 ease-out"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setIsMinimized(true);
                }
              }}
              style={{ minHeight: "40px", maxHeight: "200px" }}
            />

            <button
              type="submit"
              disabled={!command.trim() || isSubmitting || sessionExpired}
              className="flex flex-shrink-0 h-10 w-10 items-center justify-center rounded-full bg-[#a855f7] text-white transition-all hover:bg-[#9333ea] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send"
              title="Send (Enter)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </form>
        )}
      </div>

      {/* Error Message */}
      <div
        className={`pointer-events-auto transition-all duration-300 ease-in-out w-full ${
          commandError && !isMinimized
            ? "mt-4 opacity-100 max-h-20"
            : "mt-0 opacity-0 max-h-0 overflow-hidden"
        }`}
      >
        <div
          className="flex items-center justify-between rounded-xl border border-[#f43f5e]/20 bg-[#f43f5e]/10 px-4 py-3 text-sm text-[#f43f5e] backdrop-blur-md"
          role="alert"
        >
          <span>{commandError}</span>
          <button
            type="button"
            className="font-semibold underline hover:no-underline"
            onClick={() =>
              void handleSubmit(new Event("submit") as unknown as FormEvent<HTMLFormElement>)
            }
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

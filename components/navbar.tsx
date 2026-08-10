"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { User } from "@supabase/supabase-js";

interface NavbarProps {
  user: User | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();

  const navItems = [
    { name: "Home", href: "/" },
    { name: "Console", href: "/console" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-3 shadow-lg backdrop-blur-md">
        <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
            <svg
              className="h-5 w-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <span
            className="text-lg font-bold text-white tracking-wide"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Relay
          </span>
        </Link>

        <div className="flex items-center space-x-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all duration-300",
                  isActive
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-zinc-400 hover:bg-white/10 hover:text-white",
                )}
              >
                {item.name}
              </Link>
            );
          })}

          <div className="h-6 w-px bg-white/20 mx-2" />

          {user ? (
            <div className="flex items-center space-x-2 bg-white/10 p-2 rounded-full border border-white/10">
              {user.user_metadata?.avatar_url || user.user_metadata?.picture ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.user_metadata.avatar_url || user.user_metadata.picture}
                  alt="Avatar"
                  className="w-6 h-6 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white font-bold">
                  {user.user_metadata?.full_name?.charAt(0) || user.email?.charAt(0) || "U"}
                </div>
              )}
              <span className="text-sm font-medium text-white">
                {user.user_metadata?.full_name || user.email}
              </span>
            </div>
          ) : (
            <Link
              href="/login"
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-all duration-300",
                pathname === "/login"
                  ? "bg-white/20 text-white shadow-sm"
                  : "text-zinc-400 hover:bg-white/10 hover:text-white",
              )}
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

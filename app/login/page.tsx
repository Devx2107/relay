"use client";

import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50">
      <div className="flex flex-col items-center space-y-6 rounded-2xl bg-white p-10 shadow-xl border border-zinc-100">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Welcome to Relay</h1>
        <p className="text-zinc-500 text-center max-w-xs text-sm">
          Sign in to access your command console and manage your workflows.
        </p>
        <button
          onClick={handleLogin}
          className="flex items-center justify-center space-x-2 rounded-lg bg-zinc-900 px-6 py-3 text-white hover:bg-zinc-800 transition-colors w-full font-medium"
        >
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  );
}

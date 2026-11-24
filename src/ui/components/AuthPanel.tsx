import { useEffect, useState, type FormEvent } from 'react';
import { supabase, isSupabaseConfigured, usernameToEmail } from '../../lib/supabase';

interface AuthPanelProps {
  onUserChange: (userId: string | null) => void;
  status?: string | null;
}

export function AuthPanel({ onUserChange, status }: AuthPanelProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? null);
      onUserChange(session?.user?.id ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? null);
      onUserChange(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [onUserChange]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="hud-chip text-[10px] text-slate-500">
        Cloud sync off (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const userEmail = usernameToEmail(username);
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: userEmail,
          password,
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    if (!supabase) return;
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  }

  if (userId) {
    return (
      <div className="flex items-center gap-2">
        <span className="hud-chip text-[10px] text-slate-300">
          {email?.replace('@mindspace.local', '') ?? 'user'}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loading}
          className="hud-chip text-[10px]"
        >
          Log out
        </button>
        {status && <span className="text-[10px] text-slate-500">{status}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        className="field w-28 px-2 py-1 text-[10px]"
        placeholder="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
      />
      <input
        className="field w-28 px-2 py-1 text-[10px]"
        type="password"
        placeholder="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
      />
      <button type="submit" disabled={loading} className="hud-chip text-[10px]">
        {loading ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="text-[10px] text-slate-400 hover:text-white"
      >
        {mode === 'login' ? 'create account' : 'have account?'}
      </button>
      {status && <span className="text-[10px] text-slate-500">{status}</span>}
      {error && <span className="text-[10px] text-rose-300">{error}</span>}
    </form>
  );
}

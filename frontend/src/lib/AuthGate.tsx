import { useEffect, useState } from 'react';
import { ArrowRight, Cpu, LoaderCircle, LockKeyhole, Sparkles } from 'lucide-react';
import { Brand } from '../features/workspace/brand';
import { supabase, type Session } from './supabase';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const isDevelopmentPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'workspace';
  const initialDemo = new URLSearchParams(window.location.search).get('demo') === '1';
  const [isDemo, setIsDemo] = useState(initialDemo);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!isDevelopmentPreview && !initialDemo);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    if (isDevelopmentPreview || isDemo) return;
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => setSession(currentSession));
    return () => subscription.unsubscribe();
  }, [isDemo, isDevelopmentPreview]);

  const openDemo = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('demo', '1');
    url.searchParams.delete('task');
    window.history.replaceState({}, '', url);
    setIsDemo(true);
    setLoading(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
  };

  if (loading) {
    return <div className="auth-loading"><LoaderCircle size={20} /> Preparing workspace…</div>;
  }

  if (!session && !isDevelopmentPreview && !isDemo) {
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <Brand />
          <div className="auth-story__copy">
            <span className="auth-kicker"><Sparkles size={13} /> AI coding agent for firmware</span>
            <h1>Build, test, and debug firmware with an agent.</h1>
            <p>Describe the change. TraceLoop reads your project, writes the code, runs it on virtual hardware, and brings back a tested result.</p>
            <div className="auth-loop">
              <span>Describe</span><i /><span>Plan</span><i /><span>Code</span><i /><span>Test</span><i /><span>Review</span>
            </div>
          </div>
          <div className="auth-hardware-card">
            <span><Cpu size={17} /></span><div><strong>STM32F4 Discovery</strong><small>Read-only sample target</small></div><i />
          </div>
        </section>
        <section className="auth-form-panel">
          <form className="auth-form" onSubmit={handleSubmit}>
            <header><span className="auth-lock"><LockKeyhole size={18} /></span><h2>{isSignUp ? 'Create your workspace' : 'Welcome back'}</h2><p>{isSignUp ? 'Start building firmware in simulation.' : 'Sign in to continue to TraceLoop.'}</p></header>
            <label><span>Email</span><input type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label><span>Password</span><input type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>
            {error && <p className="auth-error">{error}</p>}
            <button className="auth-submit" type="submit">{isSignUp ? 'Create account' : 'Sign in'} <ArrowRight size={15} /></button>
            <button className="auth-switch" type="button" onClick={openDemo}>View a read-only sample without an account</button>
            <button className="auth-switch" type="button" onClick={() => { setIsSignUp((value) => !value); setError(''); }}>
              {isSignUp ? 'Already have an account? Sign in' : 'New to TraceLoop? Create an account'}
            </button>
          </form>
          <footer>Always validate generated firmware on physical hardware before deployment.</footer>
        </section>
      </main>
    );
  }

  return (
    <>
      {session && (
        <button className="session-control" onClick={() => void supabase.auth.signOut()} title="Sign out">
          <span>{session.user.email?.slice(0, 2).toUpperCase() ?? 'ME'}</span>
        </button>
      )}
      {isDemo && <div className="demo-banner">Read-only sample · live actions are disabled</div>}
      {children}
    </>
  );
}

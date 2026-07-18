import { useState, useEffect } from 'react';
import { supabase, type Session } from './supabase';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (!session) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#fff',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          padding: '2rem',
          background: '#1a1a1a',
          borderRadius: '8px',
          border: '1px solid #333',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            {isSignUp ? 'Create account' : 'Sign in'}
          </h1>
          <p style={{ color: '#888', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            {isSignUp ? 'Create a new TraceLoop account' : 'Sign in to your TraceLoop account'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                padding: '0.75rem',
                background: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.875rem',
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                padding: '0.75rem',
                background: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.875rem',
              }}
            />

            {error && (
              <div style={{ color: '#f87171', fontSize: '0.875rem', padding: '0.5rem', background: '#1a0a0a', borderRadius: '4px' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              style={{
                padding: '0.75rem',
                background: '#3b82f6',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              {isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            style={{
              marginTop: '1rem',
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: '0.875rem',
              width: '100%',
            }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '4px',
        fontSize: '0.75rem',
        color: '#888',
      }}>
        <span>{session.user.email}</span>
        <button
          onClick={handleSignOut}
          style={{
            background: 'none',
            border: 'none',
            color: '#f87171',
            cursor: 'pointer',
            fontSize: '0.75rem',
          }}
        >
          Sign out
        </button>
      </div>
      {children}
    </>
  );
}

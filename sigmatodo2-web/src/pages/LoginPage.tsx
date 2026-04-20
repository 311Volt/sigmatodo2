import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { auth } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverMode, setServerMode] = useState<'dev' | 'prod' | null>(null);
  const [formMode, setFormMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ handle: '', displayName: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    auth.mode().then(r => setServerMode(r.mode)).catch(() => setServerMode('dev'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = formMode === 'login'
        ? await auth.login(form.handle, form.password)
        : await auth.register(form.handle, form.displayName, form.password);
      login(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (serverMode === null) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading…</div>;
  }

  if (serverMode === 'prod') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-center text-2xl">sigmatodo2</CardTitle>
          </CardHeader>
          <CardContent>
            <a href="/api/auth/google">
              <Button className="w-full" size="lg">Sign in with Google</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl">sigmatodo2</CardTitle>
          <p className="text-center text-sm text-muted-foreground">dev mode</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {(['login', 'register'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFormMode(m)}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${formMode === m ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
                >
                  {m === 'login' ? 'Sign in' : 'Register'}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <Label htmlFor="handle">Handle</Label>
              <Input
                id="handle"
                placeholder="your-handle"
                value={form.handle}
                onChange={e => setForm(f => ({ ...f, handle: e.target.value }))}
                required
              />
            </div>

            {formMode === 'register' && (
              <div className="space-y-1">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  placeholder="Your Name"
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  required
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                minLength={formMode === 'register' ? 8 : 1}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" disabled={loading}>
              {loading ? 'Loading…' : formMode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

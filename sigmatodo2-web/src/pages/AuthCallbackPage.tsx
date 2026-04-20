import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { auth } from '@/lib/api';

export default function AuthCallbackPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const isNew = params.get('new') === 'true';

    if (!token) { navigate('/login'); return; }

    localStorage.setItem('token', token);
    auth.me().then(user => {
      login(token, user);
      navigate(isNew ? `/profile/${user.handle}/edit` : '/', { replace: true });
    }).catch(() => navigate('/login'));
  }, [login, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen text-muted-foreground">
      Signing in…
    </div>
  );
}

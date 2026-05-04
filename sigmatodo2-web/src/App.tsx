import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import './index.css';

import LoginPage from '@/pages/LoginPage';
import WelcomePage from '@/pages/WelcomePage';
import ProjectPage from '@/pages/ProjectPage';
import ProfilePage from '@/pages/ProfilePage';
import EditProfilePage from '@/pages/EditProfilePage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import InvitePage from '@/pages/InvitePage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
      <Route path="/projects/:code" element={<ProtectedRoute><ProjectPage /></ProtectedRoute>} />
      <Route path="/projects/:code/issues/:issueCode" element={<ProtectedRoute><ProjectPage /></ProtectedRoute>} />
      <Route path="/profile/:handle" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/profile/:handle/edit" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />
      <Route path="/invite/:invitationCode" element={<InvitePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

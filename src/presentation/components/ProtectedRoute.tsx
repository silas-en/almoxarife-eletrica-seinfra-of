import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';

export default function ProtectedRoute() {
  const { token, isLoading } = useAuth();

  if (isLoading) return <div>Carregando...</div>;

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

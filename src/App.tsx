import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './presentation/context/AuthContext.tsx';
import { OfflineProvider } from './presentation/context/OfflineContext.tsx';
import Login from './presentation/pages/Login.tsx';
import Register from './presentation/pages/Register.tsx';
import Dashboard from './presentation/pages/Dashboard.tsx';
import Materials from './presentation/pages/admin/Materials.tsx';
import Users from './presentation/pages/admin/Users.tsx';
import Demands from './presentation/pages/admin/Demands.tsx';
import SharePhotos from './presentation/pages/admin/SharePhotos.tsx';
import DemandDetails from './presentation/pages/DemandDetails.tsx';
import Reports from './presentation/pages/admin/Reports.tsx';
import Vehicles from './presentation/pages/admin/Vehicles.tsx';
import Tools from './presentation/pages/admin/Tools.tsx';
import RecoveredMaterials from './presentation/pages/admin/RecoveredMaterials.tsx';
import Equipments from './presentation/pages/admin/Equipments.tsx';
import PendingReturns from './presentation/pages/admin/PendingReturns.tsx';
import MaterialSeparation from './presentation/pages/admin/MaterialSeparation.tsx';
import BorrowedMaterials from './presentation/pages/admin/BorrowedMaterials.tsx';
import InternalCommunications from './presentation/pages/admin/InternalCommunications.tsx';
import ProtectedRoute from './presentation/components/ProtectedRoute.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/demands/:id" element={<DemandDetails />} />
                
                {/* Admin only routes handled inside protected route or by role checks */}
                <Route path="/admin/materials" element={<Materials />} />
                <Route path="/admin/users" element={<Users />} />
                <Route path="/admin/demands" element={<Demands />} />
                <Route path="/admin/share-photos" element={<SharePhotos />} />
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/vehicles" element={<Vehicles />} />
                <Route path="/admin/tools" element={<Tools />} />
                <Route path="/admin/recovered" element={<RecoveredMaterials />} />
                <Route path="/admin/equipments" element={<Equipments />} />
                <Route path="/admin/cis" element={<InternalCommunications />} />
                <Route path="/admin/pending-returns" element={<PendingReturns />} />
                <Route path="/admin/separation" element={<MaterialSeparation />} />
                <Route path="/admin/borrowed" element={<BorrowedMaterials />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </OfflineProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

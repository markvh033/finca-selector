import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ManualFincaMapper from './components/ManualFincaMapper';
import FincaDetail from './pages/FincaDetail';
import Backups from './pages/Backups';
import LoginPage from './components/LoginPage';

function RequireAuth({ children }) {
  const token = localStorage.getItem('finca_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/finca" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/finca"
          element={
            <RequireAuth>
              <ManualFincaMapper />
            </RequireAuth>
          }
        />
        <Route
          path="/finca/:finca"
          element={
            <RequireAuth>
              <FincaDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/backups"
          element={
            <RequireAuth>
              <Backups />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/finca" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

import { Navigate } from 'react-router';
import { AdminSession } from './auth/AdminSession.jsx';
import { ProtectedRoute } from './auth/ProtectedRoute.jsx';
import { AdminLayout } from './components/layout/AdminLayout.jsx';
import { PublicLayout } from './components/layout/PublicLayout.jsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.jsx';
import { InquiryPage } from './pages/InquiryPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { RouteErrorPage } from './pages/RouteErrorPage.jsx';

export const routes = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <InquiryPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        element: <AdminSession />,
        children: [
          {
            element: <PublicLayout />,
            children: [{ path: 'login', element: <LoginPage /> }],
          },
          {
            path: 'admin',
            element: (
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            ),
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: <AdminDashboardPage /> },
            ],
          },
        ],
      },
    ],
  },
];

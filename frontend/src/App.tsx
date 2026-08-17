import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute, GuestRoute } from "./components/ProtectedRoute";
import { AdminCsAgentDetailPage } from "./pages/AdminCsAgentDetailPage";
import { AdminPage } from "./pages/AdminPage";
import { AdminProviderDetailPage } from "./pages/AdminProviderDetailPage";
import { ConsumerDashboard } from "./pages/ConsumerDashboard";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HomeRedirect } from "./pages/HomeRedirect";
import { OrderPage } from "./pages/OrderPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProviderDashboard } from "./pages/ProviderDashboard";
import { PublicProviderPage } from "./pages/PublicProviderPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { useAuth } from "./store/auth";
import "./styles.css";

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Navigate to="/?login=1" replace />} />
          <Route path="/register" element={<Navigate to="/?register=1" replace />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route path="/" element={<HomeRedirect />} />
        <Route path="/p/:slugOrId" element={<PublicProviderPage />} />

        <Route element={<ProtectedRoute roles={["CONSUMER", "PROVIDER"]} />}>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["CONSUMER"]} />}>
          <Route path="/consumer" element={<Navigate to="/consumer/details" replace />} />
          <Route path="/consumer/requests/:id" element={<RequestDetailPage />} />
          <Route path="/consumer/:section" element={<ConsumerDashboard />} />
        </Route>

        <Route element={<ProtectedRoute roles={["PROVIDER"]} />}>
          <Route path="/provider" element={<Navigate to="/provider/overview" replace />} />
          <Route path="/provider/:section" element={<ProviderDashboard />} />
        </Route>

        <Route element={<ProtectedRoute roles={["ADMIN", "CUSTOMER_SERVICE"]} />}>
          <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
          <Route path="/admin/providers/:userId" element={<AdminProviderDetailPage />} />
          <Route path="/admin/customer-service/:userId" element={<AdminCsAgentDetailPage />} />
          <Route path="/admin/:section" element={<AdminPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["CONSUMER", "PROVIDER"]} />}>
          <Route path="/orders/:id" element={<OrderPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

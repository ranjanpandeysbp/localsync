import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute, GuestRoute } from "./components/ProtectedRoute";
import { AdminPage } from "./pages/AdminPage";
import { ConsumerDashboard } from "./pages/ConsumerDashboard";
import { HomeRedirect } from "./pages/HomeRedirect";
import { LoginPage } from "./pages/LoginPage";
import { OrderPage } from "./pages/OrderPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProviderDashboard } from "./pages/ProviderDashboard";
import { PublicProviderPage } from "./pages/PublicProviderPage";
import { RegisterPage } from "./pages/RegisterPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route path="/" element={<HomeRedirect />} />
        <Route path="/p/:userId" element={<PublicProviderPage />} />

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

        <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
          <Route path="/admin" element={<Navigate to="/admin/providers" replace />} />
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

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { Dashboard } from "./pages/Dashboard";
import { DevicesPage } from "./pages/DevicesPage";
import { AlertsPage } from "./pages/AlertsPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { MetricsPage } from "./pages/MetricsPage";
import { PowerPage } from "./pages/physical/PowerPage";
import { CoolingPage } from "./pages/physical/CoolingPage";
import { AccessControlPage } from "./pages/physical/AccessControlPage";
import { SecurityEventsPage } from "./pages/soc/SecurityEventsPage";
import { SecurityIncidentsPage } from "./pages/soc/SecurityIncidentsPage";
import { ThreatIntelPage } from "./pages/soc/ThreatIntelPage";
import { SettingsPage } from "./pages/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
    },
  },
});

function isAuthenticated() {
  return !!localStorage.getItem("access_token");
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/devices" element={<DevicesPage />} />
                  <Route path="/alerts" element={<AlertsPage />} />
                  <Route path="/incidents" element={<IncidentsPage />} />
                  <Route path="/metrics" element={<MetricsPage />} />
                  <Route path="/topology" element={<PlaceholderPage title="Topologie réseau" description="Carte interactive des équipements et liens réseau — en développement." />} />
                  <Route path="/physical/power" element={<PowerPage />} />
                  <Route path="/physical/cooling" element={<CoolingPage />} />
                  <Route path="/physical/access" element={<AccessControlPage />} />
                  <Route path="/soc/events" element={<SecurityEventsPage />} />
                  <Route path="/soc/incidents" element={<SecurityIncidentsPage />} />
                  <Route path="/soc/threat-intel" element={<ThreatIntelPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </ProtectedLayout>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function LoginPage() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { auth } = await import("./services/api");
      await auth.login(username, password);
      window.location.href = "/";
    } catch {
      setError("Identifiants incorrects. Vérifiez votre nom d'utilisateur et mot de passe.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🖥️</div>
          <div className="text-2xl font-bold text-gray-900">SOC/NOC Platform</div>
          <div className="text-sm text-gray-500 mt-1">Portail de supervision datacenter</div>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="admin"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-500">{description || "Module en cours de développement."}</p>
    </div>
  );
}

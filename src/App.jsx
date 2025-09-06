// App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Teachers from "./pages/Teachers";
import Students from "./pages/Students";
import Attendance from "./pages/Attendance";
import DocumentStorage from "./pages/DocumentStorage";
import Fees from "./pages/Fees";
import Inventory from "./pages/Inventory";
import Expenses from "./pages/Expenses";

import { AuthProvider, useAuth } from "./AuthProvider"; // auth context
import RequireSection from "./components/RequireSection"; // 🔐 RBAC route gate

// Private route wrapper (auth-only)
function PrivateRoute({ element }) {
  const { user, authLoading } = useAuth();

  if (authLoading)
    return <div className="text-center text-white mt-10">Loading...</div>;

  // If not logged in, always redirect to login
  if (!user) return <Navigate to="/login" replace />;
  return element;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<Login />} />

          {/* App layout wrapper */}
          <Route element={<Layout />}>
            {/* Dashboard: auth-only; student-only users get auto-redirected to /students inside Dashboard.jsx */}
            <Route
              path="/dashboard"
              element={<PrivateRoute element={<Dashboard />} />}
            />

            {/* RBAC-gated routes (auth + section) */}
            <Route
              path="/students"
              element={
                <PrivateRoute
                  element={
                    <RequireSection section="students">
                      <Students />
                    </RequireSection>
                  }
                />
              }
            />
            <Route
              path="/teachers"
              element={
                <PrivateRoute
                  element={
                    <RequireSection section="teachers">
                      <Teachers />
                    </RequireSection>
                  }
                />
              }
            />
            <Route
              path="/attendance"
              element={
                <PrivateRoute
                  element={
                    <RequireSection section="attendance">
                      <Attendance />
                    </RequireSection>
                  }
                />
              }
            />
            <Route
              path="/documents"
              element={
                <PrivateRoute
                  element={
                    <RequireSection section="documents">
                      <DocumentStorage />
                    </RequireSection>
                  }
                />
              }
            />
            <Route
              path="/fees"
              element={
                <PrivateRoute
                  element={
                    <RequireSection section="fees">
                      <Fees />
                    </RequireSection>
                  }
                />
              }
            />
            <Route
              path="/inventory"
              element={
                <PrivateRoute
                  element={
                    <RequireSection section="inventory">
                      <Inventory />
                    </RequireSection>
                  }
                />
              }
            />
            <Route
              path="/expenses"
              element={
                <PrivateRoute
                  element={
                    <RequireSection section="expenses">
                      <Expenses />
                    </RequireSection>
                  }
                />
              }
            />
          </Route>

          {/* Defaults */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

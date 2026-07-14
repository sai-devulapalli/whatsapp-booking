import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">Booking Admin</div>
        <NavLink to="/appointments" className={({ isActive }) => (isActive ? "active" : "")}>
          Appointments
        </NavLink>
        <NavLink to="/services" className={({ isActive }) => (isActive ? "active" : "")}>
          Services
        </NavLink>
        <NavLink to="/resources" className={({ isActive }) => (isActive ? "active" : "")}>
          Staff & resources
        </NavLink>
        <NavLink to="/templates" className={({ isActive }) => (isActive ? "active" : "")}>
          Message templates
        </NavLink>
        <div className="logout" onClick={handleLogout}>
          Log out{user ? ` (${user.name})` : ""}
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

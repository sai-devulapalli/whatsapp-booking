import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface SignupResponse {
  token: string;
  organization: { id: string; name: string };
  user: { id: string; name: string; email: string; role: "ORG_ADMIN" | "STAFF" };
}

export function SignupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    category: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<SignupResponse>("/auth/signup", form);
      login(result.token, result.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit} style={{ maxWidth: 440 }}>
        <h1>Create your organization</h1>
        <div className="field">
          <label htmlFor="orgName">Organization name</label>
          <input id="orgName" value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <input
            id="category"
            placeholder="e.g. salon, clinic, gym, consulting"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="timezone">Timezone</label>
          <input id="timezone" value={form.timezone} onChange={(e) => update("timezone", e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="adminName">Your name</label>
          <input id="adminName" value={form.adminName} onChange={(e) => update("adminName", e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="adminEmail">Your email</label>
          <input
            id="adminEmail"
            type="email"
            value={form.adminEmail}
            onChange={(e) => update("adminEmail", e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="adminPassword">Password</label>
          <input
            id="adminPassword"
            type="password"
            minLength={8}
            value={form.adminPassword}
            onChange={(e) => update("adminPassword", e.target.value)}
            required
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Creating…" : "Create organization"}
        </button>
        <p className="muted" style={{ marginTop: 14 }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}

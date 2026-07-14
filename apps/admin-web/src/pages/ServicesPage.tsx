import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number | null;
}

export function ServicesPage() {
  const queryClient = useQueryClient();
  const { data: services, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<Service[]>("/services"),
  });

  const [form, setForm] = useState({ name: "", durationMinutes: 30, bufferMinutes: 0, priceCents: "" });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Service>("/services", {
        name: form.name,
        durationMinutes: Number(form.durationMinutes),
        bufferMinutes: Number(form.bufferMinutes),
        priceCents: form.priceCents ? Math.round(Number(form.priceCents) * 100) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setForm({ name: "", durationMinutes: 30, bufferMinutes: 0, priceCents: "" });
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create service."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/services/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services"] }),
  });

  return (
    <div>
      <div className="page-header">
        <h1>Services</h1>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a service</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="form-row">
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Duration (minutes)</label>
              <input
                type="number"
                min={5}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                required
              />
            </div>
            <div className="field">
              <label>Buffer after (minutes)</label>
              <input
                type="number"
                min={0}
                value={form.bufferMinutes}
                onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Price (optional)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.priceCents}
                onChange={(e) => setForm({ ...form, priceCents: e.target.value })}
              />
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding…" : "Add service"}
          </button>
        </form>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="muted">Loading…</p>
        ) : !services?.length ? (
          <p className="muted">No services yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Duration</th>
                <th>Buffer</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>{s.bufferMinutes} min</td>
                  <td>{s.priceCents != null ? `$${(s.priceCents / 100).toFixed(2)}` : "—"}</td>
                  <td className="row-actions">
                    <button className="danger" onClick={() => deleteMutation.mutate(s.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

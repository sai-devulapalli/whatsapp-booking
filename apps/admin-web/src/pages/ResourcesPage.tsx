import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { AvailabilityEditor } from "../components/AvailabilityEditor";

interface Service {
  id: string;
  name: string;
}

interface Resource {
  id: string;
  name: string;
  title: string | null;
  services: { service: Service }[];
}

export function ResourcesPage() {
  const queryClient = useQueryClient();
  const { data: resources, isLoading } = useQuery({
    queryKey: ["resources"],
    queryFn: () => api.get<Resource[]>("/resources"),
  });
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<Service[]>("/services"),
  });

  const [form, setForm] = useState({ name: "", title: "", serviceIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [editingAvailabilityFor, setEditingAvailabilityFor] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.post<Resource>("/resources", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      setForm({ name: "", title: "", serviceIds: [] });
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create resource."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/resources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  function toggleService(id: string) {
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((s) => s !== id) : [...f.serviceIds, id],
    }));
  }

  return (
    <div>
      <div className="page-header">
        <h1>Staff &amp; resources</h1>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add staff / resource</h3>
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
              <label>Title (optional)</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Offers these services</label>
            {!services?.length ? (
              <p className="muted">Add a service first.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {services.map((s) => (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.9rem" }}>
                    <input
                      type="checkbox"
                      checked={form.serviceIds.includes(s.id)}
                      onChange={() => toggleService(s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding…" : "Add resource"}
          </button>
        </form>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="muted">Loading…</p>
        ) : !resources?.length ? (
          <p className="muted">No staff or resources yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Services</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>
                      {r.name}
                      {r.title ? <span className="muted"> · {r.title}</span> : null}
                    </td>
                    <td>{r.services.map((rs) => rs.service.name).join(", ") || "—"}</td>
                    <td className="row-actions">
                      <button
                        className="secondary"
                        onClick={() => setEditingAvailabilityFor(editingAvailabilityFor === r.id ? null : r.id)}
                      >
                        {editingAvailabilityFor === r.id ? "Close" : "Availability"}
                      </button>
                      <button className="danger" onClick={() => deleteMutation.mutate(r.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {editingAvailabilityFor === r.id && (
                    <tr>
                      <td colSpan={3}>
                        <AvailabilityEditor resourceId={r.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

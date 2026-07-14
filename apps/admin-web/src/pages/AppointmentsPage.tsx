import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "BOOKED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  service: { name: string };
  resource: { name: string };
  customer: { name: string | null; phone: string };
}

export function AppointmentsPage() {
  const queryClient = useQueryClient();
  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api.get<Appointment[]>("/appointments"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appointments"] }),
  });

  return (
    <div>
      <div className="page-header">
        <h1>Appointments</h1>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="muted">Loading…</p>
        ) : !appointments?.length ? (
          <p className="muted">No appointments yet — bookings made via WhatsApp or the API will show up here.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Service</th>
                <th>With</th>
                <th>Customer</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.startsAt).toLocaleString()}</td>
                  <td>{a.service.name}</td>
                  <td>{a.resource.name}</td>
                  <td>
                    {a.customer.name ?? "—"} <span className="muted">{a.customer.phone}</span>
                  </td>
                  <td>
                    <span className={`badge ${a.status.toLowerCase()}`}>{a.status}</span>
                  </td>
                  <td className="row-actions">
                    {a.status === "BOOKED" && (
                      <button className="danger" onClick={() => cancelMutation.mutate(a.id)}>
                        Cancel
                      </button>
                    )}
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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { countBodyPlaceholders, KNOWN_TEMPLATE_VARIABLES } from "@whatsapp-booking/shared";
import { api, ApiError } from "../api/client";
import { RichTextEditor } from "../components/RichTextEditor";

interface Template {
  id: string;
  name: string;
  category: "CONFIRMATION" | "REMINDER" | "CANCELLATION" | "CUSTOM";
  language: string;
  bodyText: string;
  variables: string[];
  approvalStatus: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
}

function previewBody(bodyText: string, variables: string[]): string {
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, n) => {
    const variable = variables[Number(n) - 1];
    return variable ? `《${variable}》` : match;
  });
}

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<Template[]>("/templates"),
  });

  const [form, setForm] = useState({
    name: "",
    category: "REMINDER" as Template["category"],
    language: "en",
    bodyText: "",
    variables: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  const placeholderCount = countBodyPlaceholders(form.bodyText);
  const variableCountMismatch = form.bodyText.length > 0 && placeholderCount !== form.variables.length;

  const createMutation = useMutation({
    mutationFn: () => api.post<Template>("/templates", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setForm({ name: "", category: "REMINDER", language: "en", bodyText: "", variables: [] });
      setEditorKey((k) => k + 1); // remount the (uncontrolled) rich text editor to clear it
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create template."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => api.post(`/templates/${id}/submit`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to submit template."),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.post(`/templates/${id}/sync-status`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  function updateVariable(index: number, value: string) {
    setForm((f) => ({ ...f, variables: f.variables.map((v, i) => (i === index ? value : v)) }));
  }

  function addVariable() {
    setForm((f) => ({ ...f, variables: [...f.variables, ""] }));
  }

  function removeVariable(index: number) {
    setForm((f) => ({ ...f, variables: f.variables.filter((_, i) => i !== index) }));
  }

  /** Called by the rich text editor's "+ Variable" button: registers a new
   * blank variable slot and returns the matching {{n}} token to insert. */
  function handleInsertVariable(): string {
    const token = `{{${form.variables.length + 1}}}`;
    addVariable();
    return token;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Message templates</h1>
      </div>
      <p className="muted" style={{ marginTop: -12, marginBottom: 20 }}>
        WhatsApp requires business-initiated messages (reminders, confirmations, cancellations) to
        use a pre-approved template. Define your own variables in any order you like — the body
        text's <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… map positionally to the variables
        below. Reminders, confirmations, and cancellations automatically fill in whichever of{" "}
        {KNOWN_TEMPLATE_VARIABLES.map((v) => (
          <code key={v} style={{ marginRight: 4 }}>
            {v}
          </code>
        ))}{" "}
        you use; anything else is left blank unless you send it manually.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>New template</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="form-row">
            <div className="field">
              <label>Name (lowercase, underscores)</label>
              <input
                value={form.name}
                pattern="[a-z0-9_]+"
                placeholder="appointment_reminder"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Template["category"] })}
              >
                <option value="CONFIRMATION">Confirmation</option>
                <option value="REMINDER">Reminder</option>
                <option value="CANCELLATION">Cancellation</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div className="field">
              <label>Language</label>
              <input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Body text</label>
            <RichTextEditor
              key={editorKey}
              placeholder="Hi {{1}}, reminder for your {{2}} appointment on {{3}}."
              onChange={(text) => setForm((f) => ({ ...f, bodyText: text }))}
              onInsertVariable={handleInsertVariable}
            />
          </div>

          <div className="field">
            <label>
              Variables ({placeholderCount} placeholder{placeholderCount === 1 ? "" : "s"} in body text)
            </label>
            <datalist id="known-template-variables">
              {KNOWN_TEMPLATE_VARIABLES.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            {form.variables.map((variable, index) => (
              <div key={index} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <span className="muted" style={{ minWidth: 32 }}>
                  {`{{${index + 1}}}`}
                </span>
                <input
                  list="known-template-variables"
                  value={variable}
                  placeholder="variable_name"
                  onChange={(e) => updateVariable(index, e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="button" className="secondary" onClick={() => removeVariable(index)}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="secondary" onClick={addVariable}>
              Add variable
            </button>
          </div>

          {form.bodyText && (
            <div className="muted" style={{ marginBottom: 10 }}>
              Preview: {previewBody(form.bodyText, form.variables)}
            </div>
          )}
          {variableCountMismatch && (
            <p className="error-text">
              {placeholderCount} placeholder{placeholderCount === 1 ? "" : "s"} in the body text but{" "}
              {form.variables.length} variable{form.variables.length === 1 ? "" : "s"} defined — these
              must match.
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          <button
            type="submit"
            disabled={createMutation.isPending || variableCountMismatch || !form.bodyText.trim()}
          >
            {createMutation.isPending ? "Creating…" : "Create draft"}
          </button>
        </form>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="muted">Loading…</p>
        ) : !templates?.length ? (
          <p className="muted">No templates yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.name}
                    <div className="muted">{previewBody(t.bodyText, t.variables)}</div>
                  </td>
                  <td>{t.category}</td>
                  <td>
                    <span className={`badge ${t.approvalStatus.toLowerCase()}`}>{t.approvalStatus}</span>
                  </td>
                  <td className="row-actions">
                    {t.approvalStatus === "DRAFT" && (
                      <button className="secondary" onClick={() => submitMutation.mutate(t.id)}>
                        Submit for approval
                      </button>
                    )}
                    {t.approvalStatus === "PENDING" && (
                      <button className="secondary" onClick={() => syncMutation.mutate(t.id)}>
                        Check status
                      </button>
                    )}
                    <button className="danger" onClick={() => deleteMutation.mutate(t.id)}>
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

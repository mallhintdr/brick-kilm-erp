import { useState } from 'react';
import { useT } from '../i18n.js';
import { del, put, getRole } from '../api.js';

const GLYPHS = {
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />,
  save: <path d="M20 6 9 17l-5-5" />,
  cancel: <path d="M18 6 6 18M6 6l12 12" />,
  delete: <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m5 5v6m4-6v6" />,
};

export function IconBtn({ kind, title, onClick, disabled }) {
  return (
    <button type="button" className={`icon-btn icon-btn-${kind}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {GLYPHS[kind]}
      </svg>
    </button>
  );
}

// Holds the edit state for a table: which row is open and its draft values.
export function useRowEdit() {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  return {
    editId,
    draft,
    isEditing: (id) => editId === id,
    start: (id, values) => { setEditId(id); setDraft(values); },
    stop: () => { setEditId(null); setDraft({}); },
    field: (k) => ({ value: draft[k] ?? '', onChange: (e) => setDraft((d) => ({ ...d, [k]: e.target.value })) }),
  };
}

// Icon-only edit / save / cancel / delete for one table row. Edit and delete are owner-only
// unless `canEdit`/`canDelete` say otherwise. `toPayload(draft)` shapes the PUT body.
export default function RowActions({
  editor, id, initial, path, name, toPayload = (d) => d, onSaved, onDeleted, onError,
  canEdit = getRole() === 'owner', canDelete = getRole() === 'owner', editable = true,
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const editing = editor.isEditing(id);

  async function save() {
    setBusy(true);
    try {
      await put(path, toPayload(editor.draft));
      editor.stop();
      onSaved?.();
    } catch (e) { onError?.(e.message); }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm(`${t.confirmDelete}: ${name}?`)) return;
    setBusy(true);
    try { onDeleted?.(await del(path)); } catch (e) { onError?.(e.message); }
    setBusy(false);
  }

  return (
    <div className="row-actions">
      {editing ? (
        <>
          <IconBtn kind="save" title={t.save} onClick={save} disabled={busy} />
          <IconBtn kind="cancel" title={t.cancel} onClick={editor.stop} disabled={busy} />
        </>
      ) : (
        <>
          {canEdit && editable && <IconBtn kind="edit" title={t.edit} onClick={() => editor.start(id, initial)} disabled={busy} />}
          {canDelete && <IconBtn kind="delete" title={t.delete} onClick={remove} disabled={busy} />}
        </>
      )}
    </div>
  );
}

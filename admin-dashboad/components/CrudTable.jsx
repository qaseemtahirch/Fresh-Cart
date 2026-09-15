'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function CrudTable({ title, path, columns, createLabel = 'Add New', fields = [], canEdit = false, canDelete = false }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await api(path);
      setRows(Array.isArray(data) ? data : data.data || data.items || []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setForm({});
    setEditingId(null);
    setError('');
    setShow(true);
  }

  function startEdit(row) {
    setForm(Object.fromEntries(fields.map(field => [field.name, row[field.name] ?? ''])));
    setEditingId(row.id);
    setError('');
    setShow(true);
  }

  function payload() {
    return Object.fromEntries(fields.map(field => {
      const value = form[field.name];
      return [field.name, field.type === 'number' ? Number(value) : field.type === 'checkbox' ? Boolean(value) : value ?? ''];
    }));
  }

  async function save(event) {
    event.preventDefault();
    try {
      await api(editingId ? `${path}/${editingId}` : path, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload()),
      });
      setForm({});
      setEditingId(null);
      setShow(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api(`${path}/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return <>
    <div className="sectionHead">
      <h2>{title}</h2>
      <button className="btn primary" onClick={startCreate}>{createLabel}</button>
    </div>
    {error && <div className="error">{error}</div>}
    {show && <form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
      <div className="formGrid">
        {fields.map(field => <div className={'field ' + (field.full ? 'full' : '')} key={field.name}>
          <label>{field.label}</label>
          <input className="input" required={field.required !== false} type={field.type || 'text'} checked={field.type === 'checkbox' ? Boolean(form[field.name]) : undefined} value={field.type === 'checkbox' ? undefined : form[field.name] ?? ''} onChange={event => setForm({ ...form, [field.name]: field.type === 'checkbox' ? event.target.checked : event.target.value })} />
        </div>)}
      </div>
      <div style={{ marginTop: 15 }}>
        <button className="btn primary">{editingId ? 'Update' : 'Save'}</button>
        <button type="button" className="btn secondary" onClick={() => { setShow(false); setEditingId(null); }}>Cancel</button>
      </div>
    </form>}
    <div className="card tableWrap">
      <table className="table">
        <thead><tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}{(canEdit || canDelete) && <th>Actions</th>}</tr></thead>
        <tbody>
          {rows.map((row, index) => <tr key={row.id || index}>
            {columns.map(column => <td key={column.key}>{column.format === 'status' ? (row[column.key] ? 'Active' : 'Inactive') : String(row[column.key] ?? '—')}</td>)}
            {(canEdit || canDelete) && <td>
              {canEdit && <button className="btn secondary" onClick={() => startEdit(row)}>Edit</button>}
              {canDelete && <button className="btn danger" onClick={() => remove(row.id)}>Delete</button>}
            </td>}
          </tr>)}
          {rows.length === 0 && <tr><td colSpan={columns.length + (canEdit || canDelete ? 1 : 0)} className="muted">No records found.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}

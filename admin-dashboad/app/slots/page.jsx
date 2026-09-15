'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';

import { api } from '@/lib/api';

const timeLabel = value => {
	const [hour, minute] = String(value || '').slice(0, 5).split(':').map(Number);
	if (Number.isNaN(hour) || Number.isNaN(minute)) return value || '—';
	return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};
const oneHourLater = value => {
	const [hour, minute] = String(value || '').split(':').map(Number);
	if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
	return `${String((hour + 1) % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export default function Slots() {
	const [rows, setRows] = useState([]);
	const [form, setForm] = useState({ slot_date: '', start_time: '13:00', end_time: '14:00', max_orders: 10, is_active: true });
	const [editingId, setEditingId] = useState(null);
	const [error, setError] = useState('');

	async function load() {
		try {
			const data = await api('/admin/time-slots');
			setRows(Array.isArray(data) ? data : []);
		} catch (e) { setError(e.message); }
	}

	useEffect(() => { load(); }, []);

	function reset() {
		setEditingId(null);
		setForm({ slot_date: '', start_time: '13:00', end_time: '14:00', max_orders: 10, is_active: true });
	}

	async function save(event) {
		event.preventDefault();
		try {
			setError('');
			await api(editingId ? `/admin/time-slots/${editingId}` : '/admin/time-slots', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify({ ...form, max_orders: Number(form.max_orders) }) });
			reset();
			load();
		} catch (e) { setError(e.message); }
	}

	async function deactivate(row) {
		if (!window.confirm(`Deactivate ${timeLabel(row.start_time)} - ${timeLabel(row.end_time)}?`)) return;
		try {
			await api(`/admin/time-slots/${row.id}`, { method: 'PUT', body: JSON.stringify({ slot_date: row.date, start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5), max_orders: row.max_orders, is_active: false }) });
			load();
		} catch (e) { setError(e.message); }
	}

	return <AdminShell title="Time Slots">
		<div className="sectionHead"><h2>Delivery slots</h2><button className="btn secondary" onClick={reset}>New slot</button></div>
		{error && <div className="error">{error}</div>}
		<form className="card" onSubmit={save} style={{ marginBottom: 16 }}>
			<div className="formGrid">
				<label className="field"><span>Date</span><input className="input" type="date" required value={form.slot_date} onChange={e => setForm({ ...form, slot_date: e.target.value })} /></label>
				<label className="field"><span>Start time</span><input className="input" type="time" required value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value, end_time: oneHourLater(e.target.value) })} /></label>
				<label className="field"><span>End time (1 hour)</span><input className="input" type="time" required readOnly value={form.end_time} /></label>
				<label className="field"><span>Capacity</span><input className="input" type="number" min="1" required value={form.max_orders} onChange={e => setForm({ ...form, max_orders: e.target.value })} /></label>
				<label className="field"><span>Availability</span><select className="input" value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
			</div>
			<div style={{ marginTop: 15 }}><button className="btn primary">{editingId ? 'Update slot' : 'Create slot'}</button>{editingId && <button type="button" className="btn secondary" onClick={reset}>Cancel</button>}</div>
		</form>
		<div className="card tableWrap"><table className="table"><thead><tr><th>Date</th><th>Time</th><th>Capacity</th><th>Status</th><th>Actions</th></tr></thead><tbody>
			{rows.map(row => <tr key={row.id}><td>{row.date}</td><td>{timeLabel(row.start_time)} - {timeLabel(row.end_time)}</td><td>{row.booked_orders} / {row.max_orders}</td><td><span className={`pill ${row.is_active ? 'green' : 'red'}`}>{row.is_active ? 'Active' : 'Inactive'}</span></td><td><button className="btn secondary" onClick={() => { setEditingId(row.id); setForm({ slot_date: row.date, start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5), max_orders: row.max_orders, is_active: row.is_active }); }}>Edit</button>{row.is_active && <button className="btn danger" onClick={() => deactivate(row)}>Deactivate</button>}</td></tr>)}
			{!rows.length && <tr><td colSpan="5" className="muted">No delivery slots found.</td></tr>}
		</tbody></table></div>
	</AdminShell>;
}

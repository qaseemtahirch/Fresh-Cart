'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api } from '@/lib/api';

const timeLabel = value => {
	const [hour, minute] = String(value || '').slice(0, 5).split(':').map(Number);
	if (Number.isNaN(hour) || Number.isNaN(minute)) return value || '—';
	return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

export default function Riders() {
	const [riders, setRiders] = useState([]);
	const [slots, setSlots] = useState([]);
	const [selected, setSelected] = useState({});
	const [error, setError] = useState('');

	async function load() {
		try {
			const [riderRows, slotRows] = await Promise.all([api('/admin/riders'), api(`/admin/time-slots/availability?date=${today()}`)]);
			setRiders(Array.isArray(riderRows) ? riderRows : []);
			setSlots(Array.isArray(slotRows) ? slotRows : []);
		} catch (e) { setError(e.message); }
	}

	useEffect(() => { load(); }, []);

	async function loadAssignments(riderId) {
		try {
			const rows = await api(`/admin/riders/${riderId}/time-slots?date=${today()}`);
			setSelected(current => ({ ...current, [riderId]: rows.filter(row => row.assigned).map(row => row.id) }));
		} catch (e) { setError(e.message); }
	}

	async function saveAssignments(riderId) {
		try {
			await api(`/admin/riders/${riderId}/time-slots?date=${today()}`, { method: 'PUT', body: JSON.stringify({ time_slot_ids: selected[riderId] || [] }) });
			await loadAssignments(riderId);
		} catch (e) { setError(e.message); }
	}

	return <AdminShell title="Riders">
		{error && <div className="error">{error}</div>}
		<div className="card tableWrap"><table className="table"><thead><tr><th>Rider</th><th>Assigned slots</th><th>Active orders</th><th>Action</th></tr></thead><tbody>
			{riders.map(rider => <tr key={rider.id}><td><strong>{rider.name}</strong><br /><span className="muted">{rider.phone || rider.email}</span></td><td><select className="input" multiple size="6" value={(selected[rider.id] || []).map(String)} onFocus={() => selected[rider.id] === undefined && loadAssignments(rider.id)} onChange={event => setSelected({ ...selected, [rider.id]: [...event.target.selectedOptions].map(option => Number(option.value)) })}>{slots.map(slot => { const assignedToOther = slot.assigned_rider && slot.assigned_rider.id !== rider.id; const disabled = assignedToOther || !slot.is_active; return <option key={slot.slot_id} value={slot.slot_id} disabled={disabled}>{slot.time}{slot.assigned_rider ? ` — Assigned to ${slot.assigned_rider.name}` : !slot.is_active ? ' — Inactive' : ''}</option>; })}</select><span className="muted">Today only. Assigned slots are locked for other riders.</span></td><td>{rider.active_orders || 0}</td><td><button className="btn primary" onClick={() => saveAssignments(rider.id)}>Save assignment</button></td></tr>)}
			{!riders.length && <tr><td colSpan="4" className="muted">No riders found.</td></tr>}
		</tbody></table></div>
	</AdminShell>;
}

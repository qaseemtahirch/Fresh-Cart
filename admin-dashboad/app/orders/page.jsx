'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api } from '@/lib/api';

const money = value => `Rs. ${Number(value || 0).toLocaleString('en-PK')}`;
const sizeLabel = (size, unit) => unit === 'liter' ? `${size} ml` : `${Number(size) >= 1000 ? Number(size) / 1000 : size} ${Number(size) >= 1000 ? 'kg' : 'g'}`;
const timeLabel = value => {
	const [hour, minute] = String(value || '').slice(0, 5).split(':').map(Number);
	if (Number.isNaN(hour) || Number.isNaN(minute)) return value || '—';
	const suffix = hour >= 12 ? 'PM' : 'AM';
	return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

export default function Orders() {
	const [rows, setRows] = useState([]);
	const [selected, setSelected] = useState(null);
	const [error, setError] = useState('');
	const [filters, setFilters] = useState({ date: '', slot_id: '', rider_id: '', status: '', customer: '' });
	const [riders, setRiders] = useState([]);
	const [slots, setSlots] = useState([]);

	useEffect(() => {
		Promise.all([api('/admin/riders'), api('/admin/time-slots')]).then(([riderRows, slotRows]) => { setRiders(riderRows || []); setSlots(slotRows || []); }).catch(error => setError(error.message));
	}, []);

	useEffect(() => {
		const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
		api(`/admin/orders?${query}`)
			.then(data => setRows(Array.isArray(data) ? data : data.data || data.items || []))
			.catch(error => setError(error.message));
	}, [filters]);

	async function openOrder(id) {
		try {
			setError('');
			const order = await api(`/orders/${id}`);
			setSelected(order);
			return order;
		} catch (error) {
			setError(error.message);
		}
	}

	async function updateStatus(id, status, event) {
		event.stopPropagation();
		try {
			setError('');
			await api(`/admin/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
			setRows(current => current.map(row => row.id === id ? { ...row, status } : row));
			setSelected(current => current?.id === id ? { ...current, status } : current);
		} catch (error) {
			setError(error.message);
		}
	}

	async function printOrder(id, event) {
		event.stopPropagation();
		const order = await openOrder(id);
		if (order) setTimeout(() => window.print(), 0);
	}

	return <AdminShell title="Orders">
		{error && <div className="error">{error}</div>}
		<div className="toolbar"><input className="input" type="date" value={filters.date} onChange={event => setFilters({ ...filters, date: event.target.value })} /><select className="input" value={filters.slot_id} onChange={event => setFilters({ ...filters, slot_id: event.target.value })}><option value="">All slots</option>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.date} · {timeLabel(slot.start_time)} - {timeLabel(slot.end_time)}</option>)}</select><select className="input" value={filters.rider_id} onChange={event => setFilters({ ...filters, rider_id: event.target.value })}><option value="">All riders</option>{riders.map(rider => <option key={rider.id} value={rider.id}>{rider.name}</option>)}</select><select className="input" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{['pending', 'confirmed', 'preparing', 'assigned', 'accepted', 'out_for_delivery', 'delivered', 'failed', 'cancelled'].map(status => <option key={status} value={status}>{status}</option>)}</select><input className="input" placeholder="Customer or order" value={filters.customer} onChange={event => setFilters({ ...filters, customer: event.target.value })} /></div>
		<div className="card tableWrap adminOrderTable">
			<table className="table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
				<tbody>{rows.map((row, index) => <tr key={row.id || index} onClick={() => openOrder(row.id)} className="clickableRow">
					<td>#{row.id}</td><td>{row.customer_name || row.user_name || '—'}</td><td>{money(row.total ?? row.grand_total)}</td><td>{row.payment_method || '—'}</td><td><span className="pill green">{row.status || '—'}</span></td><td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td><td><div className="orderActions" onClick={event => event.stopPropagation()}>{['confirmed', 'preparing', 'out_for_delivery', 'delivered'].map(status => <button key={status} className="btn secondary statusAction" onClick={event => updateStatus(row.id, status, event)}>{status === 'out_for_delivery' ? 'Out for delivery' : status[0].toUpperCase() + status.slice(1)}</button>)}<button className="btn primary statusAction" onClick={event => printOrder(row.id, event)}>Print</button></div></td>
				</tr>)}{!rows.length && <tr><td colSpan="7" className="muted">No orders found.</td></tr>}</tbody>
			</table>
		</div>

		{selected && <section className="orderDetails card">
			<div className="orderDetailsHead"><div><h2>Order #{selected.id}</h2><p className="muted">{selected.order_number}</p></div><button className="btn primary printButton" onClick={() => window.print()}>Print Order</button></div>
			<div className="printSlip">
				<div className="slipHeader"><strong>FRESHCART</strong><span>GROCERY DELIVERY</span><span>ORDER SLIP</span></div>
				<div className="slipInfo"><div><b>Customer Name:</b> {selected.customer_name || `Customer #${selected.user_id}`}</div><div><b>Order ID:</b> {selected.id}</div><div><b>Order Number:</b> {selected.order_number || '—'}</div><div><b>Delivery Location:</b> {selected.delivery_address || '—'}</div><div><b>Delivery Time Slot:</b> {timeLabel(selected.slot_start_time)} - {timeLabel(selected.slot_end_time)}</div><div><b>Payment Method:</b> {selected.payment_method === 'jazzcash' ? 'JazzCash' : 'COD'}</div></div>
				<table className="slipTable"><thead><tr><th>Product Name</th><th>Size</th><th>Quantity</th><th>Unit Price</th><th>Item Total</th></tr></thead><tbody>{(selected.items || []).map(item => <tr key={item.id}><td>{item.product_name}</td><td>{sizeLabel(item.size_ml, item.unit_type)}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.item_total)}</td></tr>)}</tbody></table>
				<div className="billSummary"><div>Subtotal: <b>{money(selected.subtotal)}</b></div><div>Shipping: <b>{money(selected.shipping)}</b></div>{Number(selected.discount) > 0 && <div>Discount: <b>{money(selected.discount)}</b></div>}<div className="totalBill">Total Bill: {money(selected.total)}</div></div>
			</div>
		</section>}
	</AdminShell>;
}

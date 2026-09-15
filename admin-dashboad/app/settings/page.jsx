'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api } from '@/lib/api';

export default function SettingsPage() {
	const [form, setForm] = useState({ minimum_order_amount: 250, shipping_fee: 70, free_shipping_threshold: 1000, currency: 'PKR', free_shipping_enabled: true });
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');
	useEffect(() => { api('/admin/settings/shipping').then(setForm).catch(e => setError(e.message)); }, []);
	async function save(event) {
		event.preventDefault();
		try {
			setError('');
			const data = await api('/admin/settings/shipping', { method: 'PUT', body: JSON.stringify({ ...form, minimum_order_amount: Number(form.minimum_order_amount), shipping_fee: Number(form.shipping_fee), free_shipping_threshold: Number(form.free_shipping_threshold) }) });
			setForm(data.settings);
			setMessage(data.message);
		} catch (e) { setMessage(''); setError(e.message); }
	}
	return <AdminShell title="Settings"><section className="card" style={{ maxWidth: 720 }}><div className="sectionHead"><div><h2>Shipping &amp; Order Settings</h2><p className="muted">These values apply to new checkouts immediately.</p></div></div>{message && <div className="success">{message}</div>}{error && <div className="error">{error}</div>}<form onSubmit={save}><div className="formGrid"><label className="field"><span>Minimum order amount</span><input className="input" type="number" min="0" step="0.01" value={form.minimum_order_amount} onChange={e => setForm({ ...form, minimum_order_amount: e.target.value })} /></label><label className="field"><span>Shipping fee</span><input className="input" type="number" min="0" step="0.01" value={form.shipping_fee} onChange={e => setForm({ ...form, shipping_fee: e.target.value })} /></label><label className="field"><span>Free shipping threshold</span><input className="input" type="number" min="0" step="0.01" value={form.free_shipping_threshold} onChange={e => setForm({ ...form, free_shipping_threshold: e.target.value })} /></label><label className="field"><span>Currency</span><input className="input" maxLength="6" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></label><label className="field"><span>Free shipping</span><select className="input" value={form.free_shipping_enabled ? 'enabled' : 'disabled'} onChange={e => setForm({ ...form, free_shipping_enabled: e.target.value === 'enabled' })}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label></div><button className="btn primary" style={{ marginTop: 16 }}>Save Settings</button></form></section></AdminShell>;
}
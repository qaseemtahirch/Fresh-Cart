 'use client';
import {useEffect,useState} from 'react';
import Sidebar from './Sidebar';
import Link from 'next/link';
import {LayoutDashboard,Package,ShoppingBag,Bell} from 'lucide-react';
import {api} from '@/lib/api';

function AdminBrowserNotifications(){
 const [enabled,setEnabled]=useState(false);
 useEffect(()=>{
   if(typeof window==='undefined'||!('Notification' in window))return;
   setEnabled(Notification.permission==='granted');
   let stored=localStorage.getItem('freshcart_admin_last_notification'); let last=Number(stored||0);
   const poll=async()=>{
     try{
       const rows=await api('/admin/notifications');
       const list=Array.isArray(rows)?rows:[];
       const newest=list.reduce((m,n)=>Math.max(m,Number(n.id)||0),last);
       const fresh=stored===null?[]:list.filter(n=>Number(n.id)>last).sort((a,b)=>Number(a.id)-Number(b.id));
       if(Notification.permission==='granted'){
         fresh.forEach(n=>{const note=new Notification(n.title,{body:n.message,icon:'/favicon.ico',tag:`freshcart-${n.id}`});note.onclick=()=>{window.focus();window.location.href='/orders'}});
       }
       if(newest>last){localStorage.setItem('freshcart_admin_last_notification',String(newest));last=newest}
     }catch{}
   };
   poll();
   const timer=setInterval(poll,5000);
   return()=>clearInterval(timer);
 },[]);
 const enable=async()=>{
   if(!('Notification' in window)){alert('This browser does not support notifications.');return}
   const p=await Notification.requestPermission();
   setEnabled(p==='granted');
 };
 return <button className="notificationBtn" onClick={enable} title={enabled?'Browser alerts enabled':'Enable browser alerts'}><Bell size={17}/>{enabled?'Alerts on':'Enable alerts'}</button>
}
export default function AdminShell({title,children}){
 const [ready,setReady]=useState(false);
 useEffect(()=>{if(!localStorage.getItem('freshcart_token'))location.href='/login';else setReady(true)},[]);
 if(!ready)return null;
 return <div className="shell"><Sidebar/><main className="main"><header className="top"><h1>{title}</h1><div className="admin"><AdminBrowserNotifications/><span className="muted">Administrator</span><div className="avatar">A</div></div></header><div className="content">{children}</div></main><nav className="mobileNav"><Link href="/dashboard"><LayoutDashboard size={18}/><br/>Home</Link><Link href="/products"><Package size={18}/><br/>Products</Link><Link href="/orders"><ShoppingBag size={18}/><br/>Orders</Link></nav></div>
}

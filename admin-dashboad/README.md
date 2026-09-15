# FreshCart Admin — Next.js

Modern responsive admin dashboard for the existing FreshCart Go/Gin backend.

## Features
- Admin login with JWT
- Dashboard KPIs
- Products
- Categories
- Orders
- Riders
- Delivery time slots
- Coupon generator/management
- Delivery pricing
- Responsive desktop/mobile layout
- Uses the existing `/api/admin/*` backend routes

## Run
```bash
cp .env.local.example .env.local
npm install
npm run dev
```
Open http://localhost:3000.

Default development admin: `admin@freshcart.local` / `FreshCart123!`

Set `NEXT_PUBLIC_API_URL` to your Go API, e.g. `http://localhost:8080/api`.

> Note: endpoint response shapes can vary slightly by backend version. The dashboard accepts common array/data/items response wrappers. For create/edit operations, match the exact JSON fields exposed by your current Go handlers.

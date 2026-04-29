# 🌱 Carbon-Neutral Energy Planning Management System

A full-stack, offline-runnable web app with a **living-leaf ecosystem** UI for managing carbon-neutral energy data backed by your local **MariaDB** database `CarbonNeutralEnergyDB`.

```
/backend     -> Flask API + JWT auth + bcrypt + RBAC + MariaDB (mysql-connector-python)
/frontend    -> React + Vite + Tailwind + Framer Motion + Recharts
```

---

## 1. Prerequisites

- **MariaDB** running locally with database `CarbonNeutralEnergyDB` already imported
  from your `energydb.sql` dump (user `root`, no password — matches the defaults).
- **Python 3.10+**
- **Node.js 18+**

> If MariaDB uses a different host/port/user/password, edit `backend/.env` (see step 2).

### Optional: add the GridConnection table
The original SQL dump does not contain a `GridConnection` table but it is part
of the requested feature set. Run once:

```bash
mysql -u root CarbonNeutralEnergyDB < backend/extra_schema.sql
```

---

## 2. Run the backend (Flask + MariaDB)

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env       # adjust if needed
python app.py
```

The API starts on **http://localhost:5000**.

On first run it creates an `AppUser` table and a default admin:

```
username: admin
password: admin123
```

Health check: <http://localhost:5000/api/health>

---

## 3. Run the frontend (React)

In a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and log in with `admin / admin123`.

> The frontend talks to `http://localhost:5000` by default. To change it, create
> `frontend/.env` with `VITE_API_BASE=http://localhost:5000`.

---

## 4. Features

### 🔐 Authentication & RBAC
- Signup / login / logout
- Roles: **admin** (full), **analyst** (read + create + update), **viewer** (read-only)
- Passwords hashed with **bcrypt**, JWT (`PyJWT`) sessions
- Protected routes on the frontend, role-checked on every API call

### 🌍 Dashboard
- Total Production / Consumption / Emissions / Plant counts
- Energy trends area chart (production vs consumption vs emissions)
- Renewable vs non-renewable donut chart
- Animated leaf cards, floating particles, glassmorphism

### 🌿 Data Management (CRUD)
Tables (only the requested non-normalized ones):

`Region, City, Operator, PowerPlant, EnergySource, FuelType, Sector,
ConsumerCategory, EnergyProduction, EnergyConsumption, EmissionRecord,
WeatherRecord (= WeatherCondition), GridConnection, TransmissionGrid,
Installation, ActivityIndicator, TimeRecord`

- Search, pagination, FK dropdowns (City → Region, etc.)
- Add / Edit / Delete with role-aware UI
- Date pickers for date columns

### 📈 Smart Insights
- Top emission cities
- Most productive power plants

### 🛡️ Security
- All SQL uses **parameterized queries** (no string concatenation of values)
- Identifiers come from a server-side **whitelist registry** — no user input is ever
  used as a column or table name
- Bcrypt password hashing
- JWT bearer tokens, 12h expiry
- CORS limited to `/api/*`
- Generic error messages — DB internals never leak to clients
- Frontend input validation; FK values supplied via dropdowns

---

## 5. API Quick Reference

```
POST   /api/auth/signup        {username, password, role}
POST   /api/auth/login         {username, password}     -> {token, user}
GET    /api/auth/me            (Bearer token)

GET    /api/schema
GET    /api/tables/:name?q=&page=&page_size=&<fk_col>=
GET    /api/tables/:name/:id
POST   /api/tables/:name       (admin/analyst)
PUT    /api/tables/:name/:id   (admin/analyst)
DELETE /api/tables/:name/:id   (admin only)

GET    /api/insights/summary
GET    /api/insights/trends
GET    /api/insights/top-emission-cities
GET    /api/insights/top-plants
```

All `/api/tables/*` and `/api/insights/*` require `Authorization: Bearer <token>`.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| `Can't connect to MySQL server on 'localhost'` | Make sure MariaDB is running on `127.0.0.1:3306` and the DB `CarbonNeutralEnergyDB` exists. |
| `Access denied for user 'root'` | Edit `backend/.env` and set `DB_PASSWORD=...` to your real password. |
| CORS errors in browser | The backend already enables CORS on `/api/*`. Make sure the frontend is using `http://localhost:5173` and the backend `http://localhost:5000`. |
| `Table 'GridConnection' doesn't exist` | Run `mysql -u root CarbonNeutralEnergyDB < backend/extra_schema.sql`. |
| PK constraint errors when inserting | The dump uses **manual integer primary keys** (not auto-increment). When adding rows, supply the `*_id` field with a unique number. |

---

Built to feel like a living green ecosystem. 🌿

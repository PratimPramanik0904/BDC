# Mock SAP Business Data Cloud O2C Platform

A full-stack mock implementation of an SAP Business Data Cloud Order-to-Cash (O2C) workflow for demo, prototyping, and academic submission.

The project combines:

- Synthetic but relationally consistent O2C dataset generation
- Flask-based semantic API with RBAC, governance endpoints, and audit trail
- React dashboard with Data Catalog, AI Risk Insights, and Audit Log views

## Solution Overview

This repository simulates a lightweight BDC-style data product layer where different business roles can:

- Discover and preview curated O2C data products
- Trigger O2C process simulation endpoints
- Run deterministic AI-like payment risk scoring
- Monitor API access through a governance-friendly audit log

## Architecture

### Backend

- Framework: Flask
- Data access: pandas CSV loading
- Security model: role-based access via `X-User-Role`
- Cross-origin support: CORS-enabled for local frontend development

### Frontend

- Framework: React (Vite)
- UI pattern: single-page tabbed dashboard
- Data layer: native `fetch` with backend host fallback strategy

### Data Layer

- Generator: `generate_mock_data.py`
- Storage: local CSVs under `data/`
- Domain entities:
	- customers
	- materials
	- sales orders
	- deliveries
	- invoices
	- payments

## Repository Layout

```text
.
|- app.py
|- generate_mock_data.py
|- data/
|  |- customers.csv
|  |- materials.csv
|  |- sales_orders.csv
|  |- deliveries.csv
|  |- invoices.csv
|  |- payments.csv
|- frontend/
|  |- src/
|     |- App.jsx
```

## API Surface

All `/api/*` routes require a valid role header:

```http
X-User-Role: admin | sales | finance
```

### Service Endpoints

- `GET /` - service metadata and route list
- `GET /health` - runtime health check

### Data Product Endpoints

- `GET /api/dataproducts`
- `GET /api/dataproducts/<product_name>`
- `GET /api/dataproducts/<product_name>/schema`

### Workflow and Insights

- `POST /api/o2c/execute/<step>`
- `POST /api/insights/payment-risk`

### Governance

- `GET /api/audit`

## Frontend Capabilities

- Role switcher for RBAC-aware behavior
- Data Catalog tab:
	- KPI cards
	- searchable product cards
	- preview table with filtering
- AI Insights tab:
	- payment risk form
	- probability + explanation output
- Audit Log tab:
	- refreshable, searchable governance table
	- fetch timestamp indicator

## Local Setup

## Requirements

- Python 3.10+
- Node.js 18+
- npm

### 1. Backend

From project root:

```bash
pip install -r requirements.txt
python generate_mock_data.py
python app.py
```

Backend URL: `http://localhost:5000`

### 2. Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## Quick Validation

After both services are running:

1. Open the frontend and select `admin` role.
2. Confirm Data Catalog and KPIs load.
3. Run AI Insight with sample input:
	 - customer_id: `101`
	 - order_amount: `75000`
	 - region: `APAC`
4. Open Audit Log tab and verify recent API events appear.

## Troubleshooting

- `Cannot reach backend API`:
	- Ensure Flask is running on port `5000`.
	- Verify frontend is opened from `http://localhost:5173`.
- Empty catalog:
	- Regenerate files via `python generate_mock_data.py`.
- Role-based 403 responses:
	- Ensure `X-User-Role` is one of `admin`, `sales`, or `finance`.

## Submission Readiness

This project is submission-ready for a mock SAP BDC O2C demonstration, including:

- reproducible data generation,
- role-aware backend APIs,
- AI insight simulation,
- governance/audit visibility,
- polished frontend experience.

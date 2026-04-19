# Mock SAP Business Data Cloud O2C

A mock SAP Business Data Cloud order-to-cash (O2C) project with:

- Synthetic O2C data generation
- Flask semantic API with role-based access control and audit logging
- React frontend dashboard with Data Catalog, AI Insights, and Audit Log views

## Project Structure

- `generate_mock_data.py` - builds the synthetic CSV dataset in `data/`
- `app.py` - Flask backend API
- `frontend/src/App.jsx` - React dashboard UI
- `data/` - generated CSV files used by the backend

## Features

### Data Generator
Creates six related CSV files with referential integrity:

- `customers.csv`
- `materials.csv`
- `sales_orders.csv`
- `deliveries.csv`
- `invoices.csv`
- `payments.csv`

### Backend API
The Flask app exposes:

- `GET /` - service info
- `GET /health` - health check
- `GET /api/dataproducts` - catalog of available data products
- `GET /api/dataproducts/<product_name>` - preview rows for a product
- `GET /api/dataproducts/<product_name>/schema` - column schema for a product
- `POST /api/o2c/execute/<step>` - simulated O2C workflow step
- `POST /api/insights/payment-risk` - deterministic AI-style payment risk insight
- `GET /api/audit` - audit trail viewer

All API routes expect an `X-User-Role` header with one of:

- `admin`
- `sales`
- `finance`

### Frontend UI
The React dashboard includes:

- Role selector
- Data Catalog tab with KPI cards, search, product cards, and preview tables
- AI Insights tab with a payment risk form and result card
- Audit Log tab with searchable audit entries and refresh support

## Prerequisites

- Python 3.10+
- Node.js 18+
- `pip` for Python packages

## Backend Setup

From the project root:

```bash
pip install -r requirements.txt
python generate_mock_data.py
python app.py
```

The backend runs on `http://localhost:5000`.

## Frontend Setup

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

## Usage

1. Start the backend.
2. Start the frontend.
3. Open the frontend in your browser.
4. Choose a role from the dropdown.
5. Explore the Data Catalog, AI Insights, and Audit Log tabs.

## Notes

- If the catalog appears empty, rerun `python generate_mock_data.py` from the project root.
- The frontend is configured to call the backend on `http://localhost:5000`, with fallbacks for `127.0.0.1` and the current browser host.
- The AI risk insight is rule-based and deterministic for demo purposes.

## Submission

This repository is ready for local demo and submission as a mock SAP BDC O2C showcase.

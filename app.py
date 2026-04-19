from __future__ import annotations

import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from flask import Flask, g, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DATA_DIR = Path(__file__).resolve().parent / "data"
VALID_ROLES = {"sales", "finance", "admin"}
VALID_STEPS = {"create_order", "create_delivery", "create_invoice", "record_payment"}

SEMANTIC_MAPPING: dict[str, str] = {
    "customer_id": "Customer Master ID",
    "customer_name": "Customer Legal Name",
    "region": "Sales Region",
    "credit_limit": "Customer Credit Limit",
    "payment_terms": "Payment Terms",
    "material_id": "Material Master ID",
    "material_name": "Material Description",
    "category": "Material Category",
    "unit_price": "Material Unit Price",
    "stock_qty": "Available Stock Quantity",
    "order_id": "Sales Order ID",
    "order_date": "Sales Order Date",
    "quantity": "Ordered Quantity",
    "net_value": "Order Net Value",
    "order_status": "Sales Order Status",
    "delivery_id": "Delivery Document ID",
    "delivery_date": "Delivery Date",
    "shipped_qty": "Shipped Quantity",
    "delivery_status": "Delivery Status",
    "invoice_id": "Billing Invoice ID",
    "invoice_date": "Invoice Date",
    "gross_amount": "Invoice Gross Amount",
    "tax_amount": "Invoice Tax Amount",
    "net_amount": "Invoice Net Amount",
    "payment_due_date": "Payment Due Date",
    "payment_id": "Payment Document ID",
    "payment_date": "Payment Posting Date",
    "paid_amount": "Paid Amount",
    "payment_method": "Payment Method",
    "days_late": "Payment Delay Days",
}

PRODUCT_FILES: dict[str, str] = {
    "customers": "customers.csv",
    "materials": "materials.csv",
    "sales_orders": "sales_orders.csv",
    "deliveries": "deliveries.csv",
    "invoices": "invoices.csv",
    "payments": "payments.csv",
}

PRODUCT_ACCESS: dict[str, set[str]] = {
    "customers": {"admin"},
    "materials": {"admin"},
    "sales_orders": {"sales", "admin"},
    "deliveries": {"sales", "admin"},
    "invoices": {"finance", "admin"},
    "payments": {"finance", "admin"},
}

STEP_ACCESS: dict[str, set[str]] = {
    "create_order": {"sales", "admin"},
    "create_delivery": {"sales", "admin"},
    "create_invoice": {"finance", "admin"},
    "record_payment": {"finance", "admin"},
}

DATA_PRODUCTS: dict[str, pd.DataFrame] = {}
LAST_UPDATED: dict[str, str] = {}
AUDIT_LOGS: list[dict[str, Any]] = []
ACTION_LOGS: list[dict[str, Any]] = []


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _api_response(data: Any = None, message: str = "", http_status: int = 200, status: str = "success"):
    return jsonify({"status": status, "data": data, "message": message}), http_status


def _normalize_for_json(df: pd.DataFrame) -> list[dict[str, Any]]:
    clean_df = df.where(pd.notnull(df), None)
    return clean_df.to_dict(orient="records")


def _load_data_products() -> None:
    missing_files = []

    for product_name, file_name in PRODUCT_FILES.items():
        path = DATA_DIR / file_name
        if not path.exists():
            missing_files.append(file_name)
            continue

        DATA_PRODUCTS[product_name] = pd.read_csv(path)
        LAST_UPDATED[product_name] = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()

    if missing_files:
        app.logger.warning("Missing CSV files in data directory: %s", ", ".join(missing_files))


def _get_role() -> str | None:
    role = request.headers.get("X-User-Role", "").strip().lower()
    return role or None


def _is_allowed_for_product(role: str, product_name: str) -> bool:
    if role == "admin":
        return True
    return role in PRODUCT_ACCESS.get(product_name, set())


def _is_allowed_for_step(role: str, step: str) -> bool:
    if role == "admin":
        return True
    return role in STEP_ACCESS.get(step, set())


@app.before_request
def enforce_role_header():
    g.request_started_at = _utc_now_iso()

    if not request.path.startswith("/api"):
        return None

    role = _get_role()
    g.user_role = role

    if role not in VALID_ROLES:
        return _api_response(data=None, message="Forbidden: invalid or missing X-User-Role", http_status=403, status="error")

    return None


@app.after_request
def audit_request(response):
    if request.path.startswith("/api"):
        role = getattr(g, "user_role", _get_role()) or "unknown"
        AUDIT_LOGS.append(
            {
                "timestamp": _utc_now_iso(),
                "endpoint": request.path,
                "method": request.method,
                "user_role": role,
                "status_code": response.status_code,
            }
        )
    return response


@app.errorhandler(404)
def handle_not_found(_error):
    return _api_response(data=None, message="Resource not found", http_status=404, status="error")


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    return _api_response(data=None, message="Method not allowed", http_status=405, status="error")


@app.errorhandler(500)
def handle_server_error(_error):
    return _api_response(data=None, message="Internal server error", http_status=500, status="error")


@app.get("/")
def root():
    return _api_response(
        data={
            "service": "Mock SAP BDC O2C API",
            "version": "1.0",
            "routes": [
                "/api/dataproducts",
                "/api/dataproducts/<product_name>",
                "/api/dataproducts/<product_name>/schema",
                "/api/o2c/execute/<step>",
                "/api/audit",
            ],
        },
        message="Service is running",
    )


@app.get("/health")
def health():
    return _api_response(data={"ok": True, "timestamp": _utc_now_iso()}, message="Healthy")


@app.get("/api/dataproducts")
def list_dataproducts():
    role = g.user_role

    products = []
    for product_name, df in DATA_PRODUCTS.items():
        if _is_allowed_for_product(role, product_name):
            products.append(
                {
                    "name": product_name,
                    "row_count": int(len(df)),
                    "last_updated": LAST_UPDATED.get(product_name),
                }
            )

    return _api_response(data=products, message="Available data products")


@app.get("/api/dataproducts/<product_name>/schema")
def get_dataproduct_schema(product_name: str):
    role = g.user_role

    if product_name not in DATA_PRODUCTS:
        return _api_response(data=None, message=f"Data product '{product_name}' not found", http_status=404, status="error")

    if not _is_allowed_for_product(role, product_name):
        return _api_response(data=None, message="Forbidden for this data product", http_status=403, status="error")

    columns = DATA_PRODUCTS[product_name].columns.tolist()
    schema = {col: SEMANTIC_MAPPING.get(col, col.replace("_", " ").title()) for col in columns}

    return _api_response(data={"product": product_name, "schema": schema}, message="Semantic schema retrieved")


@app.get("/api/dataproducts/<product_name>")
def preview_dataproduct(product_name: str):
    role = g.user_role

    if product_name not in DATA_PRODUCTS:
        return _api_response(data=None, message=f"Data product '{product_name}' not found", http_status=404, status="error")

    if not _is_allowed_for_product(role, product_name):
        return _api_response(data=None, message="Forbidden for this data product", http_status=403, status="error")

    preview_rows = _normalize_for_json(DATA_PRODUCTS[product_name].head(10))
    return _api_response(data={"product": product_name, "preview": preview_rows}, message="Data product preview")


@app.post("/api/o2c/execute/<step>")
def execute_o2c_step(step: str):
    role = g.user_role

    if step not in VALID_STEPS:
        return _api_response(data=None, message=f"Invalid O2C step '{step}'", http_status=400, status="error")

    if not _is_allowed_for_step(role, step):
        return _api_response(data=None, message="Forbidden for this O2C step", http_status=403, status="error")

    payload = request.get_json(silent=True) or {}
    success = random.random() >= 0.1
    result_status = "completed" if success else "failed"

    action_record = {
        "timestamp": _utc_now_iso(),
        "step": step,
        "user_role": role,
        "payload": payload,
        "result": result_status,
    }
    ACTION_LOGS.append(action_record)

    if success:
        return _api_response(
            data={"step": step, "result": result_status, "action_log_id": len(ACTION_LOGS)},
            message=f"O2C step '{step}' executed",
        )

    return _api_response(
        data={"step": step, "result": result_status, "action_log_id": len(ACTION_LOGS)},
        message=f"O2C step '{step}' failed during simulation",
        http_status=400,
        status="error",
    )


@app.get("/api/audit")
def get_audit_logs():
    role = g.user_role

    if role not in {"sales", "finance", "admin"}:
        return _api_response(data=None, message="Forbidden", http_status=403, status="error")

    return _api_response(data={"count": len(AUDIT_LOGS), "records": AUDIT_LOGS}, message="Audit trail")


_load_data_products()


if __name__ == "__main__":
    app.run(debug=True)


REQUIREMENTS_TXT = """flask
flask-cors
pandas
"""

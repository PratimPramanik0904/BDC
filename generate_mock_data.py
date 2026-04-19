import random
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from faker import Faker


def generate_customers(n: int, faker: Faker) -> pd.DataFrame:
    regions = ["North", "South", "East", "West", "Central"]
    payment_terms_options = ["Net 15", "Net 30", "Net 45", "Net 60"]

    rows = []
    for i in range(1, n + 1):
        rows.append(
            {
                "customer_id": f"C{i:04d}",
                "customer_name": faker.company(),
                "region": random.choice(regions),
                "credit_limit": random.randint(50_000, 1_000_000),
                "payment_terms": random.choices(
                    payment_terms_options,
                    weights=[0.15, 0.5, 0.25, 0.1],
                    k=1,
                )[0],
            }
        )

    return pd.DataFrame(rows)


def generate_materials(n: int) -> pd.DataFrame:
    categories = ["Electronics", "Industrial", "Office", "Packaging", "Consumables"]

    rows = []
    for i in range(1, n + 1):
        category = random.choice(categories)
        rows.append(
            {
                "material_id": f"M{i:04d}",
                "material_name": f"{category} Item {i:03d}",
                "category": category,
                "unit_price": round(random.uniform(25.0, 2500.0), 2),
                "stock_qty": random.randint(100, 5000),
            }
        )

    return pd.DataFrame(rows)


def generate_sales_orders(
    n: int, customers_df: pd.DataFrame, materials_df: pd.DataFrame, base_start_date: datetime
) -> pd.DataFrame:
    order_statuses = ["Open", "Delivered", "Billed", "Paid"]

    customer_ids = customers_df["customer_id"].tolist()
    material_price_map = dict(zip(materials_df["material_id"], materials_df["unit_price"]))
    material_ids = materials_df["material_id"].tolist()

    rows = []
    for i in range(1, n + 1):
        order_date = base_start_date + timedelta(days=random.randint(0, 240))
        customer_id = random.choice(customer_ids)
        material_id = random.choice(material_ids)
        quantity = random.randint(1, 120)
        unit_price = float(material_price_map[material_id])
        net_value = round(quantity * unit_price, 2)

        rows.append(
            {
                "order_id": f"SO{i:05d}",
                "customer_id": customer_id,
                "material_id": material_id,
                "order_date": order_date.date().isoformat(),
                "quantity": quantity,
                "net_value": net_value,
                "order_status": random.choices(order_statuses, weights=[0.15, 0.25, 0.3, 0.3], k=1)[0],
            }
        )

    return pd.DataFrame(rows)


def generate_deliveries(sales_orders_df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for i, order in enumerate(sales_orders_df.itertuples(index=False), start=1):
        order_date = datetime.fromisoformat(order.order_date)
        delivery_date = order_date + timedelta(days=random.randint(1, 10))

        shipped_qty = random.randint(max(1, int(order.quantity * 0.8)), order.quantity)
        if shipped_qty < order.quantity:
            delivery_status = random.choices(["Pending", "Shipped"], weights=[0.35, 0.65], k=1)[0]
        else:
            delivery_status = "Delivered"

        rows.append(
            {
                "delivery_id": f"DL{i:05d}",
                "order_id": order.order_id,
                "delivery_date": delivery_date.date().isoformat(),
                "shipped_qty": shipped_qty,
                "delivery_status": delivery_status,
            }
        )

    return pd.DataFrame(rows)


def generate_invoices(sales_orders_df: pd.DataFrame, deliveries_df: pd.DataFrame) -> pd.DataFrame:
    delivery_date_map = dict(zip(deliveries_df["order_id"], deliveries_df["delivery_date"]))

    rows = []
    for i, order in enumerate(sales_orders_df.itertuples(index=False), start=1):
        delivery_date = datetime.fromisoformat(delivery_date_map[order.order_id])
        invoice_date = delivery_date + timedelta(days=random.randint(1, 5))

        tax_rate = random.choice([0.05, 0.08, 0.1, 0.12, 0.18])
        net_amount = round(float(order.net_value), 2)
        tax_amount = round(net_amount * tax_rate, 2)
        gross_amount = round(net_amount + tax_amount, 2)

        rows.append(
            {
                "invoice_id": f"IV{i:05d}",
                "order_id": order.order_id,
                "invoice_date": invoice_date.date().isoformat(),
                "gross_amount": gross_amount,
                "tax_amount": tax_amount,
                "net_amount": net_amount,
                "payment_due_date": "",  # filled later based on customer terms
            }
        )

    return pd.DataFrame(rows)


def assign_due_dates(
    invoices_df: pd.DataFrame, sales_orders_df: pd.DataFrame, customers_df: pd.DataFrame
) -> pd.DataFrame:
    order_customer_map = dict(zip(sales_orders_df["order_id"], sales_orders_df["customer_id"]))
    customer_terms_map = dict(zip(customers_df["customer_id"], customers_df["payment_terms"]))
    term_days = {"Net 15": 15, "Net 30": 30, "Net 45": 45, "Net 60": 60}

    due_dates = []
    for row in invoices_df.itertuples(index=False):
        invoice_date = datetime.fromisoformat(row.invoice_date)
        customer_id = order_customer_map[row.order_id]
        due_days = term_days[customer_terms_map[customer_id]]
        due_date = invoice_date + timedelta(days=due_days)
        due_dates.append(due_date.date().isoformat())

    invoices_df = invoices_df.copy()
    invoices_df["payment_due_date"] = due_dates
    return invoices_df


def generate_payments(invoices_df: pd.DataFrame, n: int = 180) -> pd.DataFrame:
    payment_methods = ["Bank Transfer", "Credit Card", "ACH", "Wire", "Cash"]

    selected_invoice_ids = random.sample(invoices_df["invoice_id"].tolist(), n)
    invoice_map = invoices_df.set_index("invoice_id").to_dict(orient="index")

    late_count = int(round(n * 0.15))
    late_invoice_ids = set(random.sample(selected_invoice_ids, late_count))

    rows = []
    for i, invoice_id in enumerate(selected_invoice_ids, start=1):
        invoice = invoice_map[invoice_id]
        due_date = datetime.fromisoformat(invoice["payment_due_date"])

        if invoice_id in late_invoice_ids:
            days_late = random.randint(1, 30)
            payment_date = due_date + timedelta(days=days_late)
        else:
            days_early_or_on_time = random.randint(0, 7)
            payment_date = due_date - timedelta(days=days_early_or_on_time)
            days_late = 0

        rows.append(
            {
                "payment_id": f"PY{i:05d}",
                "invoice_id": invoice_id,
                "payment_date": payment_date.date().isoformat(),
                "paid_amount": round(float(invoice["gross_amount"]), 2),
                "payment_method": random.choice(payment_methods),
                "days_late": days_late,
            }
        )

    return pd.DataFrame(rows)


def validate_integrity(
    customers_df: pd.DataFrame,
    materials_df: pd.DataFrame,
    sales_orders_df: pd.DataFrame,
    deliveries_df: pd.DataFrame,
    invoices_df: pd.DataFrame,
    payments_df: pd.DataFrame,
) -> None:
    customer_ids = set(customers_df["customer_id"])
    material_ids = set(materials_df["material_id"])
    order_ids = set(sales_orders_df["order_id"])
    invoice_ids = set(invoices_df["invoice_id"])

    assert set(sales_orders_df["customer_id"]).issubset(customer_ids)
    assert set(sales_orders_df["material_id"]).issubset(material_ids)
    assert set(deliveries_df["order_id"]).issubset(order_ids)
    assert set(invoices_df["order_id"]).issubset(order_ids)
    assert set(payments_df["invoice_id"]).issubset(invoice_ids)

    merged_orders = sales_orders_df.merge(
        materials_df[["material_id", "unit_price"]], on="material_id", how="left"
    )
    calculated_net = (merged_orders["quantity"] * merged_orders["unit_price"]).round(2)
    assert (calculated_net == merged_orders["net_value"]).all()

    invoice_order_net = invoices_df.merge(
        sales_orders_df[["order_id", "net_value"]], on="order_id", how="left", suffixes=("_invoice", "_order")
    )
    assert (invoice_order_net["net_amount"].round(2) == invoice_order_net["net_value"].round(2)).all()

    merged_timing = (
        sales_orders_df[["order_id", "order_date"]]
        .merge(deliveries_df[["order_id", "delivery_date"]], on="order_id")
        .merge(invoices_df[["order_id", "invoice_date", "payment_due_date"]], on="order_id")
    )

    order_dt = pd.to_datetime(merged_timing["order_date"])
    delivery_dt = pd.to_datetime(merged_timing["delivery_date"])
    invoice_dt = pd.to_datetime(merged_timing["invoice_date"])
    due_dt = pd.to_datetime(merged_timing["payment_due_date"])

    assert (order_dt < delivery_dt).all()
    assert (delivery_dt < invoice_dt).all()
    assert (invoice_dt < due_dt).all()

    pay_timing = payments_df.merge(invoices_df[["invoice_id", "payment_due_date"]], on="invoice_id", how="left")
    payment_dt = pd.to_datetime(pay_timing["payment_date"])
    due_payment_dt = pd.to_datetime(pay_timing["payment_due_date"])

    assert ((pay_timing["days_late"] == 0) == (payment_dt <= due_payment_dt)).all()
    assert ((pay_timing["days_late"] > 0) == (payment_dt > due_payment_dt)).all()


def print_summary(
    customers_df: pd.DataFrame,
    materials_df: pd.DataFrame,
    sales_orders_df: pd.DataFrame,
    deliveries_df: pd.DataFrame,
    invoices_df: pd.DataFrame,
    payments_df: pd.DataFrame,
) -> None:
    late_pct = (payments_df["days_late"] > 0).mean() * 100

    print("Mock SAP O2C data generated successfully.")
    print("Row counts:")
    print(f"  customers.csv: {len(customers_df)}")
    print(f"  materials.csv: {len(materials_df)}")
    print(f"  sales_orders.csv: {len(sales_orders_df)}")
    print(f"  deliveries.csv: {len(deliveries_df)}")
    print(f"  invoices.csv: {len(invoices_df)}")
    print(f"  payments.csv: {len(payments_df)}")

    print("Date ranges:")
    print(
        f"  order_date: {sales_orders_df['order_date'].min()} to {sales_orders_df['order_date'].max()}"
    )
    print(
        f"  delivery_date: {deliveries_df['delivery_date'].min()} to {deliveries_df['delivery_date'].max()}"
    )
    print(
        f"  invoice_date: {invoices_df['invoice_date'].min()} to {invoices_df['invoice_date'].max()}"
    )
    print(
        f"  payment_due_date: {invoices_df['payment_due_date'].min()} to {invoices_df['payment_due_date'].max()}"
    )
    print(
        f"  payment_date: {payments_df['payment_date'].min()} to {payments_df['payment_date'].max()}"
    )

    print(f"Late payments: {late_pct:.2f}%")


def main() -> None:
    random.seed(42)
    faker = Faker()
    Faker.seed(42)

    output_dir = Path("data")
    output_dir.mkdir(parents=True, exist_ok=True)

    customers_df = generate_customers(100, faker)
    materials_df = generate_materials(50)
    base_start_date = datetime(2024, 1, 1)

    sales_orders_df = generate_sales_orders(200, customers_df, materials_df, base_start_date)
    deliveries_df = generate_deliveries(sales_orders_df)
    invoices_df = generate_invoices(sales_orders_df, deliveries_df)
    invoices_df = assign_due_dates(invoices_df, sales_orders_df, customers_df)
    payments_df = generate_payments(invoices_df, 180)

    validate_integrity(
        customers_df,
        materials_df,
        sales_orders_df,
        deliveries_df,
        invoices_df,
        payments_df,
    )

    customers_df.to_csv(output_dir / "customers.csv", index=False, encoding="utf-8")
    materials_df.to_csv(output_dir / "materials.csv", index=False, encoding="utf-8")
    sales_orders_df.to_csv(output_dir / "sales_orders.csv", index=False, encoding="utf-8")
    deliveries_df.to_csv(output_dir / "deliveries.csv", index=False, encoding="utf-8")
    invoices_df.to_csv(output_dir / "invoices.csv", index=False, encoding="utf-8")
    payments_df.to_csv(output_dir / "payments.csv", index=False, encoding="utf-8")

    print_summary(
        customers_df,
        materials_df,
        sales_orders_df,
        deliveries_df,
        invoices_df,
        payments_df,
    )


if __name__ == "__main__":
    main()

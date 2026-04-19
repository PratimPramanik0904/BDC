/*
npm create vite@latest bdc-mock -- --template react
cd bdc-mock && npm install
npm run dev
*/

import { useEffect, useState } from "react";

const API_BASES = (() => {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const candidates = [`http://${host}:5000`, "http://localhost:5000", "http://127.0.0.1:5000"];
  return [...new Set(candidates)];
})();

function App() {
  const [role, setRole] = useState("admin");
  const [activeTab, setActiveTab] = useState("catalog");

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [productsForbidden, setProductsForbidden] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewForbidden, setPreviewForbidden] = useState(false);

  const [kpiLoading, setKpiLoading] = useState(false);
  const [totalOrders, setTotalOrders] = useState("--");
  const [latePaymentsPct, setLatePaymentsPct] = useState("--");
  const [avgNetValue, setAvgNetValue] = useState("--");

  const [customerId, setCustomerId] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [region, setRegion] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");
  const [insightForbidden, setInsightForbidden] = useState(false);
  const [insightResult, setInsightResult] = useState(null);

  const apiFetch = async (path, options = {}) => {
    const requestOptions = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": role,
        ...(options.headers || {}),
      },
    };

    let lastError = null;

    for (const base of API_BASES) {
      try {
        return await fetch(`${base}${path}`, requestOptions);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Network request failed");
  };

  const loadDashboard = async () => {
    setProductsLoading(true);
    setKpiLoading(true);
    setProductsError("");
    setProductsForbidden(false);
    setSelectedProduct(null);
    setPreviewRows([]);
    setPreviewError("");
    setPreviewForbidden(false);

    try {
      const catalogRes = await apiFetch("/api/dataproducts");
      const catalogJson = await catalogRes.json();

      if (catalogRes.status === 403) {
        setProductsForbidden(true);
        setProducts([]);
        setTotalOrders("--");
        setLatePaymentsPct("--");
        setAvgNetValue("--");
        return;
      }

      if (!catalogRes.ok || catalogJson.status !== "success") {
        throw new Error(catalogJson.message || "Failed to load data products.");
      }

      const catalog = Array.isArray(catalogJson.data) ? catalogJson.data : [];
      setProducts(catalog);

      const salesOrdersMeta = catalog.find((item) => item.name === "sales_orders");
      setTotalOrders(
        salesOrdersMeta && typeof salesOrdersMeta.row_count === "number"
          ? String(salesOrdersMeta.row_count)
          : "--"
      );

      const [salesOrdersRes, paymentsRes] = await Promise.all([
        apiFetch("/api/dataproducts/sales_orders"),
        apiFetch("/api/dataproducts/payments"),
      ]);

      let avgValue = "--";
      let latePct = "--";

      if (salesOrdersRes.ok) {
        const salesOrdersJson = await salesOrdersRes.json();
        if (salesOrdersJson.status === "success") {
          const rows = salesOrdersJson?.data?.preview || [];
          const values = rows
            .map((row) => Number(row.net_value))
            .filter((value) => Number.isFinite(value));

          if (values.length > 0) {
            const average = values.reduce((sum, value) => sum + value, 0) / values.length;
            avgValue = average.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          }
        }
      }

      if (paymentsRes.ok) {
        const paymentsJson = await paymentsRes.json();
        if (paymentsJson.status === "success") {
          const rows = paymentsJson?.data?.preview || [];
          if (rows.length > 0) {
            const lateCount = rows.filter((row) => Number(row.days_late) > 0).length;
            latePct = `${((lateCount / rows.length) * 100).toFixed(1)}%`;
          }
        }
      }

      setAvgNetValue(avgValue);
      setLatePaymentsPct(latePct);
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Cannot reach backend API. Start Flask on http://localhost:5000 and try again."
          : error.message || "Unexpected error while loading dashboard.";
      setProductsError(message);
      setProducts([]);
      setTotalOrders("--");
      setLatePaymentsPct("--");
      setAvgNetValue("--");
    } finally {
      setProductsLoading(false);
      setKpiLoading(false);
    }
  };

  const handleViewDetails = async (productName) => {
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewForbidden(false);
    setSelectedProduct(productName);

    try {
      const response = await apiFetch(`/api/dataproducts/${productName}`);
      const payload = await response.json();

      if (response.status === 403) {
        setPreviewForbidden(true);
        setPreviewRows([]);
        return;
      }

      if (response.status === 404) {
        setPreviewError("Data product not found.");
        setPreviewRows([]);
        return;
      }

      if (!response.ok || payload.status !== "success") {
        throw new Error(payload.message || "Failed to load preview.");
      }

      setPreviewRows(Array.isArray(payload?.data?.preview) ? payload.data.preview : []);
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Cannot reach backend API. Start Flask on http://localhost:5000 and try again."
          : error.message || "Unexpected error while loading preview.";
      setPreviewError(message);
      setPreviewRows([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePredictRisk = async (event) => {
    event.preventDefault();

    if (!customerId || !orderAmount || !region) {
      return;
    }

    setInsightLoading(true);
    setInsightError("");
    setInsightForbidden(false);
    setInsightResult(null);

    try {
      const response = await apiFetch("/api/insights/payment-risk", {
        method: "POST",
        body: JSON.stringify({
          customer_id: Number(customerId),
          order_amount: Number(orderAmount),
          region,
        }),
      });

      const payload = await response.json();

      if (response.status === 403) {
        setInsightForbidden(true);
        return;
      }

      if (!response.ok || payload.status !== "success") {
        throw new Error(payload.message || "Failed to get risk prediction.");
      }

      setInsightResult(payload.data || null);
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Cannot reach backend API. Start Flask on http://localhost:5000 and try again."
          : error.message || "Unexpected error while predicting risk.";
      setInsightError(message);
    } finally {
      setInsightLoading(false);
    }
  };

  const previewColumns = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  const predictDisabled = !customerId || !orderAmount || !region || insightLoading;

  const riskLevel = insightResult?.risk_level || "";
  const badgeColor =
    riskLevel === "Low"
      ? "#22c55e"
      : riskLevel === "Medium"
        ? "#f59e0b"
        : riskLevel === "High"
          ? "#ef4444"
          : "#64748b";

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return (
    <div style={styles.page}>
      <style>{`
        * { box-sizing: border-box; }
        :root {
          color-scheme: light;
          color: #172033;
          background-color: #eef2f7;
        }
        body {
          margin: 0;
          background: radial-gradient(circle at top left, #eef4ff 0%, #f7f8fc 40%, #eef2f7 100%);
          font-family: Inter, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          color: #172033;
        }
        .card {
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(221,228,240,0.95);
          border-radius: 16px;
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(8px);
        }
        .grid {
          display: grid;
          gap: 16px;
        }
        .spinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.45);
          border-top-color: #ffffff;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 900px) {
          .kpi-grid { grid-template-columns: 1fr !important; }
          .product-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <header className="card" style={styles.header}>
        <div>
          <div style={styles.badge}>SAP Business Data Cloud</div>
          <h1 style={styles.title}>O2C Dashboard</h1>
          <p style={styles.subtitle}>Mock data product catalog and semantic preview layer</p>
        </div>

        <div style={styles.roleBox}>
          <label htmlFor="role" style={styles.label}>Role</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={styles.select}
          >
            <option value="admin">admin</option>
            <option value="sales">sales</option>
            <option value="finance">finance</option>
          </select>
        </div>
      </header>

      <nav className="card" style={styles.tabBar}>
        <button
          type="button"
          style={{ ...styles.tabButton, ...(activeTab === "catalog" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("catalog")}
        >
          Data Catalog
        </button>
        <button
          type="button"
          style={{ ...styles.tabButton, ...(activeTab === "insights" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("insights")}
        >
          AI Insights
        </button>
      </nav>

      {activeTab === "catalog" && (
        <>
          <section className="grid kpi-grid" style={styles.kpiGrid}>
            <div className="card" style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Total Orders</div>
              <div style={styles.kpiValue}>{kpiLoading ? "..." : totalOrders}</div>
            </div>
            <div className="card" style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Late Payments %</div>
              <div style={styles.kpiValue}>{kpiLoading ? "..." : latePaymentsPct}</div>
            </div>
            <div className="card" style={styles.kpiCard}>
              <div style={styles.kpiLabel}>Avg Net Value</div>
              <div style={styles.kpiValue}>{kpiLoading ? "..." : avgNetValue}</div>
            </div>
          </section>

          {productsForbidden && (
            <div style={{ ...styles.alert, ...styles.alertForbidden }}>Forbidden: invalid or missing role access.</div>
          )}
          {productsError && <div style={{ ...styles.alert, ...styles.alertError }}>{productsError}</div>}
          {productsLoading && <div style={{ ...styles.alert, ...styles.alertInfo }}>Loading data products...</div>}

          {!selectedProduct && !productsLoading && !productsForbidden && (
            <section className="grid product-grid" style={styles.productGrid}>
              {products.map((product) => (
                <article key={product.name} className="card" style={styles.productCard}>
                  <h3 style={styles.productTitle}>{product.name}</h3>
                  <p style={styles.productMeta}><strong>Rows:</strong> {product.row_count}</p>
                  <p style={styles.productMeta}><strong>Updated:</strong> {product.last_updated || "N/A"}</p>
                  <button style={styles.button} onClick={() => handleViewDetails(product.name)}>
                    View Details
                  </button>
                </article>
              ))}
              {products.length === 0 && (
                <div style={{ ...styles.alert, ...styles.alertInfo }}>No data products available for this role.</div>
              )}
            </section>
          )}

          {selectedProduct && (
            <section className="card" style={styles.previewSection}>
              <div style={styles.previewHeader}>
                <h2 style={styles.previewTitle}>Preview: {selectedProduct}</h2>
                <button
                  style={{ ...styles.button, ...styles.buttonSecondary }}
                  onClick={() => {
                    setSelectedProduct(null);
                    setPreviewRows([]);
                    setPreviewError("");
                    setPreviewForbidden(false);
                  }}
                >
                  Back
                </button>
              </div>

              {previewLoading && <div style={{ ...styles.alert, ...styles.alertInfo }}>Loading preview...</div>}
              {previewForbidden && (
                <div style={{ ...styles.alert, ...styles.alertForbidden }}>Forbidden: your role cannot access this data product.</div>
              )}
              {previewError && <div style={{ ...styles.alert, ...styles.alertError }}>{previewError}</div>}

              {!previewLoading && !previewForbidden && !previewError && previewRows.length > 0 && (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {previewColumns.map((column) => (
                          <th key={column} style={styles.th}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          {previewColumns.map((column) => (
                            <td key={`${index}-${column}`} style={styles.td}>
                              {String(row[column] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!previewLoading && !previewForbidden && !previewError && previewRows.length === 0 && (
                <div style={{ ...styles.alert, ...styles.alertInfo }}>No preview rows available.</div>
              )}
            </section>
          )}
        </>
      )}

      {activeTab === "insights" && (
        <section className="card" style={styles.insightsSection}>
          <h2 style={styles.insightsTitle}>AI Risk Insights</h2>
          <p style={styles.insightsSubtitle}>Simulate payment risk using role-aware backend scoring.</p>

          <form style={styles.formGrid} onSubmit={handlePredictRisk}>
            <div style={styles.fieldWrap}>
              <label htmlFor="customerId" style={styles.label}>Customer ID</label>
              <input
                id="customerId"
                type="number"
                min="1"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                style={styles.input}
                placeholder="e.g. 101"
              />
            </div>

            <div style={styles.fieldWrap}>
              <label htmlFor="orderAmount" style={styles.label}>Order Amount</label>
              <input
                id="orderAmount"
                type="number"
                min="0"
                step="0.01"
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)}
                style={styles.input}
                placeholder="e.g. 75000"
              />
            </div>

            <div style={styles.fieldWrap}>
              <label htmlFor="region" style={styles.label}>Region</label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={styles.select}
              >
                <option value="">Select region</option>
                <option value="EMEA">EMEA</option>
                <option value="AMER">AMER</option>
                <option value="APAC">APAC</option>
                <option value="LATAM">LATAM</option>
              </select>
            </div>

            <div style={{ ...styles.fieldWrap, justifyContent: "flex-end" }}>
              <button
                type="submit"
                style={{
                  ...styles.button,
                  ...(predictDisabled ? styles.buttonDisabled : {}),
                  minWidth: 150,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
                disabled={predictDisabled}
              >
                {insightLoading && <span className="spinner" />}
                {insightLoading ? "Predicting..." : "Predict Risk"}
              </button>
            </div>
          </form>

          {insightForbidden && (
            <div style={{ ...styles.alert, ...styles.alertForbidden, marginTop: 14 }}>
              Forbidden: your role is not allowed to access AI insights.
            </div>
          )}
          {insightError && (
            <div style={{ ...styles.alert, ...styles.alertError, marginTop: 14 }}>{insightError}</div>
          )}

          {insightResult && !insightLoading && !insightError && !insightForbidden && (
            <article className="card" style={styles.resultCard}>
              <div style={styles.resultHeader}>
                <h3 style={styles.resultTitle}>Prediction Result</h3>
                <span style={{ ...styles.riskBadge, background: badgeColor }}>{riskLevel || "Unknown"}</span>
              </div>
              <p style={styles.resultMeta}>
                <strong>Probability:</strong> {Number(insightResult.probability || 0).toFixed(1)}%
              </p>
              <p style={styles.resultText}>{insightResult.explanation || "No explanation provided."}</p>
            </article>
          )}
        </section>
      )}
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "24px 16px 40px",
  },
  header: {
    padding: 24,
    marginBottom: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "linear-gradient(135deg, rgba(32,84,215,0.12), rgba(120,92,255,0.12))",
    color: "#2548a7",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.1,
    color: "#132a5e",
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#5c6b8a",
  },
  roleBox: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 180,
  },
  label: {
    fontSize: 13,
    color: "#4d5a78",
    fontWeight: 600,
  },
  select: {
    height: 42,
    borderRadius: 12,
    border: "1px solid #cdd6ea",
    padding: "0 12px",
    background: "#fff",
    fontSize: 14,
    outline: "none",
  },
  input: {
    height: 42,
    borderRadius: 12,
    border: "1px solid #cdd6ea",
    padding: "0 12px",
    background: "#fff",
    fontSize: 14,
    outline: "none",
    width: "100%",
  },
  tabBar: {
    marginBottom: 18,
    padding: 8,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  tabButton: {
    border: "1px solid #d3def6",
    background: "#f4f7ff",
    color: "#33528a",
    padding: "10px 14px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
    minWidth: 130,
  },
  tabButtonActive: {
    background: "linear-gradient(135deg, #2054d7, #4f6eff)",
    color: "#ffffff",
    border: "1px solid transparent",
    boxShadow: "0 10px 24px rgba(32,84,215,0.18)",
  },
  kpiGrid: {
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    marginBottom: 18,
  },
  kpiCard: {
    padding: 18,
  },
  kpiLabel: {
    color: "#5d6b89",
    fontSize: 13,
    marginBottom: 8,
  },
  kpiValue: {
    color: "#0f2557",
    fontWeight: 800,
    fontSize: 30,
  },
  productGrid: {
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  },
  productCard: {
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  productTitle: {
    margin: 0,
    textTransform: "capitalize",
    color: "#162f66",
  },
  productMeta: {
    margin: 0,
    color: "#4f5f82",
    fontSize: 14,
  },
  button: {
    marginTop: 10,
    border: "none",
    borderRadius: 10,
    background: "linear-gradient(135deg, #2054d7, #4f6eff)",
    color: "white",
    height: 40,
    padding: "0 14px",
    cursor: "pointer",
    fontWeight: 700,
    boxShadow: "0 10px 24px rgba(32,84,215,0.18)",
  },
  buttonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  buttonSecondary: {
    background: "#e8eefc",
    color: "#193579",
    boxShadow: "none",
  },
  previewSection: {
    marginTop: 20,
    padding: 18,
  },
  previewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  previewTitle: {
    margin: 0,
    color: "#153066",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e6eaf3",
    borderRadius: 12,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 720,
    background: "#fff",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "#f2f6ff",
    borderBottom: "1px solid #dce5f8",
    color: "#274074",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #edf1fa",
    color: "#24355f",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  insightsSection: {
    padding: 18,
  },
  insightsTitle: {
    margin: 0,
    color: "#153066",
  },
  insightsSubtitle: {
    margin: "8px 0 16px",
    color: "#5c6b8a",
    fontSize: 14,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    alignItems: "end",
  },
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  resultCard: {
    marginTop: 16,
    padding: 16,
    background: "#fbfdff",
    border: "1px solid #dbe8ff",
    boxShadow: "0 10px 20px rgba(15, 23, 42, 0.05)",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  resultTitle: {
    margin: 0,
    color: "#193579",
  },
  riskBadge: {
    color: "#ffffff",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  resultMeta: {
    margin: "0 0 10px",
    color: "#2a3f6f",
    fontSize: 14,
  },
  resultText: {
    margin: 0,
    color: "#42587f",
    lineHeight: 1.6,
    fontSize: 14,
  },
  alert: {
    borderRadius: 12,
    padding: "10px 12px",
    marginBottom: 12,
    fontSize: 14,
  },
  alertInfo: {
    background: "#eef5ff",
    color: "#274e91",
    border: "1px solid #d6e7ff",
  },
  alertError: {
    background: "#fff2f2",
    color: "#8f1d1d",
    border: "1px solid #ffd6d6",
  },
  alertForbidden: {
    background: "#fff8e6",
    color: "#8a5a00",
    border: "1px solid #ffe7b0",
  },
};

export default App;

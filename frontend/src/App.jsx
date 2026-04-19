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
  const [nowTime, setNowTime] = useState(() => new Date().toLocaleTimeString());
  const [catalogSearch, setCatalogSearch] = useState("");
  const [previewSearch, setPreviewSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

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

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditForbidden, setAuditForbidden] = useState(false);
  const [auditLastFetchedAt, setAuditLastFetchedAt] = useState("");

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

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    setAuditError("");
    setAuditForbidden(false);

    try {
      const response = await apiFetch("/api/audit");
      const payload = await response.json();

      if (response.status === 403) {
        setAuditForbidden(true);
        setAuditLogs([]);
        return;
      }

      if (!response.ok || payload.status !== "success") {
        throw new Error(payload.message || "Failed to load audit logs.");
      }

      const logs = Array.isArray(payload?.data?.logs) ? payload.data.logs : [];
      setAuditLogs(logs);
      setAuditLastFetchedAt(new Date().toLocaleTimeString());
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Cannot reach backend API. Start Flask on http://localhost:5000 and try again."
          : error.message || "Unexpected error while loading audit logs.";
      setAuditError(message);
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const previewColumns = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  const filteredPreviewRows = previewRows.filter((row) => {
    if (!previewSearch.trim()) return true;
    const term = previewSearch.toLowerCase();
    return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(term));
  });

  const filteredAuditLogs = auditLogs.filter((entry) => {
    if (!auditSearch.trim()) return true;
    const term = auditSearch.toLowerCase();
    return [entry.timestamp, entry.endpoint, entry.method, entry.user_role, entry.status_code]
      .map((v) => String(v ?? "").toLowerCase())
      .some((v) => v.includes(term));
  });

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

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date().toLocaleTimeString());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab === "audit") {
      loadAuditLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, role]);

  return (
    <div style={styles.page}>
      <style>{`
        * { box-sizing: border-box; }
        :root {
          color-scheme: light;
          color: #172033;
          background-color: #eef2f7;
          --ink: #172033;
          --muted: #5c6b8a;
          --brand: #2054d7;
          --brand-2: #4f6eff;
          --surface: rgba(255,255,255,0.92);
          --line: rgba(221,228,240,0.95);
        }
        body {
          margin: 0;
          background: radial-gradient(circle at top left, #eef4ff 0%, #f7f8fc 40%, #eef2f7 100%);
          font-family: Inter, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          color: #172033;
          min-height: 100vh;
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(8px);
        }
        .grid {
          display: grid;
          gap: 16px;
        }
        .page-orb {
          position: fixed;
          width: 420px;
          height: 420px;
          border-radius: 999px;
          filter: blur(58px);
          z-index: -1;
          opacity: 0.28;
          animation: drift 16s ease-in-out infinite;
        }
        .orb-a {
          top: -120px;
          left: -90px;
          background: radial-gradient(circle, #6da7ff 0%, #b8d4ff 70%, transparent 100%);
        }
        .orb-b {
          bottom: -160px;
          right: -120px;
          background: radial-gradient(circle, #8ba9ff 0%, #c8d7ff 72%, transparent 100%);
          animation-delay: -8s;
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
        @keyframes drift {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(18px, -14px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        @media (max-width: 900px) {
          .kpi-grid { grid-template-columns: 1fr !important; }
          .product-grid { grid-template-columns: 1fr !important; }
          .header-meta { width: 100%; justify-content: flex-start !important; }
        }
      `}</style>

      <div className="page-orb orb-a" />
      <div className="page-orb orb-b" />

      <header className="card" style={styles.header}>
        <div>
          <div style={styles.badge}>SAP Business Data Cloud</div>
          <h1 style={styles.title}>O2C Dashboard</h1>
          <p style={styles.subtitle}>Mock data product catalog and semantic preview layer</p>
        </div>

        <div className="header-meta" style={styles.headerMeta}>
          <div style={styles.liveChip}>Live: {nowTime}</div>
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
        <button
          type="button"
          style={{ ...styles.tabButton, ...(activeTab === "audit" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("audit")}
        >
          Audit Log
        </button>
      </nav>

      {activeTab === "catalog" && (
        <>
          <section className="card" style={styles.toolbarCard}>
            <div style={styles.toolbarLeft}>
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search data products..."
                style={styles.input}
              />
            </div>
            <div style={styles.toolbarRight}>
              <div style={styles.statPill}>Products: {filteredProducts.length}</div>
              <div style={styles.statPill}>Role: {role}</div>
            </div>
          </section>

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
              {filteredProducts.map((product) => (
                <article key={product.name} className="card" style={styles.productCard}>
                  <h3 style={styles.productTitle}>{product.name}</h3>
                  <p style={styles.productMeta}><strong>Rows:</strong> {product.row_count}</p>
                  <p style={styles.productMeta}><strong>Updated:</strong> {product.last_updated || "N/A"}</p>
                  <button style={styles.button} onClick={() => handleViewDetails(product.name)}>
                    View Details
                  </button>
                </article>
              ))}
              {filteredProducts.length === 0 && (
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

              {!previewLoading && !previewForbidden && !previewError && (
                <div style={styles.previewToolbar}>
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    placeholder="Filter preview rows..."
                    style={styles.input}
                  />
                  <div style={styles.statPill}>Rows: {filteredPreviewRows.length}</div>
                </div>
              )}

              {!previewLoading && !previewForbidden && !previewError && filteredPreviewRows.length > 0 && (
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
                      {filteredPreviewRows.slice(0, 10).map((row, index) => (
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

              {!previewLoading && !previewForbidden && !previewError && filteredPreviewRows.length === 0 && (
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
              <div style={styles.meterTrack}>
                <div
                  style={{
                    ...styles.meterFill,
                    width: `${Math.max(0, Math.min(100, Number(insightResult.probability || 0)))}%`,
                    background: badgeColor,
                  }}
                />
              </div>
              <p style={styles.resultText}>{insightResult.explanation || "No explanation provided."}</p>
            </article>
          )}
        </section>
      )}

      {activeTab === "audit" && (
        <section className="card" style={styles.auditSection}>
          <div style={styles.auditHeader}>
            <div>
              <h2 style={styles.auditTitle}>Audit & Governance</h2>
              <p style={styles.auditSubtitle}>Track API usage events for role-based governance.</p>
            </div>

            <div style={styles.auditActions}>
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search logs..."
                style={{ ...styles.input, minWidth: 220 }}
              />
              <div style={styles.auditStatus}>
                <span style={styles.auditStatusDot} />
                {auditLastFetchedAt ? `Last fetch: ${auditLastFetchedAt}` : "Last fetch: Not fetched yet"}
              </div>
              <button
                type="button"
                onClick={loadAuditLogs}
                disabled={auditLoading}
                style={{
                  ...styles.button,
                  ...(auditLoading ? styles.buttonDisabled : {}),
                  marginTop: 0,
                  minWidth: 130,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {auditLoading && <span className="spinner" />}
                {auditLoading ? "Refreshing..." : "Refresh Logs"}
              </button>
            </div>
          </div>

          {auditLoading && <div style={{ ...styles.alert, ...styles.alertInfo }}>Loading audit logs...</div>}
          {auditForbidden && (
            <div style={{ ...styles.alert, ...styles.alertForbidden }}>
              Forbidden: your role is not allowed to access audit logs.
            </div>
          )}
          {auditError && <div style={{ ...styles.alert, ...styles.alertError }}>{auditError}</div>}

          {!auditLoading && !auditForbidden && !auditError && filteredAuditLogs.length > 0 && (
            <div style={{ ...styles.tableWrap, maxHeight: 430, overflowY: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>timestamp</th>
                    <th style={styles.th}>endpoint</th>
                    <th style={styles.th}>method</th>
                    <th style={styles.th}>role</th>
                    <th style={styles.th}>status_code</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.map((entry, index) => (
                    <tr key={`${entry.timestamp || "ts"}-${index}`}>
                      <td style={styles.td}>{String(entry.timestamp ?? "")}</td>
                      <td style={styles.td}>{String(entry.endpoint ?? "")}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.methodBadge, ...styles.methodBadgeFor(String(entry.method ?? "")) }}>
                          {String(entry.method ?? "").toUpperCase()}
                        </span>
                      </td>
                      <td style={styles.td}>{String(entry.user_role ?? entry.role ?? "")}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.codeBadge, ...styles.codeBadgeFor(Number(entry.status_code ?? 0)) }}>
                          {String(entry.status_code ?? "")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!auditLoading && !auditForbidden && !auditError && filteredAuditLogs.length === 0 && (
            <div style={{ ...styles.alert, ...styles.alertInfo }}>No audit logs available.</div>
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
  headerMeta: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  liveChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    color: "#224893",
    background: "#eaf2ff",
    border: "1px solid #cfe0ff",
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
  toolbarCard: {
    marginBottom: 14,
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  toolbarLeft: {
    flex: "1 1 260px",
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statPill: {
    background: "#eef5ff",
    border: "1px solid #d6e7ff",
    color: "#2a4d8f",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 700,
  },
  kpiCard: {
    padding: 18,
    position: "relative",
    overflow: "hidden",
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
  previewToolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginBottom: 10,
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
  meterTrack: {
    height: 10,
    borderRadius: 999,
    background: "#e8eef7",
    overflow: "hidden",
    marginBottom: 12,
  },
  meterFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 240ms ease",
  },
  auditSection: {
    padding: 18,
  },
  auditHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  auditTitle: {
    margin: 0,
    color: "#153066",
  },
  auditSubtitle: {
    margin: "8px 0 0",
    color: "#5c6b8a",
    fontSize: 14,
  },
  auditActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  auditStatus: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#43597f",
    background: "#eff5ff",
    border: "1px solid #dbe8ff",
    borderRadius: 999,
    padding: "7px 10px",
  },
  auditStatusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#22c55e",
    boxShadow: "0 0 0 2px rgba(34, 197, 94, 0.22)",
    flexShrink: 0,
  },
  methodBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700,
  },
  codeBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 700,
  },
  methodBadgeFor: (method) => {
    const m = String(method).toUpperCase();
    if (m === "GET") return { background: "#e8f3ff", color: "#1f5c9a" };
    if (m === "POST") return { background: "#eaf9ee", color: "#1f7a3f" };
    if (m === "PUT" || m === "PATCH") return { background: "#fff4e8", color: "#9a5b18" };
    if (m === "DELETE") return { background: "#ffecec", color: "#a12a2a" };
    return { background: "#edf1f7", color: "#4b5d7e" };
  },
  codeBadgeFor: (code) => {
    if (code >= 200 && code < 300) return { background: "#eaf9ee", color: "#1f7a3f" };
    if (code >= 300 && code < 400) return { background: "#eef5ff", color: "#2456a7" };
    if (code >= 400 && code < 500) return { background: "#fff4e8", color: "#9a5b18" };
    if (code >= 500) return { background: "#ffecec", color: "#a12a2a" };
    return { background: "#edf1f7", color: "#4b5d7e" };
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

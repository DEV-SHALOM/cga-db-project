// src/reports/termReport.jsx
// HTML print version (no jsPDF). Popup-safe (hidden iframe).
// Exports:
//   - generateTermReportHTML(summary, options)
//   - printTermReport(summary, options)   // recommended (hidden iframe, auto-fit, auto-print)
//   - openTermReport(summary, options)    // optional tab (can be blocked)
//   - generateTermPdf(summary, options)   // back-compat alias → printTermReport

import { Timestamp } from "firebase/firestore";

/** ===== Formatting helpers ===== */
const Format = {
  money: (n) => `₦${Math.max(0, Number(n) || 0).toLocaleString()}`,
  number: (n) => Math.max(0, Number(n) || 0).toLocaleString(),
  date: (date) => {
    if (!date) return "—";
    if (date instanceof Timestamp) return date.toDate().toLocaleDateString("en-GB");
    if (date?.toDate) return date.toDate().toLocaleDateString("en-GB");
    if (date instanceof Date) return date.toLocaleDateString("en-GB");
    const d = new Date(date);
    return isNaN(d) ? "—" : d.toLocaleDateString("en-GB");
  },
};

/** ===== HTML builder ===== */
export function generateTermReportHTML(summary = {}, options = {}) {
  const opts = {
    schoolName: "Chosen Generation Academy", // required title (sans-serif)
    logoUrl: null,                           // http(s) or data:image/*
    preparedBy: "Bursar / Accounts",
    approvedBy: "Principal",
    autoPrint: false,                        // when true, the page will print itself after auto-fit
    ...options,
  };

  const N = (v) => (v == null ? 0 : Number(v));
  const feesIncome = N(summary.feesIncome);
  const invIncome = N(summary.invIncome);
  const invRefunds = N(summary.invRefunds);
  const totalIncome = N(summary.totalIncome);
  const totalExpenses = N(summary.totalExpenses);
  const net = Number(summary.net ?? (N(summary.totalIncome) - N(summary.totalExpenses)));

  const studentsCount = N(summary.studentsCount);
  const studentPresentDays = N(summary.studentPresentDays);
  const teacherPresentDays = N(summary.teacherPresentDays);

  const termName = summary.termName || "Term";
  const termId = summary.termId || "—";
  const startAt = Format.date(summary.startAt);
  const todayStr = new Date().toLocaleString("en-GB");

  const netLabel = net >= 0 ? "Net surplus" : "Net deficit";

  // KPI tiles
  const kpis = [
    { label: "Fees income", value: Format.money(feesIncome), tone: "" },
    { label: "Inventory income (paid)", value: Format.money(invIncome), tone: "" },
    { label: "Inventory refunds", value: `– ${Format.money(invRefunds)}`, tone: "danger" },
    { label: "Total income", value: Format.money(totalIncome), tone: "" },
    { label: "Total expenses", value: Format.money(totalExpenses), tone: "danger" },
    { label: netLabel, value: Format.money(Math.abs(net)), tone: net >= 0 ? "success" : "danger" },
  ];

  const kpiCardsHTML = kpis.map(
    (k) => `
      <div class="card kpi">
        <div class="kpi-accent"></div>
        <div class="kpi-label">${String(k.label).toUpperCase()}</div>
        <div class="kpi-value ${k.tone ? `text-${k.tone}` : ""}">${k.value}</div>
      </div>`
  ).join("");

  const verdict = net >= 0 ? "surplus" : "deficit";
  const tone = net >= 0 ? "positive" : "negative";
  const highlights = [
    `The term closed with a ${tone} ${verdict} of ${Format.money(Math.abs(net))}.`,
    `Income reached ${Format.money(totalIncome)} (fees ${Format.money(feesIncome)} +`,
    `inventory ${Format.money(invIncome)} − refunds ${Format.money(invRefunds)}),`,
    `while expenses totaled ${Format.money(totalExpenses)}.`,
    `Attendance: students logged ${Format.number(studentPresentDays)} present days;`,
    `teachers logged ${Format.number(teacherPresentDays)}.`,
  ].join(" ");

  const tableRows = [
    ["Students (master list)", Format.number(studentsCount)],
    ["Fees Income", Format.money(feesIncome)],
    ["Inventory Income (paid)", Format.money(invIncome)],
    ["Inventory Refunds", `– ${Format.money(invRefunds)}`],
    ["Total Income", Format.money(totalIncome)],
    ["Total Expenses", Format.money(totalExpenses)],
  ].map(([l, v], i) => `
      <tr class="${i % 2 ? "zebra" : ""}">
        <td class="muted">${l}</td>
        <td class="text-right">${v}</td>
      </tr>`
  ).join("");

  const logoHTML = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="Logo" class="logo-img" />`
    : `<div class="logo-fallback">LOGO</div>`;

  // Optional sparkline
  let trendHTML = "";
  const trend = Array.isArray(summary.studentAttendanceTrend) ? summary.studentAttendanceTrend : [];
  if (trend.length >= 2) {
    const w = 280, h = 80, pad = 6;
    const min = Math.min(...trend), max = Math.max(...trend), span = max - min || 1;
    const step = (w - pad * 2) / (trend.length - 1);
    const points = trend.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${x},${y}`;
    }).join(" ");
    const dots = trend.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `<circle cx="${x}" cy="${y}" r="2" fill="var(--brand)" />`;
    }).join("");

    trendHTML = `
      <div class="card" style="padding:12px">
        <div class="section-title small">Student attendance (trend)</div>
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
          <polyline points="${points}" stroke="var(--brand)" stroke-width="2" fill="none" />
          ${dots}
        </svg>
        <div class="muted text-right" style="font-size:12px">Last ${trend.length} periods</div>
      </div>`;
  }

  // NOTE: page wrapper (#page) is what we scale to fit A4.
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.schoolName} – Term Snapshot (${termName})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- Inter for body (clean sans), Poppins for small section labels -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
  <style>
    /* ===== Page & print setup ===== */
    @page { size: A4; margin: 12mm; }

    :root{
      --ink:#0f172a; --muted:#6b7280; --line:#e5e7eb; --card:#f8fafc; --white:#fff;
      --brand:#1994ff; --brandDark:#0c6ad0; --success:#0ea5a3; --danger:#ef4444;
      --pageW: 186mm; /* A4 width (210mm) - 12mm*2 margin */
      --scale: 1;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      background:
        radial-gradient(1200px 800px at 10% -10%, #e8f3ff 0%, transparent 60%),
        radial-gradient(1200px 800px at 110% -20%, #f2f0ff 0%, transparent 60%),
        #ffffff;
      padding: 12mm; /* mirror @page for on-screen view */
    }

    /* Wrapper we scale to fit */
    #page {
      width: var(--pageW);
      transform-origin: top left;
      background: linear-gradient(180deg, #ffffff 0%, #fafcff 100%);
      border-radius: 14px;
      box-shadow: 0 6px 36px rgba(15, 23, 42, 0.08);
      padding: 16px;
    }

    header.band {
      background: linear-gradient(135deg, var(--brand) 0%, var(--brandDark) 100%);
      color: #fff; border-radius: 12px; padding: 16px;
      display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .logo-box { width: 64px; height: 64px; border-radius: 12px; background: var(--white);
      display:flex; align-items:center; justify-content:center; box-shadow: 0 1px 0 rgba(0,0,0,.05) inset; }
    .logo-img { width: 56px; height: 56px; object-fit: contain; }
    .logo-fallback { width:56px;height:56px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#eef2f7;color:#94a3b8;font-weight:800; }

    .title-area { display:flex; flex-direction:column; }
    .h1 { font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; /* strictly sans-serif */
          font-weight: 800; font-size: 22px; letter-spacing: .2px; margin: 0 0 4px; }
    .subtitle { font-size: 13px; opacity: .95; }

    .pill { display:inline-flex; background: #ffffff1a; color:#fff; border:1px solid #ffffff33;
      border-radius: 999px; padding:6px 10px; font-weight:600; font-size:12px; backdrop-filter: blur(4px); }
    .pill-wrap { display:flex; gap:8px; flex-wrap:wrap; justify-self:end; }

    .section { break-inside: avoid; margin: 16px 0; }
    .section-title { font-family: Poppins, Inter, sans-serif; font-weight: 700; font-size: 13px; color: var(--ink); }
    .section-rule { width: 110px; height: 3px; background: var(--brand); border-radius: 2px; margin: 6px 0 12px; }

    .grid-kpi { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
    @media (max-width: 900px) { .grid-kpi { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 560px) { .grid-kpi { grid-template-columns: 1fr; } }

    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; box-shadow: 0 2px 0 rgba(0,0,0,.02) inset; }
    .kpi { position: relative; padding-left: 16px; }
    .kpi-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--brand); border-radius: 12px 0 0 12px; }
    .kpi-label { color: var(--muted); font-weight: 700; font-size: 11px; letter-spacing: .3px; }
    .kpi-value { font-weight: 800; font-size: 20px; margin-top: 6px; }
    .text-success { color: var(--success); }
    .text-danger { color: var(--danger); }

    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 880px){ .two-col{ grid-template-columns: 1fr; } }

    .muted { color: var(--muted); }
    .text-right { text-align: right; }
    table { width:100%; border-collapse: collapse; }
    th, td { border: 1px solid var(--line); padding: 8px 10px; font-size: 12px; }
    thead th { background: #f9fafb; text-align: left; color:#475569; }
    tr.zebra td { background: #f7fbff; }

    .footer { margin-top: 16px; display:flex; justify-content:space-between; color:var(--muted); font-size:12px; }

    /* Print behavior */
    @media print {
      body { margin: 0; background: #fff; }
      #page { box-shadow: none; }
      .pill { border-color: #ffffff22; background: #ffffff22; }
      .card { break-inside: avoid; }
      header.band { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    /* Optional: if scaling would drop below 85%, we don't scale; allow multi-page */
    html.multi #page { transform: none !important; }
  </style>
</head>
<body>
  <div id="page">
    <header class="band">
      <div class="logo-box">${logoHTML}</div>
      <div class="title-area">
        <div class="h1">${opts.schoolName}</div>
        <div class="subtitle">Term Snapshot</div>
      </div>
      <div class="pill-wrap">
        <span class="pill">Term: ${termName}</span>
        <span class="pill">ID: ${termId}</span>
        <span class="pill">Start: ${startAt}</span>
      </div>
    </header>

    <section class="section">
      <div class="section-title">Executive Summary</div>
      <div class="section-rule"></div>
      <div class="grid-kpi">${kpiCardsHTML}</div>
    </section>

    <section class="section two-col">
      <div>
        <div class="section-title">Highlights</div>
        <div class="section-rule"></div>
        <p class="muted" style="line-height:1.55">${highlights}</p>
        ${trendHTML}
      </div>
      <div>
        <div class="section-title">Summary Breakdown</div>
        <div class="section-rule" style="width:100px"></div>
        <div class="card" style="padding:0">
          <table>
            <thead><tr><th>Item</th><th>Value</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">Sign-off</div>
      <div class="section-rule"></div>
      <div class="two-col">
        <div class="card">
          <div style="font-weight:700">Prepared by</div>
          <div class="muted" style="margin-top:8px">${opts.preparedBy}</div>
          <div style="margin-top:18px">Signature: __________________________</div>
          <div style="margin-top:10px">Date: ${Format.date(new Date())}</div>
        </div>
        <div class="card">
          <div style="font-weight:700">Approved by</div>
          <div class="muted" style="margin-top:8px">${opts.approvedBy}</div>
          <div style="margin-top:18px">Signature: __________________________</div>
          <div style="margin-top:10px">Date: ${Format.date(new Date())}</div>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div>${opts.schoolName} • Term Snapshot • Generated ${todayStr}</div>
      <div class="muted">Confidential</div>
    </footer>
  </div>

  <script>
    // Auto-fit #page to ONE printed page if possible (min scale 0.85).
    (function () {
      const MIN_SCALE = 0.85;           // don't go smaller; if needed, allow multi-page
      const PAGE_H_MM = 297, M_TOP = 12, M_BOTTOM = 12;

      function mmToPx(mm) {
        const d = document.createElement('div');
        d.style.height = '1mm';
        d.style.width  = '1mm';
        d.style.position = 'absolute';
        d.style.visibility = 'hidden';
        document.body.appendChild(d);
        const px = d.getBoundingClientRect().height;
        d.remove();
        return px * mm;
      }

      function fit() {
        const page = document.getElementById('page');
        if (!page) return;
        page.style.transform = ''; // reset
        const available = mmToPx(PAGE_H_MM - M_TOP - M_BOTTOM);
        const full = page.scrollHeight;
        let scale = Math.min(1, (available / full) * 0.99);
        if (scale < MIN_SCALE) {
          document.documentElement.classList.add('multi'); // allow natural page breaks
          page.style.transform = '';
          return;
        }
        document.documentElement.classList.remove('multi');
        page.style.transform = 'scale(' + scale + ')';
      }

      window.addEventListener('resize', fit);
      document.addEventListener('DOMContentLoaded', fit);

      // When parent dispatches a custom event (from iframe path), fit then print.
      window.addEventListener('trigger-print', () => {
        fit();
        if (${opts.autoPrint ? 'true' : 'false'}) {
          setTimeout(() => window.print(), 60);
        }
      });

      // If we want auto-print without parent event (e.g., open in new tab with autoPrint)
      if (${opts.autoPrint ? 'true' : 'false'}) {
        window.addEventListener('load', () => {
          fit();
          setTimeout(() => window.print(), 100);
        });
      }
    })();
  </script>
</body>
</html>`;
}

/** ===== Print via hidden iframe (popup-safe) ===== */
export function printTermReport(summary = {}, options = {}) {
  // Let the inner page handle fit + print when it receives 'trigger-print'
  const html = generateTermReportHTML(summary, { ...options, autoPrint: true });

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1500);
  };

  iframe.onload = () => {
    try {
      // Tell the inner doc to fit+print (it listens for this)
      iframe.contentWindow?.dispatchEvent(new Event("trigger-print"));
    } catch {}
    // Best-effort cleanup after a bit
    setTimeout(cleanup, 7000);
  };

  // Use srcdoc (reliable w/ blockers, avoids about:blank navigation)
  iframe.srcdoc = html;
}

/** ===== Optional: open in a new tab (may be blocked by extensions) ===== */
export function openTermReport(summary = {}, options = {}) {
  const html = generateTermReportHTML(summary, options);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return win;
}

/** ===== Back-compat alias ===== */
export const generateTermPdf = (summary, options) => printTermReport(summary, options);

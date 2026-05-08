const state = {
  summary: null,
  datasets: {},
  activeTab: "overview",
  page: 1,
  pageSize: 45,
};

const DATASETS = {
  old: { file: "old_items.json", title: "كل 2024", eyebrow: "الملف المنظف والمصنف لعام 2024" },
  current: { file: "current_items.json", title: "كل مواقع 2026 المصنفة", eyebrow: "الملف المنظف والمصنف لعام 2026" },
  new: { file: "new_items.json", title: "الجديد في 2026", eyebrow: "موجود في 2026 ولم يكن في 2024" },
  deleted: { file: "deleted_items.json", title: "لم يظهر في 2026", eyebrow: "كان موجوداً في 2024 ولم يظهر في 2026" },
  changed: { file: "changed_items.json", title: "التغييرات", eyebrow: "مواقع موجودة في السنتين وتغيّرت بياناتها" },
  stable: { file: "stable_items.json", title: "المستمر", eyebrow: "مواقع مستمرة بدون تغييرات مهمة" },
};

const STATUS_LABEL = {
  current: "2026",
  old: "2024",
  new: "جديد",
  deleted: "لم يظهر",
  changed: "تغيّر",
  stable: "مستمر",
};

const RIYADH_BOUNDS = { south: 24.48, north: 25.02, west: 46.42, east: 47.08 };
const CATEGORY_COLORS = {
  "قهوة": "#0f766e",
  "محمصة": "#7c3aed",
  "قهوة ومحمصة": "#2563eb",
  "بيكري": "#b7791f",
  "شاهي": "#65a30d",
  "عربة شاهي": "#16a34a",
  "دونات": "#db2777",
  "شوكولاتة": "#7c2d12",
  "حلا": "#ea580c",
};

const nf = new Intl.NumberFormat("ar-SA");

function n(value) {
  return value === null || value === undefined || Number.isNaN(value) ? "غير متوفر" : nf.format(value);
}

function rate(value) {
  return value === null || value === undefined || Number.isNaN(value) ? "غير متوفر" : Number(value).toFixed(1);
}

async function loadData() {
  const entries = await Promise.all([
    fetch("./data/summary.json").then((r) => r.json()),
    ...Object.entries(DATASETS).map(([key, meta]) => fetch(`./data/${meta.file}`).then((r) => r.json()).then((data) => [key, data])),
  ]);
  state.summary = entries[0];
  state.datasets = Object.fromEntries(entries.slice(1));
}

function renderOverview() {
  const c = state.summary.counts;
  document.getElementById("sourceNote").textContent = state.summary.sourceLabel || "ملفات القهوة المصنفة والمنظفة 2024 و2026";
  document.getElementById("metrics").innerHTML = [
    metric("إجمالي 2024", n(c.old2024), "بعد التنظيف والتصنيف"),
    metric("إجمالي 2026", n(c.current2026), "بعد التنظيف والتصنيف"),
    metric("النمو الصافي", n(c.netGrowth), `${c.growthPct}%`),
    metric("جديد 2026", n(c.new2026), "حسب ملف new_items"),
    metric("لم يظهر", n(c.deletedSince2024), "حسب ملف deleted_items"),
    metric("تغيّر", n(c.changed), "حسب ملف Changes"),
  ].join("");

  renderInsights();
  renderGrowthSummary();
  renderSharePanel();
  document.getElementById("categoryComparison").innerHTML = state.summary.categoryComparison.map(categoryCard).join("");
  document.getElementById("categoryAnalysis").innerHTML = categoryAnalysisTable();
  document.getElementById("districtAnalysis").innerHTML = districtAnalysisTable();
  renderBars("cat2026", state.summary.categoryCounts2026);
  renderBars("districts2026", state.summary.topDistricts2026);
  renderBars("brands2026", state.summary.topBrands2026);
  renderBars("rules2026", state.summary.matchedRules2026);
}

function metric(label, value, note) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function categoryCard(row) {
  return `<article class="cat-card">
    <h4>${escapeHtml(row.category)}</h4>
    <div><span>2024</span><strong>${n(row.old2024)}</strong></div>
    <div><span>2026</span><strong>${n(row.current2026)}</strong></div>
    <div><span>جديد</span><strong>${n(row.new2026)}</strong></div>
    <div><span>لم يظهر</span><strong>${n(row.deleted)}</strong></div>
  </article>`;
}

function renderBars(id, rows) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  document.getElementById(id).innerHTML = rows.map((r) => {
    const width = Math.max(4, Math.round((r.value / max) * 100));
    return `<div class="bar-row"><span class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</span><span class="bar-track"><i class="bar-fill" style="width:${width}%"></i></span><strong>${n(r.value)}</strong></div>`;
  }).join("");
}

function categoryStats() {
  const total2026 = state.summary.counts.current2026 || 1;
  return state.summary.categoryComparison.map((row) => {
    const net = row.current2026 - row.old2024;
    const growthPct = row.old2024 ? (net / row.old2024) * 100 : 0;
    const share = (row.current2026 / total2026) * 100;
    const churn = row.current2026 ? ((row.new2026 + row.deleted) / row.current2026) * 100 : 0;
    return { ...row, net, growthPct, share, churn };
  });
}

function renderInsights() {
  const stats = categoryStats();
  const c = state.summary.counts;
  const topShare = [...stats].sort((a, b) => b.share - a.share)[0];
  const topNet = [...stats].sort((a, b) => b.net - a.net)[0];
  const topGrowth = [...stats].filter((s) => s.old2024 >= 50).sort((a, b) => b.growthPct - a.growthPct)[0];
  const deletedRate = c.old2024 ? (c.deletedSince2024 / c.old2024) * 100 : 0;
  document.getElementById("insights").innerHTML = [
    insight("حجم السوق المصنف", n(c.current2026), `وصلت الدراسة إلى ${n(c.current2026)} موقع في 2026 بعد التصنيف والتنظيف.`),
    insight("أكبر حصة", topShare?.category || "-", `${topShare?.category || "-"} يمثل ${pct(topShare?.share || 0)} من إجمالي 2026.`),
    insight("أعلى نمو صافي", topNet?.category || "-", `زاد بمقدار ${signed(topNet?.net || 0)} موقع مقارنة بـ 2024.`),
    insight("معدل الاختفاء", pct(deletedRate), `${n(c.deletedSince2024)} موقع من 2024 لم يظهر في 2026.`),
  ].join("");
}

function insight(title, value, body) {
  return `<article class="insight-card"><span class="value">${escapeHtml(value)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></article>`;
}

function renderGrowthSummary() {
  const stats = categoryStats();
  const rows = [
    ["أكبر صافي نمو", [...stats].sort((a, b) => b.net - a.net)[0]],
    ["أكبر إضافة جديدة", [...stats].sort((a, b) => b.new2026 - a.new2026)[0]],
    ["أكثر اختفاء", [...stats].sort((a, b) => b.deleted - a.deleted)[0]],
    ["أعلى نمو نسبي", [...stats].filter((s) => s.old2024 >= 50).sort((a, b) => b.growthPct - a.growthPct)[0]],
  ];
  document.getElementById("growthSummary").innerHTML = rows.map(([label, row]) => `
    <div class="summary-item">
      <div><span>${escapeHtml(label)}</span><small>${escapeHtml(row?.category || "-")}</small></div>
      <strong>${label.includes("نسبي") ? pct(row?.growthPct || 0) : n(label.includes("اختفاء") ? row?.deleted : label.includes("إضافة") ? row?.new2026 : row?.net)}</strong>
    </div>
  `).join("");
}

function renderSharePanel() {
  const stats = categoryStats().filter((s) => s.current2026 > 0).sort((a, b) => b.current2026 - a.current2026);
  const total = state.summary.counts.current2026 || 1;
  const stack = stats.map((s) => `<span class="share-segment" title="${escapeHtml(s.category)} ${pct(s.share)}" style="width:${s.share}%;background:${CATEGORY_COLORS[s.category] || "#64748b"}"></span>`).join("");
  const legend = stats.slice(0, 8).map((s) => `<span><b><i style="background:${CATEGORY_COLORS[s.category] || "#64748b"}"></i>${escapeHtml(s.category)}</b><strong>${pct((s.current2026 / total) * 100)}</strong></span>`).join("");
  document.getElementById("shareDonut").innerHTML = `<div class="share-stack">${stack}</div><div class="share-legend">${legend}</div>`;
}

function categoryAnalysisTable() {
  const rows = categoryStats().sort((a, b) => b.current2026 - a.current2026);
  return `<table class="analysis-table">
    <thead><tr><th>التصنيف</th><th>2024</th><th>2026</th><th>الصافي</th><th>النمو</th><th>جديد</th><th>لم يظهر</th><th>الحصة</th></tr></thead>
    <tbody>${rows.map((r) => {
      const cls = r.net > 0 ? "trend-up" : r.net < 0 ? "trend-down" : "trend-flat";
      return `<tr>
        <td><span class="badge">${escapeHtml(r.category)}</span></td>
        <td>${n(r.old2024)}</td>
        <td>${n(r.current2026)}</td>
        <td class="${cls}">${signed(r.net)}</td>
        <td>${pct(r.growthPct)}</td>
        <td>${n(r.new2026)}</td>
        <td>${n(r.deleted)}</td>
        <td>${pct(r.share)}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function districtAnalysisTable() {
  const rows = state.summary.neighborhoodComparison || [];
  const coverage = state.summary.districtExtractionCoverage || {};
  const oldCoverage = coverage.old2024?.coveragePct ?? 0;
  const currentCoverage = coverage.current2026?.coveragePct ?? 0;
  if (!rows.length) return `<p class="empty">لا توجد بيانات أحياء كافية للعرض.</p>`;
  return `<div class="table-note">تغطية استخراج الحي: 2024 = ${pct(oldCoverage)}، 2026 = ${pct(currentCoverage)}. الأرقام تعتمد على الاسم المستخرج من العنوان وقد تحتاج مراجعة لبعض الأحياء.</div>
  <table class="analysis-table district-table">
    <thead><tr><th>الحي</th><th>2024</th><th>2026</th><th>الصافي</th><th>النمو</th><th>جديد</th><th>لم يظهر</th><th>حصة 2026</th></tr></thead>
    <tbody>${rows.map((r) => {
      const cls = r.net > 0 ? "trend-up" : r.net < 0 ? "trend-down" : "trend-flat";
      return `<tr>
        <td><strong>${escapeHtml(r.district)}</strong></td>
        <td>${n(r.old2024)}</td>
        <td>${n(r.current2026)}</td>
        <td class="${cls}">${signed(r.net)}</td>
        <td>${r.growthPct === null || r.growthPct === undefined ? "جديد" : pct(r.growthPct)}</td>
        <td>${n(r.new2026)}</td>
        <td>${n(r.deleted)}</td>
        <td>${pct(r.share2026)}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function signed(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${n(value)}`;
}

function switchTab(tab) {
  state.activeTab = tab;
  state.page = 1;
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.getElementById("overview").classList.toggle("active", tab === "overview");
  document.getElementById("mapView").classList.toggle("active", tab === "map");
  document.getElementById("tableView").classList.toggle("active", tab !== "overview" && tab !== "map");
  if (tab === "map") {
    initMapFilters();
    renderMap();
  } else if (tab !== "overview") {
    document.getElementById("tableTitle").textContent = DATASETS[tab].title;
    document.getElementById("tableEyebrow").textContent = DATASETS[tab].eyebrow;
    resetFilters();
    renderTable();
  }
}

function initMapFilters() {
  const dataset = document.getElementById("mapDataset").value || "current";
  const rows = state.datasets[dataset] || [];
  fillSelect("mapCategory", [...new Set(rows.map((r) => r.category || "غير مصنف"))].sort(), "كل التصنيفات");
}

function activeRows() {
  return state.datasets[state.activeTab] || [];
}

function resetFilters() {
  const rows = activeRows();
  fillSelect("categoryFilter", [...new Set(rows.map((r) => r.category || "غير مصنف"))].sort(), "كل التصنيفات");
  fillSelect("typeFilter", [...new Set(rows.map((r) => r.type || "غير محدد"))].sort(), "كل الأنواع");
  document.getElementById("searchInput").value = "";
}

function fillSelect(id, values, allLabel) {
  document.getElementById(id).innerHTML = [`<option value="all">${allLabel}</option>`, ...values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)].join("");
}

function filteredRows() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const cat = document.getElementById("categoryFilter").value;
  const type = document.getElementById("typeFilter").value;
  const sort = document.getElementById("sortSelect").value;
  const rows = activeRows().filter((r) => {
    const hay = [r.name, r.category, r.type, r.district, r.location, r.owner, r.matchedRule, r.changeText].filter(Boolean).join(" ").toLowerCase();
    return (!q || hay.includes(q)) && (cat === "all" || r.category === cat) && (type === "all" || r.type === type);
  });
  rows.sort((a, b) => {
    if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "ar");
    if (sort === "category") return String(a.category || "").localeCompare(String(b.category || ""), "ar");
    if (sort === "photos") return (b.photoCount ?? -1) - (a.photoCount ?? -1);
    return (b.reviews ?? -1) - (a.reviews ?? -1);
  });
  return rows;
}

function renderTable() {
  const rows = filteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);
  document.getElementById("resultCount").textContent = `${n(rows.length)} نتيجة`;
  document.getElementById("pageInfo").textContent = `صفحة ${n(state.page)} من ${n(pages)}`;
  document.getElementById("prevPage").disabled = state.page <= 1;
  document.getElementById("nextPage").disabled = state.page >= pages;
  document.getElementById("tableWrap").innerHTML = `<table>
    <thead><tr><th>الحالة</th><th>الاسم</th><th>التصنيف</th><th>Google Type</th><th>الحي/العنوان</th><th>المراجعات</th><th>القاعدة</th><th>إجراءات</th></tr></thead>
    <tbody>${pageRows.map(rowHtml).join("")}</tbody>
  </table>`;
  document.querySelectorAll("[data-detail]").forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.detail)));
}

function rowHtml(r) {
  const statusClass = r.status === "new" ? "status-new" : r.status === "deleted" ? "status-deleted" : r.status === "changed" ? "status-changed" : "";
  return `<tr>
    <td><span class="badge ${statusClass}">${STATUS_LABEL[r.status] || r.status}</span></td>
    <td class="name"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.owner || "")}</small></td>
    <td><span class="badge">${escapeHtml(r.category || "غير مصنف")}</span></td>
    <td>${escapeHtml(r.type || "غير محدد")}</td>
    <td>${escapeHtml(r.district || "غير محدد")}<br><small>${escapeHtml(r.location || "")}</small></td>
    <td>${n(r.reviews)}</td>
    <td>${escapeHtml(r.matchedRule || r.changeText || "")}</td>
    <td><div class="actions"><button data-detail="${escapeHtml(r.id)}">تفاصيل</button>${r.mapUrl ? `<a href="${escapeHtml(r.mapUrl)}" target="_blank" rel="noreferrer">الخريطة</a>` : ""}</div></td>
  </tr>`;
}

function openDetail(id) {
  const r = activeRows().find((item) => item.id === id);
  if (!r) return;
  document.getElementById("detailsBody").innerHTML = `<h2>${escapeHtml(r.name)}</h2>
    <div class="detail-grid">
      ${detail("التصنيف", r.category)}
      ${detail("Google Type", r.type)}
      ${detail("الحالة", STATUS_LABEL[r.status] || r.status)}
      ${detail("المراجعات", n(r.reviews))}
      ${detail("التقييم", rate(r.rate))}
      ${detail("الحي", r.district)}
      ${detail("الهاتف", r.phone)}
      ${detail("المالك", r.owner)}
      ${detail("قاعدة التصنيف", r.matchedRule)}
      ${detail("التغييرات", r.changeText)}
      ${detail("العنوان", r.location)}
      ${detail("الإحداثيات", r.lat && r.lng ? `${r.lat}, ${r.lng}` : "غير متوفر")}
    </div>`;
  document.getElementById("details").showModal();
}

function detail(label, value) {
  return `<div class="detail-item"><span>${label}</span><strong>${escapeHtml(value || "غير متوفر")}</strong></div>`;
}

function bind() {
  document.querySelectorAll(".nav").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  ["searchInput", "categoryFilter", "typeFilter", "sortSelect"].forEach((id) => document.getElementById(id).addEventListener("input", () => { state.page = 1; renderTable(); }));
  document.getElementById("mapDataset").addEventListener("input", () => { initMapFilters(); renderMap(); });
  document.getElementById("mapCategory").addEventListener("input", renderMap);
  document.getElementById("mapMode").addEventListener("input", renderMap);
  document.getElementById("prevPage").addEventListener("click", () => { state.page -= 1; renderTable(); });
  document.getElementById("nextPage").addEventListener("click", () => { state.page += 1; renderTable(); });
  document.getElementById("closeDialog").addEventListener("click", () => document.getElementById("details").close());
}

function renderMap() {
  const dataset = document.getElementById("mapDataset").value || "current";
  const category = document.getElementById("mapCategory").value || "all";
  const mode = document.getElementById("mapMode").value || "clusters";
  const rows = (state.datasets[dataset] || []).filter((r) => {
    const hasCoords = typeof r.lat === "number" && typeof r.lng === "number";
    const inBounds = hasCoords && r.lat >= RIYADH_BOUNDS.south && r.lat <= RIYADH_BOUNDS.north && r.lng >= RIYADH_BOUNDS.west && r.lng <= RIYADH_BOUNDS.east;
    return inBounds && (category === "all" || r.category === category);
  });
  const totalText = `${n(rows.length)} نقطة داخل نطاق الرياض`;
  const w = 1200, h = 650, pad = 48;
  const project = (lat, lng) => {
    const x = pad + ((lng - RIYADH_BOUNDS.west) / (RIYADH_BOUNDS.east - RIYADH_BOUNDS.west)) * (w - pad * 2);
    const y = h - pad - ((lat - RIYADH_BOUNDS.south) / (RIYADH_BOUNDS.north - RIYADH_BOUNDS.south)) * (h - pad * 2);
    return [x, y];
  };
  const road = (coords, cls = "") => `<polyline class="map-road ${cls}" points="${coords.map(([lat,lng]) => project(lat,lng).map((v) => v.toFixed(1)).join(",")).join(" ")}" />`;
  const marks = mode === "points" ? renderMapPoints(rows, project) : renderMapClusters(rows, project, category);
  document.getElementById("mapCanvas").innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="خريطة تحليلية لنقاط الرياض">
    <ellipse class="map-area" cx="${w * .52}" cy="${h * .5}" rx="${w * .36}" ry="${h * .35}" />
    ${road([[24.98,46.58],[24.86,46.63],[24.72,46.68],[24.56,46.74]])}
    ${road([[24.85,46.44],[24.76,46.56],[24.67,46.76],[24.58,47.03]])}
    ${road([[24.5,46.59],[24.64,46.65],[24.82,46.83],[25.0,46.96]], "secondary")}
    ${road([[24.92,46.78],[24.77,46.82],[24.62,46.86],[24.5,46.91]], "secondary")}
    <text class="map-label" x="${w * .5}" y="${h * .22}">شمال الرياض</text>
    <text class="map-label" x="${w * .47}" y="${h * .51}">وسط الرياض</text>
    <text class="map-label" x="${w * .78}" y="${h * .54}">شرق الرياض</text>
    <text class="map-label" x="${w * .2}" y="${h * .58}">غرب الرياض</text>
    <text class="map-label" x="${w * .5}" y="${h * .86}">جنوب الرياض</text>
    <text class="map-note" x="${w - 36}" y="42">${escapeHtml(totalText)}</text>
    ${marks}
  </svg>`;
  const cats = [...new Set(rows.map((r) => r.category || "غير مصنف"))].sort();
  document.getElementById("mapLegend").innerHTML = cats.map((cat) => `<span><i style="background:${CATEGORY_COLORS[cat] || "#64748b"}"></i>${escapeHtml(cat)}</span>`).join("");
}

function renderMapPoints(rows, project) {
  return rows.map((r) => {
    const [x, y] = project(r.lat, r.lng);
    const color = CATEGORY_COLORS[r.category] || "#64748b";
    return `<circle class="map-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${color}"><title>${escapeHtml(r.name)} - ${escapeHtml(r.category)} - ${escapeHtml(r.type)}</title></circle>`;
  }).join("");
}

function renderMapClusters(rows, project, categoryFilter) {
  const clusters = buildSpatialClusters(rows, categoryFilter);
  const max = Math.max(...clusters.map((c) => c.count), 1);
  return clusters.map((cluster) => {
    const [x, y] = project(cluster.lat, cluster.lng);
    const radius = 16 + Math.sqrt(cluster.count / max) * 48;
    const font = radius > 42 ? 18 : 14;
    const color = cluster.color || CATEGORY_COLORS[cluster.category] || "#64748b";
    return `<g class="map-cluster">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}"></circle>
      <text x="${x.toFixed(1)}" y="${y.toFixed(1)}" style="font-size:${font}px">${formatCompact(cluster.count)}</text>
      <text class="cluster-caption" x="${x.toFixed(1)}" y="${(y + radius + 15).toFixed(1)}">${escapeHtml(cluster.category)}</text>
      <title>${escapeHtml(cluster.category)}: ${n(cluster.count)} موقع</title>
    </g>`;
  }).join("");
}

function buildSpatialClusters(rows, categoryFilter) {
  const splitByCategory = categoryFilter !== "all";
  const cols = 7;
  const rowsCount = 5;
  const groups = new Map();
  rows.forEach((item) => {
    const col = Math.min(cols - 1, Math.max(0, Math.floor(((item.lng - RIYADH_BOUNDS.west) / (RIYADH_BOUNDS.east - RIYADH_BOUNDS.west)) * cols)));
    const row = Math.min(rowsCount - 1, Math.max(0, Math.floor(((RIYADH_BOUNDS.north - item.lat) / (RIYADH_BOUNDS.north - RIYADH_BOUNDS.south)) * rowsCount)));
    const key = splitByCategory ? `${row}-${col}-${item.category}` : `${row}-${col}`;
    if (!groups.has(key)) {
      groups.set(key, { latSum: 0, lngSum: 0, count: 0, categories: new Map(), category: item.category || "غير مصنف" });
    }
    const group = groups.get(key);
    group.latSum += item.lat;
    group.lngSum += item.lng;
    group.count += 1;
    group.categories.set(item.category, (group.categories.get(item.category) || 0) + 1);
  });
  return [...groups.values()].map((group) => {
    const topCat = [...group.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || group.category;
    const mixed = group.categories.size > 1;
    return {
      lat: group.latSum / group.count,
      lng: group.lngSum / group.count,
      count: group.count,
      category: topCat,
      color: mixed && !splitByCategory ? "#0f766e" : CATEGORY_COLORS[topCat],
    };
  }).sort((a, b) => b.count - a.count).slice(0, 45);
}

function formatCompact(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

loadData().then(() => { bind(); renderOverview(); }).catch((error) => {
  document.body.innerHTML = `<main><section class="panel"><h2>تعذر تحميل البيانات</h2><p>${escapeHtml(error.message)}</p></section></main>`;
});

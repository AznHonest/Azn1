const state = {
  summary: null,
  datasets: {},
  activeTab: "overview",
  page: 1,
  pageSize: 40,
  mapStatus: "all",
  mapMode: "regions",
};

const DATASETS = {
  new: { file: "new_items.json", title: "العناصر الجديدة في 2026", eyebrow: "موجودة في 2026 ولم تكن في 2024" },
  deleted: { file: "deleted_items.json", title: "عناصر 2024 التي لم تظهر في 2026", eyebrow: "قد تكون مغلقة أو لم تُلتقط في السحب الجديد" },
  changed: { file: "changed_items.json", title: "العناصر التي تغيّرت", eyebrow: "موجودة في السنتين مع اختلافات في الحقول" },
  stable: { file: "stable_items.json", title: "العناصر المستمرة بدون تغييرات مهمة", eyebrow: "مطابقة حسب ملف المقارنة" },
};

const STATUS_LABELS = {
  new: "جديد",
  deleted: "لم يظهر",
  changed: "تغيّر",
  stable: "مستمر",
};

const RIYADH_VIEW_BOUNDS = {
  south: 24.48,
  north: 25.02,
  west: 46.42,
  east: 47.08,
};

const nf = new Intl.NumberFormat("ar-SA");

function formatNumber(value) {
  return value === null || value === undefined || Number.isNaN(value) ? "غير متوفر" : nf.format(value);
}

function formatRate(value) {
  return value === null || value === undefined || Number.isNaN(value) ? "غير متوفر" : Number(value).toFixed(1);
}

function pct(value) {
  return `${value}%`;
}

async function loadData() {
  const [summary, newItems, deletedItems, changedItems, stableItems] = await Promise.all([
    fetch("./data/summary.json").then((r) => r.json()),
    fetch("./data/new_items.json").then((r) => r.json()),
    fetch("./data/deleted_items.json").then((r) => r.json()),
    fetch("./data/changed_items.json").then((r) => r.json()),
    fetch("./data/stable_items.json").then((r) => r.json()),
  ]);
  state.summary = summary;
  state.datasets = {
    new: newItems,
    deleted: deletedItems,
    changed: changedItems,
    stable: stableItems,
  };
}

function metric(label, value, note) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${note || ""}</small></article>`;
}

function renderOverview() {
  const { counts, coverage } = state.summary;
  document.getElementById("sourceMeta").textContent = `تم التوليد من ملفات CSV بتاريخ ${new Date(state.summary.generatedAt).toLocaleString("ar-SA")}`;
  document.getElementById("metricGrid").innerHTML = [
    metric("إجمالي 2024", formatNumber(counts.oldTotal2024), "سجل في ملف يونيو 2024"),
    metric("إجمالي 2026", formatNumber(counts.currentTotal2026), "سجل في ملف مايو 2026"),
    metric("النمو الصافي", formatNumber(counts.netGrowth), `${pct(counts.growthPct)} مقارنة بملف 2024`),
    metric("جديد 2026", formatNumber(counts.newIn2026), "غير موجود في ملف 2024"),
    metric("لم يظهر في 2026", formatNumber(counts.deletedSince2024), "كان موجوداً في 2024"),
    metric("تغيّر", formatNumber(counts.changed), "له اختلاف واحد أو أكثر"),
  ].join("");

  const rateDrop = coverage.rate2024.pct - coverage.rate2026.pct;
  document.getElementById("insightList").innerHTML = [
    insight("نمو كبير في عدد السجلات", `ارتفع العدد من ${formatNumber(counts.oldTotal2024)} إلى ${formatNumber(counts.currentTotal2026)}، بصافي ${formatNumber(counts.netGrowth)} سجل.`),
    insight("جودة التقييمات تحتاج انتباه", `تغطية التقييم في 2024 كانت ${pct(coverage.rate2024.pct)}، بينما 2026 فقط ${pct(coverage.rate2026.pct)}. الفرق ${pct(Math.round(rateDrop * 10) / 10)} غالباً سببه طريقة السحب وليس السوق نفسه.`),
    insight("2026 أغنى بالحقول", "الملف الجديد يحتوي الحي، حالة العمل، المطالبة بالنشاط، عدد الصور، وروابط Google Place؛ هذه مفيدة للتصفح والتصفية أكثر من مقارنة التقييم فقط."),
    insight("التحقق مهم للمحذوفات", `${formatNumber(counts.verifyFailed)} سجلات فشل التحقق منها فقط، لكن المحذوفات عموماً قد تعني إغلاقاً أو تغيّر معرف Google أو عدم ظهور أثناء السحب.`),
  ].join("");

  renderBars("newDistrictsChart", state.summary.topNewDistricts, "var(--new)");
  renderBars("typesChart", state.summary.topTypes2026, "var(--accent)");
  renderBars("changesChart", state.summary.changeFields, "var(--changed)");
  renderMiniMap();
}

function insight(title, body) {
  return `<div class="insight"><strong>${title}</strong><span>${body}</span></div>`;
}

function renderBars(id, rows, color) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  document.getElementById(id).innerHTML = rows
    .map((row) => {
      const width = Math.max(5, Math.round((row.value / max) * 100));
      return `<div class="bar-row"><span class="bar-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span><span class="bar-track"><i class="bar-fill" style="width:${width}%;background:${color}"></i></span><strong>${formatNumber(row.value)}</strong></div>`;
    })
    .join("");
}

function renderMiniMap() {
  const allItems = [
    ...state.datasets.new,
    ...state.datasets.deleted,
    ...state.datasets.changed,
  ].filter((item) => item.lat && item.lng);
  const items = allItems.filter((item) => state.mapStatus === "all" || item.status === state.mapStatus);
  const focusItems = items.filter(isInsideRiyadhView);
  renderMapStats(items, focusItems);
  renderSvgMap(focusItems, state.mapMode);
}

function renderMapStats(items, focusItems) {
  const counts = focusItems.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );
  const outside = Math.max(0, items.length - focusItems.length);
  document.getElementById("mapStats").innerHTML = [
    `<span>النقاط داخل عرض الرياض: <strong>${formatNumber(focusItems.length)}</strong></span>`,
    `<span>جديد: <strong>${formatNumber(counts.new || 0)}</strong></span>`,
    `<span>لم يظهر: <strong>${formatNumber(counts.deleted || 0)}</strong></span>`,
    `<span>تغيّر: <strong>${formatNumber(counts.changed || 0)}</strong></span>`,
    outside ? `<span>خارج العرض الحالي: <strong>${formatNumber(outside)}</strong></span>` : "",
  ].join("");
}

function isInsideRiyadhView(item) {
  return (
    item.lat >= RIYADH_VIEW_BOUNDS.south &&
    item.lat <= RIYADH_VIEW_BOUNDS.north &&
    item.lng >= RIYADH_VIEW_BOUNDS.west &&
    item.lng <= RIYADH_VIEW_BOUNDS.east
  );
}

function statusColor(status) {
  if (status === "deleted") return "#d92d20";
  if (status === "changed") return "#f59e0b";
  return "#00856f";
}

function renderSvgMap(items, mode = "regions") {
  if (!items.length) {
    document.getElementById("miniMap").innerHTML = '<div class="empty-map">لا توجد نقاط داخل نطاق عرض الرياض لهذا الفلتر.</div>';
    return;
  }
  if (mode === "regions") {
    renderRegionBoard(items);
    return;
  }
  if (mode === "districts") {
    renderDistrictBoard(items);
    return;
  }
  renderPointMap(items);
}

function renderPointMap(items) {
  const pad = 54;
  const w = 1200;
  const h = 720;
  const project = (lat, lng) => {
    const x = pad + ((lng - RIYADH_VIEW_BOUNDS.west) / (RIYADH_VIEW_BOUNDS.east - RIYADH_VIEW_BOUNDS.west)) * (w - pad * 2);
    const y = h - pad - ((lat - RIYADH_VIEW_BOUNDS.south) / (RIYADH_VIEW_BOUNDS.north - RIYADH_VIEW_BOUNDS.south)) * (h - pad * 2);
    return [x, y];
  };
  const label = (text, lat, lng, cls = "") => {
    const [x, y] = project(lat, lng);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="map-label ${cls}">${text}</text>`;
  };
  const road = (coords, cls = "") =>
    `<polyline class="map-road ${cls}" points="${coords
      .map(([lat, lng]) => {
        const [x, y] = project(lat, lng);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ")}" />`;
  const marks = renderPointMarks(items, project);
  const roads = [
    road([[24.98, 46.58], [24.88, 46.63], [24.75, 46.68], [24.58, 46.74]], "main"),
    road([[24.85, 46.43], [24.77, 46.56], [24.68, 46.75], [24.58, 47.02]], "main"),
    road([[24.5, 46.58], [24.64, 46.64], [24.82, 46.82], [25.0, 46.95]], "secondary"),
    road([[24.92, 46.78], [24.77, 46.82], [24.62, 46.86], [24.5, 46.91]], "secondary"),
  ].join("");
  const labels = [
    label("شمال الرياض", 24.92, 46.71, "large"),
    label("وسط الرياض", 24.71, 46.68, "large"),
    label("شرق الرياض", 24.74, 46.95),
    label("غرب الرياض", 24.68, 46.49),
    label("جنوب الرياض", 24.55, 46.73),
  ].join("");
  document.getElementById("miniMap").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="خريطة تحليلية مكبرة للرياض">
      <rect class="map-bg" x="0" y="0" width="${w}" height="${h}" />
      <g class="map-grid">${gridLines(w, h, pad)}</g>
      <ellipse class="city-area" cx="${w * 0.52}" cy="${h * 0.48}" rx="${w * 0.34}" ry="${h * 0.34}" />
      ${roads}
      ${labels}
      <g>${marks}</g>
    </svg>`;
}

function renderPointMarks(items, project) {
  return items
    .map((item) => {
      const [x, y] = project(item.lat, item.lng);
      const radius = state.mapStatus === "all" ? 3.1 : 4.3;
      const type = item.type || item.type2026 || item.type2024 || "غير محدد";
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" class="map-point ${item.status}"><title>${escapeHtml(item.name)} - ${escapeHtml(type)} - ${escapeHtml(item.district || "غير محدد")}</title></circle>`;
    })
    .join("");
}

function renderRegionBoard(items) {
  const regions = [
    { key: "north", label: "شمال الرياض", hint: "النطاق الأعلى من المدينة", area: "wide" },
    { key: "west", label: "غرب الرياض", hint: "غرب وامتداد طويق", area: "west" },
    { key: "center", label: "وسط الرياض", hint: "المركز والمحاور المحيطة", area: "center" },
    { key: "east", label: "شرق الرياض", hint: "الشرق والشمال الشرقي", area: "east" },
    { key: "south", label: "جنوب الرياض", hint: "النطاق الجنوبي", area: "wide" },
  ];
  const groups = new Map(regions.map((region) => [region.key, { ...region, total: 0, statuses: { new: 0, deleted: 0, changed: 0 }, districts: new Map() }]));
  items.forEach((item) => {
    const group = groups.get(regionFor(item));
    group.total += 1;
    group.statuses[item.status] = (group.statuses[item.status] || 0) + 1;
    const district = cleanDistrict(item.district);
    group.districts.set(district, (group.districts.get(district) || 0) + 1);
  });
  const max = Math.max(...[...groups.values()].map((region) => region.total), 1);
  const cards = regions
    .map((region) => {
      const group = groups.get(region.key);
      const intensity = 0.18 + (group.total / max) * 0.58;
      const topDistricts = [...group.districts.entries()]
        .filter(([name]) => name !== "منطقة غير محددة")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, value]) => `<li><span>${escapeHtml(shortLabel(name))}</span><strong>${formatCompact(value)}</strong></li>`)
        .join("");
      return `
        <section class="region-card region-${region.key} area-${region.area}" style="--heat:${intensity.toFixed(2)}">
          <div class="region-copy">
            <h4>${region.label}</h4>
            <p>${region.hint}</p>
            <ul>${topDistricts || "<li><span>لا توجد أحياء واضحة</span><strong>0</strong></li>"}</ul>
          </div>
          <div class="region-total">${formatCompact(group.total)}</div>
          <div class="region-split">
            <span>جديد ${formatCompact(group.statuses.new || 0)}</span>
            <span>لم يظهر ${formatCompact(group.statuses.deleted || 0)}</span>
            <span>تغيّر ${formatCompact(group.statuses.changed || 0)}</span>
          </div>
        </section>`;
    })
    .join("");
  document.getElementById("miniMap").innerHTML = `<div class="region-board">${cards}</div>`;
}

function renderDistrictBoard(items) {
  const groups = buildDistrictGroups(items).slice(0, 36);
  const max = Math.max(...groups.map((group) => group.total), 1);
  const cards = groups
    .map((group, index) => {
      const fill = statusColor(dominantStatus(group));
      const scale = 0.2 + (group.total / max) * 0.55;
      return `
        <article class="district-card" style="--district-color:${fill};--district-alpha:${(scale + 0.28).toFixed(2)}">
          <div>
            <h4>${escapeHtml(shortLabel(group.label))}</h4>
            <p>ج ${formatCompact(group.statuses.new || 0)} · ح ${formatCompact(group.statuses.deleted || 0)} · ت ${formatCompact(group.statuses.changed || 0)}</p>
          </div>
          <strong>${formatCompact(group.total)}</strong>
        </article>`;
    })
    .join("");
  document.getElementById("miniMap").innerHTML = `
    <div class="district-board">
      <h4>أكثر الأحياء حسب العدد</h4>
      <div class="district-grid">${cards}</div>
    </div>`;
}

function buildDistrictGroups(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = cleanDistrict(item.district);
    if (!groups.has(key)) {
      groups.set(key, { label: key, latSum: 0, lngSum: 0, total: 0, statuses: { new: 0, deleted: 0, changed: 0 } });
    }
    const group = groups.get(key);
    group.latSum += item.lat;
    group.lngSum += item.lng;
    group.total += 1;
    group.statuses[item.status] = (group.statuses[item.status] || 0) + 1;
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      lat: group.latSum / group.total,
      lng: group.lngSum / group.total,
    }))
    .filter((group) => group.total > 0)
    .sort((a, b) => b.total - a.total)
    .filter((group) => group.label !== "منطقة غير محددة");
}

function cleanDistrict(value) {
  const text = String(value || "").trim();
  if (!text || text === "غير محدد" || text.toLowerCase() === "undefined") return "منطقة غير محددة";
  return text;
}

function regionFor(item) {
  if (item.lat >= 24.8) return "north";
  if (item.lat <= 24.62) return "south";
  if (item.lng <= 46.58) return "west";
  if (item.lng >= 46.82) return "east";
  return "center";
}

function dominantStatus(cluster) {
  const entries = Object.entries(cluster.statuses).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || "new";
}

function clusterTitle(cluster) {
  return `${cluster.label}: ${formatNumber(cluster.total)} | جديد ${formatNumber(cluster.statuses.new || 0)} | لم يظهر ${formatNumber(cluster.statuses.deleted || 0)} | تغيّر ${formatNumber(cluster.statuses.changed || 0)}`;
}

function shortLabel(label) {
  const text = String(label || "");
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

function formatCompact(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function gridLines(w, h, pad) {
  const lines = [];
  for (let x = pad; x <= w - pad; x += 90) {
    lines.push(`<line x1="${x}" y1="${pad}" x2="${x}" y2="${h - pad}" />`);
  }
  for (let y = pad; y <= h - pad; y += 90) {
    lines.push(`<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" />`);
  }
  return lines.join("");
}

function switchTab(tab) {
  state.activeTab = tab;
  state.page = 1;
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.getElementById("overviewView").classList.toggle("active", tab === "overview");
  document.getElementById("tableView").classList.toggle("active", tab !== "overview");
  if (tab !== "overview") {
    document.getElementById("tableTitle").textContent = DATASETS[tab].title;
    document.getElementById("tableEyebrow").textContent = DATASETS[tab].eyebrow;
    populateFilters();
    renderTable();
  }
}

function activeItems() {
  return state.datasets[state.activeTab] || [];
}

function searchable(item) {
  return [
    item.name,
    item.type,
    item.type2024,
    item.type2026,
    item.district,
    item.location,
    item.arLocation,
    item.businessStatus,
    item.changeSummary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filteredItems() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const type = document.getElementById("typeFilter").value;
  const district = document.getElementById("districtFilter").value;
  const sort = document.getElementById("sortSelect").value;
  const rows = activeItems().filter((item) => {
    const itemType = item.type || item.type2026 || item.type2024 || "غير محدد";
    const matchesSearch = !search || searchable(item).includes(search);
    const matchesType = type === "all" || itemType === type;
    const matchesDistrict = district === "all" || item.district === district;
    return matchesSearch && matchesType && matchesDistrict;
  });

  rows.sort((a, b) => {
    if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "ar");
    if (sort === "rate") return (b.rate ?? b.rate2026 ?? b.rate2024 ?? -1) - (a.rate ?? a.rate2026 ?? a.rate2024 ?? -1);
    if (sort === "photos") return (b.photoCount ?? -1) - (a.photoCount ?? -1);
    if (sort === "changes") return (b.changeCount ?? -1) - (a.changeCount ?? -1);
    return (b.reviews ?? b.reviews2026 ?? b.reviews2024 ?? -1) - (a.reviews ?? a.reviews2026 ?? a.reviews2024 ?? -1);
  });
  return rows;
}

function populateFilters() {
  const items = activeItems();
  const types = uniqueValues(items.map((item) => item.type || item.type2026 || item.type2024 || "غير محدد"));
  const districts = uniqueValues(items.map((item) => item.district || "غير محدد"));
  setOptions("typeFilter", types, "كل التصنيفات");
  setOptions("districtFilter", districts, "كل الأحياء");
  document.getElementById("searchInput").value = "";
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ar"));
}

function setOptions(id, values, allLabel) {
  document.getElementById(id).innerHTML = [`<option value="all">${allLabel}</option>`, ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)].join("");
}

function renderTable() {
  const rows = filteredItems();
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);

  document.getElementById("resultCount").textContent = `${formatNumber(rows.length)} نتيجة`;
  document.getElementById("pageInfo").textContent = `صفحة ${formatNumber(state.page)} من ${formatNumber(totalPages)}`;
  document.getElementById("prevPage").disabled = state.page === 1;
  document.getElementById("nextPage").disabled = state.page === totalPages;

  document.getElementById("tableWrap").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>الحالة</th>
          <th>الاسم</th>
          <th>التصنيف/الحي</th>
          <th>التقييم</th>
          <th>المراجعات</th>
          <th>حالة العمل</th>
          <th>إجراءات</th>
        </tr>
      </thead>
      <tbody>${pageRows.map(renderRow).join("")}</tbody>
    </table>
  `;

  document.querySelectorAll("[data-detail-id]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.detailId));
  });
}

function renderRow(item) {
  const status = item.status || state.activeTab;
  const type = item.type || item.type2026 || item.type2024 || "غير محدد";
  const rate = item.rate ?? item.rate2026 ?? item.rate2024;
  const reviews = item.reviews ?? item.reviews2026 ?? item.reviews2024;
  return `
    <tr>
      <td><span class="badge ${status}">${STATUS_LABELS[status] || status}</span></td>
      <td class="name-cell"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.location || item.arLocation || "")}</small></td>
      <td>${escapeHtml(type)}<br><small>${escapeHtml(item.district || "غير محدد")}</small></td>
      <td>${formatRate(rate)}</td>
      <td>${formatNumber(reviews)}</td>
      <td>${escapeHtml(item.businessStatus || "غير متوفر")}</td>
      <td>
        <div class="row-actions">
          <button data-detail-id="${escapeHtml(item.id)}">تفاصيل</button>
          ${item.mapUrl ? `<a href="${escapeHtml(item.mapUrl)}" target="_blank" rel="noreferrer">الخريطة</a>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function openDetail(id) {
  const item = activeItems().find((row) => row.id === id);
  if (!item) return;
  const dialog = document.getElementById("detailDialog");
  const changes = item.changes?.length
    ? `<h3>التغييرات</h3><div class="change-list">${item.changes.map(renderChange).join("")}</div>`
    : "";
  document.getElementById("detailBody").innerHTML = `
    <h2>${escapeHtml(item.name)}</h2>
    <div class="detail-grid">
      ${detail("الحالة", STATUS_LABELS[item.status] || item.status)}
      ${detail("التصنيف", item.type || item.type2026 || item.type2024 || "غير محدد")}
      ${detail("الحي", item.district || "غير محدد")}
      ${detail("التقييم", formatRate(item.rate ?? item.rate2026 ?? item.rate2024))}
      ${detail("مراجعات 2024", formatNumber(item.reviews2024))}
      ${detail("مراجعات 2026", formatNumber(item.reviews2026 ?? item.reviews))}
      ${detail("رقم الهاتف", item.phone || "غير متوفر")}
      ${detail("مطالب به", item.claimed || "غير متوفر")}
      ${detail("عدد الصور", formatNumber(item.photoCount))}
      ${detail("حالة العمل", item.businessStatus || "غير متوفر")}
      ${detail("العنوان", item.location || item.arLocation || "غير متوفر")}
      ${detail("الإحداثيات", item.lat && item.lng ? `${item.lat}, ${item.lng}` : "غير متوفر")}
    </div>
    ${changes}
  `;
  dialog.showModal();
}

function renderChange(change) {
  return `
    <div class="change-item">
      <strong>${escapeHtml(change.label)}</strong>
      <div class="change-values">
        <span>2024: ${escapeHtml(change.before || "غير متوفر")}</span>
        <span>2026: ${escapeHtml(change.after || "غير متوفر")}</span>
      </div>
    </div>
  `;
}

function detail(label, value) {
  return `<div class="detail-item"><span>${label}</span><strong>${escapeHtml(String(value ?? "غير متوفر"))}</strong></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function exportSummary() {
  const { counts, coverage } = state.summary;
  const text = [
    "ملخص مقارنة قهاوي الرياض 2024 / 2026",
    `إجمالي 2024: ${counts.oldTotal2024}`,
    `إجمالي 2026: ${counts.currentTotal2026}`,
    `النمو الصافي: ${counts.netGrowth} (${counts.growthPct}%)`,
    `جديد 2026: ${counts.newIn2026}`,
    `لم يظهر في 2026: ${counts.deletedSince2024}`,
    `تغيّر: ${counts.changed}`,
    `مستمر بدون تغيير: ${counts.stable}`,
    `تغطية التقييمات 2024: ${coverage.rate2024.pct}%`,
    `تغطية التقييمات 2026: ${coverage.rate2026.pct}%`,
  ].join("\n");
  navigator.clipboard?.writeText(text);
  alert("تم نسخ الملخص.");
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  document.querySelectorAll(".map-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.mapStatus = button.dataset.mapStatus;
      document.querySelectorAll(".map-filter").forEach((item) => item.classList.toggle("active", item === button));
      renderMiniMap();
    });
  });
  document.querySelectorAll(".map-mode").forEach((button) => {
    button.addEventListener("click", () => {
      state.mapMode = button.dataset.mapMode;
      document.querySelectorAll(".map-mode").forEach((item) => item.classList.toggle("active", item === button));
      renderMiniMap();
    });
  });
  ["searchInput", "typeFilter", "districtFilter", "sortSelect"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      state.page = 1;
      renderTable();
    });
  });
  document.getElementById("prevPage").addEventListener("click", () => {
    state.page -= 1;
    renderTable();
  });
  document.getElementById("nextPage").addEventListener("click", () => {
    state.page += 1;
    renderTable();
  });
  document.getElementById("dialogClose").addEventListener("click", () => document.getElementById("detailDialog").close());
  document.getElementById("exportSummary").addEventListener("click", exportSummary);
}

loadData()
  .then(() => {
    bindEvents();
    renderOverview();
  })
  .catch((error) => {
    document.body.innerHTML = `<main class="main"><section class="panel"><h2>تعذر تحميل البيانات</h2><p>${escapeHtml(error.message)}</p></section></main>`;
  });

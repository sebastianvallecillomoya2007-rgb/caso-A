"use strict";

const DEFAULTS = Object.freeze({
  normalPrice: 34,
  subscriptionPrice: 30.6,
  coffeeCost: 10.88,
  shippingCost: 4.5,
  paymentFee: 4.5,
  packagingCost: 1.2,
  packUnitCoffeeCost: 5.44,
  packPrice: 48,
  packBoxCost: 1.4,
  firstDiscount: 30,
  packAdoption: 0,
  adSpend: 8000,
  agencyFee: 1000,
  subscriberShare: 15,
  churnRate: 9,
  looseOrders12m: 3,
  firstMonthOrders: 1,
  initialCash: 35000,
  fixedCosts: 6500,
  minimumCash: 5000,
  existingContribution: 9000,
  existingDecay: 3,
  nonMetaCustomers: 47,
  altMonthlyInvestment: 4000
});

const ACQUISITION_HISTORY = Object.freeze([
  { spend: 0, customers: 0 },
  { spend: 4000, customers: 100 },
  { spend: 8000, customers: 165 },
  { spend: 12000, customers: 210 },
  { spend: 16000, customers: 235 },
  { spend: 20000, customers: 250 }
]);
const STORAGE_KEY = "tueste-dashboard-settings-v1";
const SIMULATION_MONTHS = 24;
const MONEY_FORMAT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const charts = {};
let settings = { ...DEFAULTS };
let savedStateTimer;
let lastSimulation = null;

function $(id) {
  return document.getElementById(id);
}

function showStatus(message, isError) {
  const status = $("savedState");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("status-error", Boolean(isError));
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
      if (typeof parsed[key] === "number" && Number.isFinite(parsed[key])) {
        settings[key] = parsed[key];
      } else {
        settings[key] = defaultValue;
      }
    }
  } catch (error) {
    console.error("No se pudieron leer los supuestos guardados.", error);
    showStatus("No se pudieron leer los datos guardados; se usan los originales.", true);
  }
}

function persistSettings() {
  clearTimeout(savedStateTimer);
  savedStateTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      showStatus("Configuración guardada localmente", false);
    } catch (error) {
      console.error("No se pudieron guardar los supuestos en LocalStorage.", error);
      showStatus("No se pudieron guardar los cambios en este navegador.", true);
    }
  }, 180);
}

function hydrateControls() {
  document.querySelectorAll("[data-control]").forEach((input) => {
    const key = input.dataset.control;
    input.value = String(settings[key]);
  });
  $("altMonthlyInvestment").value = String(settings.altMonthlyInvestment);
  updateAuxiliaryReadouts();
}

function boundedValue(input) {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  if (!Number.isFinite(value)) return null;
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  return Math.min(max, Math.max(min, value));
}

function bindControls() {
  document.querySelectorAll("[data-control]").forEach((input) => {
    input.addEventListener("input", () => applyControlChange(input, false));
    input.addEventListener("change", () => applyControlChange(input, true));
  });
  $("altMonthlyInvestment").addEventListener("input", (event) => applyControlChange(event.currentTarget, false, "altMonthlyInvestment"));
  $("altMonthlyInvestment").addEventListener("change", (event) => applyControlChange(event.currentTarget, true, "altMonthlyInvestment"));
  $("restoreButton").addEventListener("click", restoreDefaults);
  $("runSimulationButton").addEventListener("click", runSimulation);
  $("exportCsvButton").addEventListener("click", exportSimulationCsv);
}

function applyControlChange(input, normalize, keyOverride) {
  const value = boundedValue(input);
  const key = keyOverride || input.dataset.control;
  if (value === null) {
    if (normalize) input.value = String(settings[key]);
    return;
  }
  if (!normalize && value !== Number(input.value)) return;
  if (normalize) input.value = String(value);
  settings[key] = value;
  if (key === "altMonthlyInvestment") {
    $("altInvestmentValue").textContent = formatMoney(value, 0);
  } else {
    updateAuxiliaryReadouts();
    updateDashboard();
  }
  persistSettings();
  invalidateSimulation();
}

function restoreDefaults() {
  settings = { ...DEFAULTS };
  try {
    localStorage.removeItem(STORAGE_KEY);
    showStatus("Datos originales restaurados", false);
  } catch (error) {
    console.error("No se pudo limpiar LocalStorage al restaurar.", error);
    showStatus("Datos originales restaurados en pantalla; no se pudo limpiar LocalStorage.", true);
  }
  hydrateControls();
  updateDashboard();
  runSimulation();
}

function updateAuxiliaryReadouts() {
  $("packAdoptionValue").textContent = `${formatNumber(settings.packAdoption, 0)}%`;
  $("altInvestmentValue").textContent = formatMoney(settings.altMonthlyInvestment, 0);
  $("minimumCashLabel").textContent = formatMoney(settings.minimumCash, 0);
  $("subscriberShareReadout").textContent = `${formatNumber(settings.subscriberShare, 0)}%`;
  $("looseShareReadout").textContent = `${formatNumber(100 - settings.subscriberShare, 0)}%`;
  $("currentAcquisitionReadout").textContent = formatNumber(interpolateCustomers(settings.adSpend), 1);
}

function interpolateCustomers(spend) {
  const boundedSpend = Math.min(20000, Math.max(0, spend));
  for (let index = 0; index < ACQUISITION_HISTORY.length - 1; index += 1) {
    const lower = ACQUISITION_HISTORY[index];
    const upper = ACQUISITION_HISTORY[index + 1];
    if (boundedSpend <= upper.spend) {
      const fraction = (boundedSpend - lower.spend) / (upper.spend - lower.spend);
      return lower.customers + fraction * (upper.customers - lower.customers);
    }
  }
  return ACQUISITION_HISTORY[ACQUISITION_HISTORY.length - 1].customers;
}

function marginalCac(spend) {
  const boundedSpend = Math.min(20000, Math.max(0, spend));
  const segmentIndex = ACQUISITION_HISTORY.findIndex((point, index) => {
    const next = ACQUISITION_HISTORY[index + 1];
    return next && boundedSpend >= point.spend && boundedSpend < next.spend;
  });
  const index = segmentIndex < 0 ? ACQUISITION_HISTORY.length - 2 : segmentIndex;
  const current = ACQUISITION_HISTORY[index];
  const next = ACQUISITION_HISTORY[index + 1];
  return (next.spend - current.spend) / (next.customers - current.customers);
}

function contributionMargins() {
  const paymentRate = settings.paymentFee / 100;
  const normal = settings.normalPrice - settings.coffeeCost - settings.shippingCost
    - settings.normalPrice * paymentRate - settings.packagingCost;
  const subscription = settings.subscriptionPrice - settings.coffeeCost - settings.shippingCost
    - settings.subscriptionPrice * paymentRate - settings.packagingCost;
  const pack = settings.packPrice - 3 * settings.packUnitCoffeeCost
    - settings.packPrice * paymentRate - settings.packBoxCost;
  return { normal, subscription, pack };
}

function shares() {
  const subscription = Math.min(100, Math.max(0, settings.subscriberShare)) / 100;
  return { subscription, loose: 1 - subscription };
}

function looseOrderFrequency(age) {
  if (age === 0) return settings.firstMonthOrders;
  if (age <= 11) return Math.max(0, settings.looseOrders12m - settings.firstMonthOrders) / 11;
  return 0.1;
}

function cohortContributionPerCustomer(age, margins) {
  const mix = shares();
  const retention = Math.max(0, Math.min(1, 1 - settings.churnRate / 100));
  return mix.loose * margins.normal * looseOrderFrequency(age)
    + mix.subscription * margins.subscription * Math.pow(retention, age);
}

function computeCore() {
  const margins = contributionMargins();
  const mix = shares();
  const customers = interpolateCustomers(settings.adSpend);
  const adCac = customers > 0 ? settings.adSpend / customers : null;
  const realCac = customers > 0 ? (settings.adSpend + (settings.adSpend > 0 ? settings.agencyFee : 0)) / customers : null;
  const breakEvenRoas = settings.normalPrice > 0 ? settings.normalPrice / margins.normal : null;
  const retention = Math.max(0, Math.min(1, 1 - settings.churnRate / 100));
  const retentionSeries = Array.from({ length: 12 }, (_, month) => Math.pow(retention, month));
  const looseLtv = margins.normal * settings.looseOrders12m;
  const subscriptionLtv = margins.subscription * retentionSeries.reduce((sum, value) => sum + value, 0);
  const averageLtv = mix.loose * looseLtv + mix.subscription * subscriptionLtv;
  const firstOrderRoas = settings.adSpend > 0 ? customers * settings.normalPrice / settings.adSpend : null;
  const marginal = marginalCac(settings.adSpend);
  const paybackCurve = [];
  if (realCac !== null) {
    let accumulated = -realCac;
    paybackCurve.push(accumulated);
    for (let month = 0; month < 12; month += 1) {
      accumulated += cohortContributionPerCustomer(month, margins);
      paybackCurve.push(accumulated);
    }
  }
  const paybackIndex = paybackCurve.findIndex((value, index) => index > 0 && value >= 0);
  const payback = paybackIndex > 0 ? paybackIndex : null;
  return {
    margins,
    mix,
    customers,
    adCac,
    realCac,
    breakEvenRoas,
    looseLtv,
    subscriptionLtv,
    averageLtv,
    ltvCac: realCac && realCac > 0 ? averageLtv / realCac : null,
    firstOrderRoas,
    marginal,
    payback,
    paybackCurve
  };
}

function formatMoney(value, digits) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (digits !== undefined) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(value);
  }
  return MONEY_FORMAT.format(value);
}

function formatNumber(value, digits) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits === undefined ? 2 : digits }).format(value);
}

function formatRatio(value) {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}×`;
}

function updateDashboard() {
  const core = computeCore();
  $("kpiNormalMargin").textContent = formatMoney(core.margins.normal);
  $("kpiSubscriptionMargin").textContent = formatMoney(core.margins.subscription, 3);
  $("kpiBreakEvenRoas").textContent = formatRatio(core.breakEvenRoas);
  $("kpiAdCac").textContent = formatMoney(core.adCac);
  $("kpiRealCac").textContent = formatMoney(core.realCac);
  $("kpiRealRoas").textContent = formatRatio(core.firstOrderRoas);
  $("kpiLooseLtv").textContent = formatMoney(core.looseLtv);
  $("kpiSubscriberLtv").textContent = formatMoney(core.subscriptionLtv);
  $("kpiAverageLtv").textContent = formatMoney(core.averageLtv);
  $("kpiLtvCac").textContent = core.ltvCac === null ? "—" : `${core.ltvCac.toFixed(2)}:1`;
  $("kpiPayback").textContent = core.payback === null ? "> 12 meses" : `${core.payback} meses`;
  $("kpiMarginalCac").textContent = formatMoney(core.marginal);
  const segmentStart = settings.adSpend >= 20000 ? 16000 : Math.floor(settings.adSpend / 4000) * 4000;
  $("marginalHint").textContent = `tramo ${formatMoney(segmentStart, 0)}–${formatMoney(Math.min(20000, segmentStart + 4000), 0)}`;
  updateScenarios(core);
  updateCharts(core);
}

function scenarioData(name, spend, fee, discount, packAdoption) {
  const customers = interpolateCustomers(spend);
  const margins = contributionMargins();
  const mix = shares();
  const normalDiscountedMargin = settings.normalPrice * (1 - discount)
    - settings.coffeeCost - settings.shippingCost
    - settings.normalPrice * (1 - discount) * settings.paymentFee / 100
    - settings.packagingCost;
  const firstLooseMargin = packAdoption === null
    ? normalDiscountedMargin
    : packAdoption * margins.pack + (1 - packAdoption) * margins.normal;
  const firstOrderCount = Math.min(1, Math.max(0, settings.looseOrders12m));
  const looseLtv = firstLooseMargin * firstOrderCount
    + margins.normal * Math.max(0, settings.looseOrders12m - firstOrderCount);
  const ltv = mix.loose * looseLtv + mix.subscription * (margins.subscription
    * Array.from({ length: 12 }, (_, month) => Math.pow(1 - settings.churnRate / 100, month)).reduce((sum, value) => sum + value, 0));
  const realCac = customers > 0 ? (spend + (spend > 0 ? fee : 0)) / customers : null;
  const revenuePerCustomer = mix.loose * settings.normalPrice * (1 - discount)
    + mix.subscription * settings.subscriptionPrice;
  const roas = spend > 0 ? customers * revenuePerCustomer / spend : null;
  const ratio = realCac && realCac > 0 ? ltv / realCac : null;
  return { name, spend, fee, discount, packAdoption, packMargin: margins.pack, customers, realCac, ltv, roas, ratio };
}

function updateScenarios(core) {
  const scenarios = [
    scenarioData("A", 8000, settings.agencyFee, 0, null),
    scenarioData("B", 16000, settings.agencyFee, settings.firstDiscount / 100, null),
    scenarioData("C", 4000, 0, 0, settings.packAdoption / 100)
  ];
  const descriptions = [
    "Inversión actual, sin descuento y con agencia.",
    "Mayor inversión y descuento solo al primer pedido suelto.",
    "Menor inversión, gestión interna y pack de tres bolsas."
  ];
  const adoptionLine = `${formatNumber(settings.packAdoption, 0)}% adopción pack`;
  const markup = scenarios.map((scenario, index) => {
    const ratioText = scenario.ratio === null ? "—" : `${scenario.ratio.toFixed(2)}:1`;
    let verdict = "LTV no alcanza el CAC total estimado.";
    let verdictClass = "bad";
    if (scenario.ratio !== null && scenario.ratio >= 3) {
      verdict = "Alcanza la referencia LTV:CAC de 3:1.";
      verdictClass = "good";
    } else if (scenario.ratio !== null && scenario.ratio >= 1) {
      verdict = "LTV cubre el CAC; queda bajo la referencia de 3:1.";
      verdictClass = "";
    }
    const detailLines = [
      ["Inversión Meta", formatMoney(scenario.spend, 0)],
      ["Clientes nuevos estimados", formatNumber(scenario.customers, 0)],
      ["Fee mensual", formatMoney(scenario.fee, 0)],
      ["CAC real", formatMoney(scenario.realCac)],
      ["ROAS primer pedido", formatRatio(scenario.roas)],
      ["LTV promedio estimado", formatMoney(scenario.ltv)]
    ];
    if (index === 2) {
      detailLines.splice(2, 0, ["Adopción del pack", adoptionLine]);
      detailLines.splice(3, 0, ["Margen por pack", formatMoney(scenario.packMargin)]);
    }
    return `<article class="scenario-card${index === 0 ? " featured" : ""}">
      <div class="scenario-overline"><span>ESCENARIO ${scenario.name}</span>${index === 0 ? '<span class="scenario-badge">REFERENCIA</span>' : ""}</div>
      <h3>${["Situación actual", "Propuesta de agencia", "Propuesta alternativa"][index]}</h3>
      <p class="scenario-description">${descriptions[index]}</p>
      <div class="scenario-highlight"><span>Relación LTV:CAC</span><strong>${ratioText}</strong></div>
      <div class="scenario-metrics">${detailLines.map(([label, value]) => `<div class="scenario-metric"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
      <div class="scenario-verdict ${verdictClass}"><span>●</span><span>${verdict}</span></div>
    </article>`;
  }).join("");
  $("scenarioGrid").innerHTML = markup;
  const metaRoas = core.firstOrderRoas;
  const totalAcquisitionSpend = settings.adSpend + (settings.adSpend > 0 ? settings.agencyFee : 0);
  const netRoas = totalAcquisitionSpend > 0
    ? core.customers * settings.normalPrice / totalAcquisitionSpend
    : null;
  if (charts.roasChart) {
    charts.roasChart.data.datasets[0].data = [metaRoas, metaRoas, netRoas, core.breakEvenRoas];
    charts.roasChart.update("none");
  }
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { labels: { color: "#a7b3a9", boxWidth: 9, boxHeight: 9, usePointStyle: true, padding: 15, font: { family: "DM Sans", size: 9 } } },
      tooltip: {
        backgroundColor: "#0f1511",
        borderColor: "#39473c",
        borderWidth: 1,
        titleColor: "#eaf0e9",
        bodyColor: "#b9c5ba",
        padding: 10,
        titleFont: { family: "DM Sans", size: 10 },
        bodyFont: { family: "DM Sans", size: 9 }
      }
    },
    scales: {
      x: { grid: { color: "rgba(155, 175, 158, .08)" }, border: { display: false }, ticks: { color: "#839087", font: { family: "DM Sans", size: 9 } } },
      y: { grid: { color: "rgba(155, 175, 158, .08)" }, border: { display: false }, ticks: { color: "#839087", font: { family: "DM Sans", size: 9 } } }
    }
  };
}

function makeChart(id, config) {
  const canvas = $(id);
  if (!canvas) return null;
  return new Chart(canvas, config);
}

function initializeCharts() {
  if (typeof Chart === "undefined") {
    const alert = document.createElement("div");
    alert.className = "alert";
    alert.setAttribute("role", "alert");
    alert.textContent = "No se pudo cargar Chart.js desde CDN. Revisa la conexión a internet y vuelve a abrir index.html.";
    $("chartsHeading").closest(".section-block").insertBefore(alert, $("chartsHeading").closest(".section-block").querySelector(".chart-grid"));
    showStatus("Chart.js no disponible; los indicadores siguen activos.", true);
    return false;
  }
  charts.paybackChart = makeChart("paybackChart", {
    type: "line",
    data: { labels: Array.from({ length: 13 }, (_, index) => `Mes ${index}`), datasets: [
      { label: "Contribución acumulada neta del CAC", data: [], borderColor: "#b6e27c", backgroundColor: "rgba(182,226,124,.09)", fill: true, tension: .28, pointRadius: 2.5, pointBackgroundColor: "#b6e27c", borderWidth: 2 },
      { label: "Punto de recuperación", data: Array(13).fill(0), borderColor: "#e7c572", borderDash: [4, 5], borderWidth: 1, pointRadius: 0 }
    ] },
    options: chartOptions()
  });
  charts.ltvCacChart = makeChart("ltvCacChart", {
    type: "bar",
    data: {
      labels: ["CAC real", "LTV promedio"],
      datasets: [
        { type: "bar", label: "CAC real", data: [], backgroundColor: "#e7c572", borderRadius: 3, maxBarThickness: 30 },
        { type: "bar", label: "LTV promedio", data: [], backgroundColor: "#b6e27c", borderRadius: 3, maxBarThickness: 30 },
        { type: "line", label: "Referencia 1:1", data: [], borderColor: "#e7c572", borderDash: [4, 4], borderWidth: 1.2, pointRadius: 0, tension: 0 },
        { type: "line", label: "Referencia 3:1", data: [], borderColor: "#9cb68b", borderDash: [4, 4], borderWidth: 1.2, pointRadius: 0, tension: 0 }
      ]
    },
    options: chartOptions()
  });
  const acquisitionOptions = chartOptions();
  acquisitionOptions.plugins.legend.position = "bottom";
  acquisitionOptions.scales.y1 = {
    position: "right",
    grid: { drawOnChartArea: false },
    ticks: { color: "#b8a36e" },
    title: { display: true, text: "CAC marginal", color: "#b8a36e" }
  };
  acquisitionOptions.scales.y.title = { display: true, text: "Clientes", color: "#839087" };
  charts.acquisitionChart = makeChart("acquisitionChart", {
    type: "bar",
    data: { labels: ACQUISITION_HISTORY.map((point) => formatMoney(point.spend, 0)), datasets: [
      { type: "bar", label: "Clientes nuevos de Meta", data: ACQUISITION_HISTORY.map((point) => point.customers), yAxisID: "y", backgroundColor: "rgba(182,226,124,.68)", borderRadius: 3, maxBarThickness: 25 },
      { type: "line", label: "CAC marginal", data: ACQUISITION_HISTORY.slice(0, -1).map((point, index) => (ACQUISITION_HISTORY[index + 1].spend - point.spend) / (ACQUISITION_HISTORY[index + 1].customers - point.customers)), yAxisID: "y1", borderColor: "#e7c572", pointBackgroundColor: "#e7c572", pointRadius: 3, tension: 0, borderWidth: 2 }
    ] },
    options: acquisitionOptions
  });
  charts.roasChart = makeChart("roasChart", {
    type: "bar",
    data: { labels: ["ROAS Meta", "ROAS real · caso", "ROAS neto fee", "Break-even"], datasets: [{ label: "ROAS", data: [], backgroundColor: ["#b6e27c", "#8fb875", "#e7c572", "rgba(233,133,119,.75)"], borderRadius: 3, maxBarThickness: 40 }] },
    options: chartOptions()
  });
  charts.cashChart = makeChart("cashChart", {
    type: "line",
    data: { labels: Array.from({ length: SIMULATION_MONTHS + 1 }, (_, index) => `Mes ${index}`), datasets: [] },
    options: chartOptions()
  });
  return true;
}

function updateCharts(core) {
  if (!charts.paybackChart) return;
  charts.paybackChart.data.datasets[0].data = core.paybackCurve;
  charts.paybackChart.update("none");
  const cac = core.realCac || 0;
  charts.ltvCacChart.data.datasets[0].data = [cac, null];
  charts.ltvCacChart.data.datasets[1].data = [null, core.averageLtv];
  charts.ltvCacChart.data.datasets[2].data = [cac, cac];
  charts.ltvCacChart.data.datasets[3].data = [cac * 3, cac * 3];
  charts.ltvCacChart.update("none");
  charts.acquisitionChart.data.datasets[1].data = ACQUISITION_HISTORY.slice(0, -1).map((point, index) =>
    (ACQUISITION_HISTORY[index + 1].spend - point.spend)
      / (ACQUISITION_HISTORY[index + 1].customers - point.customers));
  charts.acquisitionChart.update("none");
}

function invalidateSimulation() {
  if (!lastSimulation) return;
  lastSimulation = null;
  $("planSummary").innerHTML = "";
  $("simulationAlerts").innerHTML = '<div class="alert safe">Los supuestos cambiaron. Ejecuta nuevamente la simulación para actualizar los resultados.</div>';
  $("simulationTableBody").innerHTML = '<tr><td colspan="10" class="empty-state">Ejecuta nuevamente la simulación para ver resultados actualizados.</td></tr>';
  $("exportCsvButton").disabled = true;
  if (charts.cashChart) {
    charts.cashChart.data.datasets = [];
    charts.cashChart.update("none");
  }
}

function getCohortContribution(cohort, month, margins) {
  const age = month - cohort.month;
  return cohort.size * cohortContributionPerCustomer(age, margins);
}

function calculateMonthCash(previousCash, month, spend, cohorts, margins) {
  const existing = settings.existingContribution * Math.pow(1 - settings.existingDecay / 100, month - 1);
  const cohortContribution = cohorts.reduce((sum, cohort) => sum + getCohortContribution(cohort, month, margins), 0);
  const newCohortSize = interpolateCustomers(spend) + settings.nonMetaCustomers;
  const currentContribution = newCohortSize * cohortContributionPerCustomer(0, margins);
  const fee = spend > 0 ? settings.agencyFee : 0;
  return previousCash + existing + cohortContribution + currentContribution
    - spend - fee - settings.fixedCosts;
}

function optimizedSpend(previousCash, month, cohorts, margins, minimumSpend) {
  const floor = settings.minimumCash;
  const minSpend = Math.min(20000, Math.max(0, minimumSpend));
  if (calculateMonthCash(previousCash, month, minSpend, cohorts, margins) < floor) return minSpend;
  if (calculateMonthCash(previousCash, month, 20000, cohorts, margins) >= floor) return 20000;
  let low = minSpend;
  let high = 20000;
  for (let index = 0; index < 36; index += 1) {
    const middle = (low + high) / 2;
    if (calculateMonthCash(previousCash, month, middle, cohorts, margins) >= floor) low = middle;
    else high = middle;
  }
  return low;
}

function simulatePlan(name, spendAtMonth, margins) {
  const cohorts = [];
  const rows = [];
  const cash = [settings.initialCash];
  const spends = [];
  let firstYearSpendTotal = 0;
  for (let month = 1; month <= SIMULATION_MONTHS; month += 1) {
    const minimumAfterYearOne = month > 12 ? firstYearSpendTotal / 12 : 0;
    const spend = Math.min(20000, Math.max(minimumAfterYearOne, spendAtMonth(month, cash[month - 1], cohorts, firstYearSpendTotal)));
    const metaCustomers = interpolateCustomers(spend);
    const newCustomers = metaCustomers + settings.nonMetaCustomers;
    const newCohort = { month, size: newCustomers };
    const currentContribution = settings.existingContribution * Math.pow(1 - settings.existingDecay / 100, month - 1);
    const cohortContribution = cohorts.reduce((sum, cohort) => sum + getCohortContribution(cohort, month, margins), 0)
      + getCohortContribution(newCohort, month, margins);
    const agencyFee = spend > 0 ? settings.agencyFee : 0;
    const outflows = spend + agencyFee + settings.fixedCosts;
    const closingCash = cash[month - 1] + currentContribution + cohortContribution - outflows;
    cohorts.push(newCohort);
    cash.push(closingCash);
    spends.push(spend);
    if (month <= 12) firstYearSpendTotal += spend;
    const mix = shares();
    const retention = Math.max(0, 1 - settings.churnRate / 100);
    const subscribers = cohorts.reduce((sum, cohort) => sum
      + cohort.size * mix.subscription * Math.pow(retention, month - cohort.month), 0);
    rows.push({
      plan: name,
      month,
      spend,
      metaCustomers,
      newCustomers,
      cohortContribution,
      existingContribution: currentContribution,
      outflows,
      closingCash,
      subscribers,
      agencyFee
    });
  }
  const minimumRow = rows.reduce((minimum, row) => row.closingCash < minimum.closingCash ? row : minimum, rows[0]);
  const floorViolations = rows.filter((row) => row.closingCash < settings.minimumCash - 0.005);
  const averageFirstYearSpend = spends.slice(0, 12).reduce((sum, value) => sum + value, 0) / 12;
  const spendRuleViolations = rows.slice(12).filter((row) => row.spend < averageFirstYearSpend - 0.005);
  return {
    name,
    rows,
    cash,
    spends,
    minimumCash: minimumRow.closingCash,
    minimumMonth: minimumRow.month,
    endingCash: cash[cash.length - 1],
    activeSubscribers: rows[rows.length - 1].subscribers,
    averageFirstYearSpend,
    floorViolations,
    spendRuleViolations,
    valid: floorViolations.length === 0 && spendRuleViolations.length === 0
  };
}

function runSimulation() {
  const margins = contributionMargins();
  const conservativeInvestment = Math.min(20000, Math.max(0, settings.altMonthlyInvestment));
  const plans = [
    simulatePlan("Inversión fija · $8,000", () => 8000, margins),
    simulatePlan("Inversión fija · $16,000", () => 16000, margins),
    simulatePlan("Alternativo conservador", () => conservativeInvestment, margins),
    simulatePlan("Alternativo optimizado", (month, cash, cohorts, firstYearTotal) => {
      const minimumSpend = month > 12 ? firstYearTotal / 12 : 0;
      return optimizedSpend(cash, month, cohorts, margins, minimumSpend);
    }, margins)
  ];
  lastSimulation = { plans, createdAt: new Date().toISOString() };
  renderSimulation(plans);
}

function renderSimulation(plans) {
  renderPlanSummary(plans);
  renderSimulationChart(plans);
  renderAlerts(plans);
  renderSimulationTable(plans);
  $("exportCsvButton").disabled = false;
}

function renderPlanSummary(plans) {
  $("planSummary").innerHTML = plans.map((plan) => {
    const statusClass = plan.valid ? "valid" : "invalid";
    const cardClass = plan.valid ? "plan-valid" : "plan-invalid";
    const statusText = plan.valid ? "Cumple restricciones" : "Incumple restricciones";
    return `<article class="plan-card ${cardClass}">
      <div class="plan-top"><h3>${plan.name}</h3><span class="plan-status ${statusClass}">${statusText}</span></div>
      <div class="plan-main">${formatMoney(plan.minimumCash)} <small>mínimo</small></div>
      <div class="plan-sub">Ocurre en el mes ${plan.minimumMonth}</div>
      <div class="plan-details">
        <div class="plan-detail"><span>Caja al mes 24</span><strong>${formatMoney(plan.endingCash)}</strong></div>
        <div class="plan-detail"><span>Suscriptores activos</span><strong>${formatNumber(plan.activeSubscribers, 0)}</strong></div>
      </div>
    </article>`;
  }).join("");
}

function renderSimulationChart(plans) {
  if (!charts.cashChart) return;
  const palette = ["#b6e27c", "#e7c572", "#80b9ae", "#d399cf"];
  charts.cashChart.data.datasets = plans.map((plan, index) => ({
    label: plan.name,
    data: plan.cash,
    borderColor: palette[index],
    backgroundColor: palette[index],
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: .2
  }));
  charts.cashChart.data.datasets.push({
    label: "Piso mínimo",
    data: Array(SIMULATION_MONTHS + 1).fill(settings.minimumCash),
    borderColor: "#e98577",
    borderDash: [5, 5],
    borderWidth: 1.3,
    pointRadius: 0,
    tension: 0
  });
  charts.cashChart.update();
}

function renderAlerts(plans) {
  const failing = plans.filter((plan) => !plan.valid);
  if (failing.length === 0) {
    $("simulationAlerts").innerHTML = '<div class="alert safe"><span>✓</span><span>Los cuatro planes respetan el piso de caja y la inversión mínima desde el mes 13. Ningún plan se declara ganador: revisa las métricas y los supuestos antes de decidir.</span></div>';
    return;
  }
  $("simulationAlerts").innerHTML = failing.map((plan) => {
    const messages = [];
    if (plan.floorViolations.length) {
      const first = plan.floorViolations[0];
      messages.push(`Caja menor a ${formatMoney(settings.minimumCash)} en el mes ${first.month} (mínimo ${formatMoney(plan.minimumCash)} en mes ${plan.minimumMonth}).`);
    }
    if (plan.spendRuleViolations.length) {
      messages.push(`La inversión cae por debajo del promedio del primer año en el mes ${plan.spendRuleViolations[0].month}.`);
    }
    return `<div class="alert"><span>!</span><span><strong>${plan.name}:</strong> ${messages.join(" ")}</span></div>`;
  }).join("");
}

function renderSimulationTable(plans) {
  const rows = plans.flatMap((plan) => plan.rows);
  $("tableCount").textContent = `${rows.length} registros`;
  $("simulationTableBody").innerHTML = rows.map((row) => `<tr>
    <td>${row.plan}</td>
    <td>${row.month}</td>
    <td>${formatMoney(row.spend)}</td>
    <td>${formatNumber(row.metaCustomers, 1)}</td>
    <td>${formatNumber(row.newCustomers, 1)}</td>
    <td>${formatMoney(row.cohortContribution)}</td>
    <td>${formatMoney(row.existingContribution)}</td>
    <td>${formatMoney(row.outflows)}</td>
    <td class="${row.closingCash < settings.minimumCash ? "negative" : "positive"}">${formatMoney(row.closingCash)}</td>
    <td>${formatNumber(row.subscribers, 1)}</td>
  </tr>`).join("");
}

function csvEscape(value) {
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportSimulationCsv() {
  if (!lastSimulation) return;
  const lines = [
    ["Tipo", "Plan", "Mes", "Inversión", "Nuevos Meta", "Nuevos totales", "Contribución cohortes", "Contribución clientes actuales", "Salidas totales", "Caja final", "Suscriptores activos", "Caja mínima", "Mes caja mínima", "Caja final mes 24", "Cumple restricciones"],
  ];
  lastSimulation.plans.forEach((plan) => {
    lines.push(["Resumen", plan.name, "", "", "", "", "", "", "", "", "", plan.minimumCash, plan.minimumMonth, plan.endingCash, plan.valid ? "Sí" : "No"]);
    plan.rows.forEach((row) => lines.push([
      "Detalle", row.plan, row.month, row.spend, row.metaCustomers, row.newCustomers,
      row.cohortContribution, row.existingContribution, row.outflows, row.closingCash,
      row.subscribers, "", "", "", ""
    ]));
  });
  const csv = `\uFEFF${lines.map((row) => row.map(csvEscape).join(";")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tueste-simulacion-24-meses-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindNavigation() {
  const links = Array.from(document.querySelectorAll(".nav-link"));
  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

function init() {
  loadSettings();
  hydrateControls();
  bindControls();
  bindNavigation();
  const hasCharts = initializeCharts();
  updateDashboard();
  if (hasCharts) {
    const core = computeCore();
    const totalAcquisitionSpend = settings.adSpend + (settings.adSpend > 0 ? settings.agencyFee : 0);
    const netRoas = totalAcquisitionSpend > 0
      ? core.customers * settings.normalPrice / totalAcquisitionSpend
      : null;
    charts.roasChart.data.datasets[0].data = [core.firstOrderRoas, core.firstOrderRoas, netRoas, core.breakEvenRoas];
    charts.roasChart.update("none");
  }
  $("simulationAlerts").innerHTML = '<div class="alert safe">Ejecuta la simulación para revisar los cuatro planes y las restricciones de caja.</div>';
}

document.addEventListener("DOMContentLoaded", init);

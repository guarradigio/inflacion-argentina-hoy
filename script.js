'use strict';

const DATA_URL = 'data/ipc.json';
const LIVE_API_URL = 'https://apis.datos.gob.ar/series/api/series?ids=145.3_INGNACNAL_DICI_M_15&format=json&limit=5000';
const USE_LIVE_API = false;

let inflationSeries = [];
let inflationMetadata = {};

const FAQS = [
  {
    question: 'Cuál fue la inflación de este mes en Argentina',
    answer: 'La inflación de este mes se toma del último dato oficial disponible del IPC Nacional publicado por INDEC. Si todavía no se publicó el mes en curso, se muestra el último mes cerrado disponible en la serie cargada.'
  },
  {
    question: 'Cómo se calcula la inflación acumulada',
    answer: 'La inflación acumulada del año compara el índice IPC del mes elegido contra el índice de diciembre del año anterior. Por ejemplo, el acumulado de marzo compara marzo contra diciembre previo.'
  },
  {
    question: 'Qué diferencia hay entre inflación mensual e interanual',
    answer: 'La inflación mensual compara los precios contra el mes anterior. La inflación interanual compara contra el mismo mes del año anterior y permite mirar la variación de doce meses.'
  },
  {
    question: 'Cómo saber cuánto perdió valor mi sueldo',
    answer: 'Ingresá el monto de tu sueldo, elegí el mes en que querés tomarlo como referencia y comparalo contra el último mes disponible. La calculadora muestra cuánto debería valer para mantener poder de compra.'
  },
  {
    question: 'Cómo calcular una cuota ajustada por inflación',
    answer: 'Podés simular cuotas con una inflación mensual fija o usar un tramo histórico real del IPC. La herramienta calcula la cuota de cada mes, la cuota final, el total pagado y el aumento acumulado.'
  },
  {
    question: 'De dónde salen los datos',
    answer: 'La fuente principal es el IPC Nacional de INDEC publicado en Datos Argentina. Las expectativas REM del BCRA, si se agregan en una versión futura, deben leerse como estimaciones y no como inflación observada.'
  }
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  initMenu();
  renderFAQs();

  try {
    const rawData = await loadInflationData();
    const parsed = parseInflationData(rawData);

    inflationSeries = parsed.series;
    inflationMetadata = parsed.metadata;

    hydrateUpdateLabels();
    populatePeriodSelects();
    renderCards();
    renderTable();
    renderChart();
    bindCalculatorForms();
    runInitialCalculations();
  } catch (error) {
    showDataError(error);
  }
}

function initMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('mainNav');

  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

async function loadInflationData() {
  const response = await fetch(USE_LIVE_API ? LIVE_API_URL : DATA_URL, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`No se pudo cargar la serie IPC. Estado HTTP: ${response.status}`);
  }

  return response.json();
}

function parseInflationData(rawData) {
  const rawSeries = Array.isArray(rawData.series)
    ? rawData.series
    : (rawData.data || []).map((row) => ({
        date: row[0],
        period: String(row[0]).slice(0, 7),
        ipcIndex: row[1]
      }));

  const normalized = rawSeries
    .map((item) => {
      const date = item.date || `${item.period}-01`;
      return {
        date,
        period: item.period || String(date).slice(0, 7),
        ipcIndex: Number(item.ipcIndex ?? item.value)
      };
    })
    .filter((item) => item.period && Number.isFinite(item.ipcIndex))
    .sort((a, b) => a.period.localeCompare(b.period));

  const byPeriod = new Map(normalized.map((item) => [item.period, item]));

  normalized.forEach((item, index) => {
    const previous = normalized[index - 1];
    const previousYear = byPeriod.get(shiftPeriod(item.period, -12));
    const previousDecember = byPeriod.get(`${Number(item.period.slice(0, 4)) - 1}-12`);

    item.monthlyChangePct = previous ? percentageChange(item.ipcIndex, previous.ipcIndex) : null;
    item.yearOverYearPct = previousYear ? percentageChange(item.ipcIndex, previousYear.ipcIndex) : null;
    item.yearToDatePct = previousDecember ? percentageChange(item.ipcIndex, previousDecember.ipcIndex) : null;
    item.label = formatPeriodLabel(item.period);
  });

  return {
    series: normalized,
    metadata: {
      sourceName: rawData.source?.name || rawData.meta?.[1]?.dataset?.source || 'INDEC',
      datasetTitle: rawData.source?.datasetTitle || rawData.meta?.[1]?.dataset?.title || 'IPC Nacional',
      seriesId: rawData.source?.seriesId || rawData.meta?.[1]?.field?.id || '145.3_INGNACNAL_DICI_M_15',
      apiUrl: rawData.source?.apiUrl || LIVE_API_URL,
      downloadURL: rawData.source?.downloadURL || rawData.meta?.[1]?.distribution?.downloadURL || '',
      lastFetched: rawData.source?.lastFetched || new Date().toISOString().slice(0, 10),
      latestAvailablePeriod: rawData.source?.latestAvailablePeriod || normalized.at(-1)?.period || ''
    }
  };
}

function getLatestInflation(series = inflationSeries) {
  const latest = series.at(-1);

  if (!latest) {
    return null;
  }

  return {
    period: latest.period,
    label: latest.label,
    ipcIndex: latest.ipcIndex,
    monthly: latest.monthlyChangePct,
    yearToDate: latest.yearToDatePct,
    yearOverYear: latest.yearOverYearPct
  };
}

function calculateInflationAdjustedValue(amount, startPeriod, endPeriod) {
  const start = findPeriod(startPeriod);
  const end = findPeriod(endPeriod);
  const numericAmount = Number(amount);

  if (!start || !end) {
    throw new Error('Elegí períodos disponibles en la serie IPC.');
  }

  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new Error('Ingresá un monto válido mayor o igual a cero.');
  }

  const ratio = end.ipcIndex / start.ipcIndex;
  const adjustedAmount = numericAmount * ratio;

  return {
    initialAmount: numericAmount,
    adjustedAmount,
    percentChange: (ratio - 1) * 100,
    purchasingPowerLossPct: (1 - (numericAmount / adjustedAmount)) * 100,
    pesosVariation: adjustedAmount - numericAmount,
    start,
    end
  };
}

function calculateInstallmentsByFixedInflation(initialInstallment, months, monthlyRate) {
  const initial = Number(initialInstallment);
  const totalMonths = Number(months);
  const rate = Number(monthlyRate) / 100;

  if (!Number.isFinite(initial) || initial < 0) {
    throw new Error('Ingresá una cuota inicial válida.');
  }

  if (!Number.isInteger(totalMonths) || totalMonths < 1 || totalMonths > 60) {
    throw new Error('La cantidad de meses debe estar entre 1 y 60.');
  }

  if (!Number.isFinite(rate)) {
    throw new Error('Ingresá una inflación mensual estimada válida.');
  }

  const rows = Array.from({ length: totalMonths }, (_, index) => ({
    installmentNumber: index + 1,
    label: `Mes ${index + 1}`,
    monthlyRatePct: index === 0 ? 0 : Number(monthlyRate),
    amount: initial * Math.pow(1 + rate, index)
  }));

  return summarizeInstallments(rows);
}

function calculateInstallmentsByHistoricalInflation(initialInstallment, selectedPeriods) {
  const initial = Number(initialInstallment);

  if (!Number.isFinite(initial) || initial < 0) {
    throw new Error('Ingresá una cuota inicial válida.');
  }

  if (!Array.isArray(selectedPeriods) || selectedPeriods.length === 0) {
    throw new Error('Elegí un tramo histórico disponible.');
  }

  let currentAmount = initial;

  const rows = selectedPeriods.map((period, index) => {
    const item = findPeriod(period);

    if (!item) {
      throw new Error(`No hay datos para el período ${period}.`);
    }

    if (index > 0) {
      currentAmount *= 1 + ((item.monthlyChangePct || 0) / 100);
    }

    return {
      installmentNumber: index + 1,
      label: item.label,
      monthlyRatePct: index === 0 ? 0 : item.monthlyChangePct,
      amount: currentAmount
    };
  });

  return summarizeInstallments(rows);
}

function renderCards(series = inflationSeries) {
  const latest = getLatestInflation(series);
  const target = document.getElementById('summaryCards');

  if (!target || !latest) return;

  const cards = [
    {
      label: 'Inflación último mes',
      value: formatPercent(latest.monthly),
      detail: latest.label,
      tone: 'positive'
    },
    {
      label: 'Inflación acumulada del año',
      value: formatPercent(latest.yearToDate),
      detail: `Desde diciembre de ${Number(latest.period.slice(0, 4)) - 1}`,
      tone: 'positive'
    },
    {
      label: 'Inflación interanual',
      value: formatPercent(latest.yearOverYear),
      detail: 'Contra el mismo mes del año anterior',
      tone: 'positive'
    },
    {
      label: 'Último dato publicado',
      value: latest.label,
      detail: `Índice IPC: ${formatIndex(latest.ipcIndex)}`,
      tone: 'neutral'
    }
  ];

  target.innerHTML = cards.map((card) => `
    <article class="metric-card">
      <span>${card.label}</span>
      <strong class="${card.tone}">${card.value}</strong>
      <small>${card.detail}</small>
    </article>
  `).join('');
}

function renderTable(series = inflationSeries) {
  const body = document.getElementById('historyTableBody');

  if (!body) return;

  const rows = series.slice(-24).reverse();

  body.innerHTML = rows.map((item) => `
    <tr>
      <td>${item.label}</td>
      <td>${formatIndex(item.ipcIndex)}</td>
      <td>${formatPercent(item.monthlyChangePct)}</td>
      <td>${formatPercent(item.yearOverYearPct)}</td>
      <td>${formatPercent(item.yearToDatePct)}</td>
    </tr>
  `).join('');
}

function renderChart(series = inflationSeries) {
  const canvas = document.getElementById('inflationChart');

  if (!canvas || !series.length) return;

  const data = series.slice(-12);
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(rect.width, 320);
  const height = 340;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const padding = { top: 20, right: 18, bottom: 58, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = data.map((item) => item.monthlyChangePct || 0);
  const maxValue = Math.max(1, Math.ceil(Math.max(...values) + 1));
  const barGap = 8;
  const barWidth = Math.max(12, (chartWidth / data.length) - barGap);

  context.font = '12px system-ui, sans-serif';
  context.fillStyle = '#56645d';
  context.strokeStyle = '#dbe4df';
  context.lineWidth = 1;

  for (let step = 0; step <= 4; step += 1) {
    const value = (maxValue / 4) * step;
    const y = padding.top + chartHeight - ((value / maxValue) * chartHeight);

    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(`${formatNumber(value, 1)}%`, 8, y + 4);
  }

  data.forEach((item, index) => {
    const value = item.monthlyChangePct || 0;
    const x = padding.left + index * (barWidth + barGap);
    const barHeight = (value / maxValue) * chartHeight;
    const y = padding.top + chartHeight - barHeight;

    context.fillStyle = '#147a56';
    context.fillRect(x, y, barWidth, barHeight);

    context.fillStyle = '#17211b';
    context.fillText(formatNumber(value, 1), x, Math.max(y - 6, 12));

    context.save();
    context.translate(x + 2, height - 14);
    context.rotate(-Math.PI / 5);
    context.fillStyle = '#56645d';
    context.fillText(shortPeriodLabel(item.period), 0, 0);
    context.restore();
  });
}

function renderFAQs() {
  const target = document.getElementById('faqList');

  if (!target) return;

  target.innerHTML = FAQS.map((item, index) => `
    <details ${index === 0 ? 'open' : ''}>
      <summary>${escapeHTML(item.question)}</summary>
      <p>${escapeHTML(item.answer)}</p>
    </details>
  `).join('');
}

function formatCurrencyARS(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits
  }).format(Number(value) || 0);
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return 'Sin dato';
  }

  return `${formatNumber(value, digits)} %`;
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatIndex(value) {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function hydrateUpdateLabels() {
  const latest = getLatestInflation();
  const updateText = `${formatISODate(inflationMetadata.lastFetched)} · último dato oficial cargado: ${latest?.label || 'sin dato'}`;

  setText('lastUpdatedHero', updateText);
  setText('lastUpdatedSources', updateText);
  setText('summarySource', `Los datos de inflación realizada provienen de INDEC vía Datos Argentina. Archivo local actualizado el ${formatISODate(inflationMetadata.lastFetched)} con último período oficial ${latest?.label || 'sin dato'}. Las expectativas, si se muestran, son estimaciones del REM del BCRA y no datos observados.`);
}

function populatePeriodSelects() {
  const selectors = [
    document.getElementById('startPeriodSelect'),
    document.getElementById('endPeriodSelect'),
    document.getElementById('historicalStartPeriodSelect')
  ];

  selectors.forEach((select) => {
    if (!select) return;

    select.innerHTML = inflationSeries.map((item) => `
      <option value="${item.period}">${item.label}</option>
    `).join('');
  });

  const latest = inflationSeries.at(-1);
  const january2024 = inflationSeries.find((item) => item.period === '2024-01') || inflationSeries.at(-13) || inflationSeries[0];
  const historicalStart = inflationSeries.at(-12) || inflationSeries[0];

  setSelectValue('startPeriodSelect', january2024.period);
  setSelectValue('endPeriodSelect', latest.period);
  setSelectValue('historicalStartPeriodSelect', historicalStart.period);
}

function bindCalculatorForms() {
  const inflationForm = document.getElementById('inflationForm');
  const installmentForm = document.getElementById('installmentForm');
  const modeInputs = document.querySelectorAll('input[name="installmentMode"]');

  if (inflationForm) {
    inflationForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleInflationCalculation();
    });
  }

  if (installmentForm) {
    installmentForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleInstallmentCalculation();
    });
  }

  modeInputs.forEach((input) => {
    input.addEventListener('change', updateInstallmentMode);
  });

  window.addEventListener('resize', debounce(() => renderChart(), 180));
}

function runInitialCalculations() {
  handleInflationCalculation();
  handleInstallmentCalculation();
}

function handleInflationCalculation() {
  const amount = document.getElementById('amountInput')?.value;
  const startPeriod = document.getElementById('startPeriodSelect')?.value;
  const endPeriod = document.getElementById('endPeriodSelect')?.value;
  const target = document.getElementById('inflationResult');

  try {
    const result = calculateInflationAdjustedValue(amount, startPeriod, endPeriod);
    renderInflationResult(result);
  } catch (error) {
    target.innerHTML = `<h3>Resultado</h3><p class="error-message">${escapeHTML(error.message)}</p>`;
  }
}

function renderInflationResult(result) {
  const target = document.getElementById('inflationResult');

  if (!target) return;

  const lossLabel = result.purchasingPowerLossPct >= 0
    ? 'Pérdida de poder adquisitivo si quedó fijo'
    : 'Ganancia de poder adquisitivo si quedó fijo';

  target.innerHTML = `
    <h3>Resultado entre ${result.start.label} y ${result.end.label}</h3>
    <div class="result-grid">
      <div class="result-item">
        <span>Monto inicial</span>
        <strong>${formatCurrencyARS(result.initialAmount)}</strong>
      </div>
      <div class="result-item">
        <span>Monto ajustado por IPC</span>
        <strong>${formatCurrencyARS(result.adjustedAmount)}</strong>
      </div>
      <div class="result-item">
        <span>Inflación acumulada del período</span>
        <strong>${formatPercent(result.percentChange)}</strong>
      </div>
      <div class="result-item">
        <span>${lossLabel}</span>
        <strong>${formatPercent(Math.abs(result.purchasingPowerLossPct))}</strong>
      </div>
      <div class="result-item">
        <span>Variación en pesos</span>
        <strong>${formatCurrencyARS(result.pesosVariation)}</strong>
      </div>
      <div class="result-item">
        <span>Índice usado</span>
        <strong>${formatIndex(result.start.ipcIndex)} → ${formatIndex(result.end.ipcIndex)}</strong>
      </div>
    </div>
  `;
}

function updateInstallmentMode() {
  const mode = document.querySelector('input[name="installmentMode"]:checked')?.value || 'fixed';
  const fixedFields = document.getElementById('fixedRateFields');
  const historicalFields = document.getElementById('historicalFields');

  if (fixedFields && historicalFields) {
    fixedFields.hidden = mode !== 'fixed';
    historicalFields.hidden = mode !== 'historical';
  }
}

function handleInstallmentCalculation() {
  const target = document.getElementById('installmentResult');
  const mode = document.querySelector('input[name="installmentMode"]:checked')?.value || 'fixed';
  const initial = document.getElementById('initialInstallmentInput')?.value;
  const months = Number(document.getElementById('installmentMonthsInput')?.value);

  try {
    const result = mode === 'fixed'
      ? calculateInstallmentsByFixedInflation(initial, months, document.getElementById('fixedMonthlyRateInput')?.value)
      : calculateInstallmentsByHistoricalInflation(initial, getHistoricalPeriods(document.getElementById('historicalStartPeriodSelect')?.value, months));

    renderInstallmentResult(result, mode === 'fixed' ? 'Inflación mensual fija' : 'Inflación histórica real');
  } catch (error) {
    target.innerHTML = `<h3>Resultado</h3><p class="error-message">${escapeHTML(error.message)}</p>`;
  }
}

function renderInstallmentResult(result, modeLabel) {
  const target = document.getElementById('installmentResult');

  if (!target) return;

  target.innerHTML = `
    <h3>${modeLabel}</h3>
    <div class="result-grid">
      <div class="result-item">
        <span>Cuota final</span>
        <strong>${formatCurrencyARS(result.finalInstallment)}</strong>
      </div>
      <div class="result-item">
        <span>Total pagado</span>
        <strong>${formatCurrencyARS(result.totalPaid)}</strong>
      </div>
      <div class="result-item">
        <span>Aumento primera vs última cuota</span>
        <strong>${formatPercent(result.increasePct)}</strong>
      </div>
      <div class="result-item">
        <span>Cantidad de cuotas</span>
        <strong>${result.rows.length}</strong>
      </div>
    </div>
    <div class="mini-table-wrap" tabindex="0" aria-label="Tabla de evolución de cuotas">
      <table>
        <thead>
          <tr>
            <th scope="col">Cuota</th>
            <th scope="col">Mes</th>
            <th scope="col">Ajuste aplicado</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${result.rows.map((row) => `
            <tr>
              <td>${row.installmentNumber}</td>
              <td>${row.label}</td>
              <td>${formatPercent(row.monthlyRatePct)}</td>
              <td>${formatCurrencyARS(row.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function summarizeInstallments(rows) {
  const totalPaid = rows.reduce((sum, row) => sum + row.amount, 0);
  const first = rows[0]?.amount || 0;
  const finalInstallment = rows.at(-1)?.amount || 0;

  return {
    rows,
    totalPaid,
    finalInstallment,
    increasePct: first > 0 ? ((finalInstallment / first) - 1) * 100 : 0
  };
}

function getHistoricalPeriods(startPeriod, months) {
  const startIndex = inflationSeries.findIndex((item) => item.period === startPeriod);

  if (startIndex < 0) {
    throw new Error('Elegí un inicio histórico disponible.');
  }

  const selected = inflationSeries.slice(startIndex, startIndex + months);

  if (selected.length < months) {
    throw new Error('No hay suficientes meses cargados desde ese inicio histórico. Elegí un tramo anterior o menos cuotas.');
  }

  return selected.map((item) => item.period);
}

function percentageChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current / previous) - 1) * 100;
}

function findPeriod(period) {
  return inflationSeries.find((item) => item.period === period);
}

function shiftPeriod(period, offset) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodLabel(period) {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, 1));
}

function shortPeriodLabel(period) {
  const [year, month] = period.split('-').map(Number);
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(year, month - 1, 1));
  return `${monthLabel} ${String(year).slice(2)}`;
}

function formatISODate(dateString) {
  if (!dateString) return 'sin fecha';

  const [year, month, day] = dateString.split('-').map(Number);

  if (!year || !month || !day) {
    return dateString;
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day));
}

function setText(id, text) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = text;
  }
}

function setSelectValue(id, value) {
  const element = document.getElementById(id);

  if (element && value) {
    element.value = value;
  }
}

function showDataError(error) {
  const message = `No se pudo cargar data/ipc.json. Si abriste el archivo directo desde el disco, servilo por HTTP o subilo a GitHub Pages. Detalle: ${error.message}`;
  const cards = document.getElementById('summaryCards');
  const table = document.getElementById('historyTableBody');

  if (cards) {
    cards.innerHTML = `<div class="error-message">${escapeHTML(message)}</div>`;
  }

  if (table) {
    table.innerHTML = `<tr><td colspan="5">${escapeHTML(message)}</td></tr>`;
  }

  setText('lastUpdatedHero', 'No disponible');
  setText('lastUpdatedSources', 'No disponible');
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function debounce(callback, wait) {
  let timeoutId;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback.apply(null, args), wait);
  };
}

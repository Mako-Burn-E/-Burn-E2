const CONFIG_URL = "config.json";

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').substring(1);
      const el = document.getElementById(id);
      if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
    });
  });
  setupTabs();
  loadConfigAndBurn();
  setupModal();
});

async function loadTabContent(file, panelId) {
  try {
    const r = await fetch(`content/${file}`);
    const html = await r.text();
    const panel = document.getElementById(panelId);
    if (panel) panel.innerHTML = html;
  } catch (e) {
    const panel = document.getElementById(panelId);
    if (panel) panel.innerHTML = "<p class='meta'>Unable to load content.</p>";
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('.tabpanel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.setAttribute('aria-selected','false'));
      panels.forEach(p => p.classList.remove('active'));
      tab.setAttribute('aria-selected','true');
      const panelId = tab.getAttribute('aria-controls');
      document.getElementById(panelId).classList.add('active');
      const file = tab.dataset.file;
      if (file) loadTabContent(file, panelId);
    });
    tab.addEventListener('keydown', (e) => {
      const idx = Array.from(tabs).indexOf(tab);
      if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx+1)%tabs.length].focus(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(idx-1+tabs.length)%tabs.length].focus(); }
    });
  });
  const first = document.querySelector('.tablist [aria-selected="true"]');
  if (first) {
    const pid = first.getAttribute('aria-controls');
    const file = first.dataset.file;
    if (file) loadTabContent(file, pid);
  }
}

async function loadConfigAndBurn() {
  try {
    const r = await fetch(CONFIG_URL, { cache: 'no-store' });
    const cfg = await r.json();

    const launchBtn = document.getElementById('launchBtn');
    const launchBtn2 = document.getElementById('launchBtn2');
    if (launchBtn) launchBtn.href = cfg.launch_url;
    if (launchBtn2) launchBtn2.href = cfg.launch_url;

    const form = document.getElementById('subscribeForm');
    if (form && cfg.subscribe_action) form.action = cfg.subscribe_action;

    let burnData = null;
    if (cfg.burn_api_url) {
      try {
        const br = await fetch(cfg.burn_api_url, { cache: 'no-store' });
        if (!br.ok) throw new Error('API HTTP ' + br.status);
        burnData = await br.json();
      } catch (e) { /* fallback */ }
    }
    if (!burnData) burnData = cfg.fallback_burn;

    renderBurn(burnData);
  } catch (e) {
    renderBurn({ start_supply: 1000000000, goal_supply: 23000000, current_supply: 1000000000, timeseries: [] });
  }
}

function renderBurn(burnData) {
  const start = burnData.start_supply ?? 1000000000;
  const goal = burnData.goal_supply ?? 23000000;
  const current = burnData.current_supply ?? start;
  const burned = Math.max(0, start - current);
  const totalTargetBurn = Math.max(1, start - goal);
  const pct = Math.max(0, Math.min(100, (burned / totalTargetBurn) * 100));

  const pf = document.getElementById('progressFill');
  if (pf) pf.style.width = pct.toFixed(2) + '%';
  const bv = document.getElementById('burnedValue');
  if (bv) bv.textContent = burned.toLocaleString();
  const pv = document.getElementById('pctValue');
  if (pv) pv.textContent = (Math.round(pct*100)/100).toFixed(2) + '%';
  const tg = document.getElementById('toGoalValue');
  if (tg) tg.textContent = Math.max(0, current - goal).toLocaleString();
  const cs = document.getElementById('currentSupply');
  if (cs) cs.textContent = current.toLocaleString() + ' tokens';
  const ks = document.getElementById('kpiStart'); if (ks) ks.textContent = start.toLocaleString() + ' tokens';
  const kg = document.getElementById('kpiGoal'); if (kg) kg.textContent = goal.toLocaleString() + ' tokens';

  const ctx = document.getElementById('burnChart');
  if (ctx && burnData.timeseries && burnData.timeseries.length > 0) {
    const first = burnData.timeseries[0];
    const dateKey = Object.keys(first)[0];
    const supKey = Object.keys(first).find(k => k.includes('supply')) || Object.keys(first)[1];
    const labels = burnData.timeseries.map(p => p[dateKey]);
    const data = burnData.timeseries.map(p => p[supKey]);
    new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Current Supply', data, borderWidth: 2, tension: 0.28 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { ticks: { color: '#B1A9A5' } }, y: { ticks: { color: '#B1A9A5' } } },
        plugins: { legend: { labels: { color: '#FFD44E' } } }
      }
    });
  } else if (ctx) { ctx.parentElement.style.display = 'none'; }
}

function setupModal() {
  const backdrop = document.getElementById('subscribeBackdrop');
  const btnClose = document.getElementById('subscribeClose');
  const form = document.getElementById('subscribeForm');
  setTimeout(() => { if (backdrop) { backdrop.style.display = 'flex'; backdrop.setAttribute('aria-hidden','false'); } }, 30000);
  if (btnClose) btnClose.addEventListener('click', () => { backdrop.style.display = 'none'; backdrop.setAttribute('aria-hidden','true'); });
  if (form) form.addEventListener('submit', () => { setTimeout(() => { if (backdrop) backdrop.style.display = 'none'; }, 500); });
}

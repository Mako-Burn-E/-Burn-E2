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
  initSite();
  setupModal();
  document.getElementById('refreshBurns')?.addEventListener('click', () => refreshLedger(true));
  document.getElementById('loadMoreBurns')?.addEventListener('click', () => loadMoreBurns());
});

let CFG = null;
let burnsCursor = null;

async function initSite() {
  try {
    const r = await fetch(CONFIG_URL, { cache: 'no-store' });
    CFG = await r.json();

    // CTAs
    const dappUrl = CFG.launch_url;
    const pumpUrl = CFG.pump_url;
    ['launchBtn','launchBtn2'].forEach(id => { const el = document.getElementById(id); if (el && dappUrl) el.href = dappUrl; });
    const buyBtn = document.getElementById('buyBtn'); if (buyBtn && pumpUrl) buyBtn.href = pumpUrl;
    const fuelBtn = document.getElementById('fuelBtn'); if (fuelBtn && pumpUrl) fuelBtn.href = pumpUrl;

    // Subscribe form
    const form = document.getElementById('subscribeForm');
    if (form && CFG.subscribe_action) form.action = CFG.subscribe_action;

    // Badge: show only if no live API configured
    const badge = document.getElementById('prelaunchBadge');
    const hasLiveLedger = (CFG?.ledger_api?.metrics_url || CFG?.burn_api_url);
    if (badge) badge.style.display = hasLiveLedger ? 'none' : 'inline-block';

    // Render KPIs + Ledger
    await refreshLedger(false);
  } catch (e) {
    console.error(e);
    renderMetrics({
      start_supply: 1000000000, goal_supply: 23000000,
      current_supply: 1000000000, total_burned: 0, pct_to_goal: 0, last_burn_ts: null, weekly_prize_pot: 0
    });
    renderBurns([], null);
    renderMilestones([]);
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
  });
  const first = document.querySelector('.tablist [aria-selected="true"]');
  if (first) {
    const pid = first.getAttribute('aria-controls');
    const file = first.dataset.file;
    if (file) loadTabContent(file, pid);
  }
}

async function loadTabContent(file, panelId) {
  try {
    const r = await fetch(`content/${file}`);
    const html = await r.text();
    const panel = document.getElementById(panelId);
    if (panel) panel.innerHTML = html;
  } catch {
    const panel = document.getElementById(panelId);
    if (panel) panel.innerHTML = "<p class='meta'>Unable to load content.</p>";
  }
}

async function refreshLedger(force) {
  try {
    const metrics = await fetchJson(CFG?.ledger_api?.metrics_url) || CFG?.fallback_ledger?.metrics || CFG?.fallback_burn || null;
    if (metrics) {
      if (metrics.start_supply && metrics.goal_supply && metrics.current_supply && metrics.total_burned == null) {
        metrics.total_burned = Math.max(0, (metrics.start_supply || 0) - (metrics.current_supply || 0));
        const totalTargetBurn = Math.max(1, (metrics.start_supply || 0) - (metrics.goal_supply || 1));
        metrics.pct_to_goal = Math.max(0, Math.min(100, (metrics.total_burned / totalTargetBurn) * 100));
      }
      renderMetrics(metrics);
    }

    if (force) burnsCursor = null;
    const burnsResp = await fetchJson(appendCursor(CFG?.ledger_api?.burns_url, burnsCursor)) || { items: CFG?.fallback_ledger?.burns || [], next_cursor: null };
    renderBurns(burnsResp.items || [], burnsResp.next_cursor || null);

    const milestones = await fetchJson(CFG?.ledger_api?.milestones_url) || { milestones: CFG?.fallback_ledger?.milestones || [] };
    renderMilestones(milestones.milestones || []);
  } catch (e) {
    console.error(e);
  }
}

function appendCursor(url, cursor) {
  if (!url) return null;
  if (!cursor) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}cursor=${encodeURIComponent(cursor)}`;
}

async function loadMoreBurns() {
  if (!burnsCursor) return;
  const next = await fetchJson(appendCursor(CFG?.ledger_api?.burns_url, burnsCursor));
  const items = next?.items || [];
  if (items.length) appendBurnRows(items);
  burnsCursor = next?.next_cursor || null;
  document.getElementById('loadMoreBurns').hidden = !burnsCursor;
}

async function fetchJson(url) {
  if (!url) return null;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

function renderMetrics(m) {
  const start = m.start_supply ?? 1000000000;
  const goal = m.goal_supply ?? 23000000;
  const current = m.current_supply ?? start;
  const totalBurned = m.total_burned ?? Math.max(0, start - current);
  const pct = m.pct_to_goal ?? Math.max(0, Math.min(100, (totalBurned / Math.max(1, start - goal)) * 100));
  const lastAgo = m.last_burn_ts ? timeAgo(m.last_burn_ts) : '—';

  const cs = document.getElementById('currentSupply'); if (cs) cs.textContent = number(current) + ' tokens';
  const ks = document.getElementById('kpiStart'); if (ks) ks.textContent = number(start) + ' tokens';
  const kg = document.getElementById('kpiGoal'); if (kg) kg.textContent = number(goal) + ' tokens';

  setText('kpiTotalBurned', number(totalBurned));
  setText('kpiCurrentSupply', number(current));
  setText('kpiPctGoal', pct.toFixed(2) + '%');
  setText('kpiLastBurn', lastAgo);

  setText('weeklyPot', m.weekly_prize_pot != null ? number(m.weekly_prize_pot) + ' $BURN-E' : '—');
}

function renderBurns(items, nextCursor) {
  const body = document.getElementById('burnsBody');
  const empty = document.getElementById('burnsEmpty');
  const loadMore = document.getElementById('loadMoreBurns');
  if (!body) return;

  if (!body.dataset.init || !body.dataset.append) {
    body.innerHTML = '';
    body.dataset.init = '1';
  }
  if (!items || items.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    appendBurnRows(items);
  }

  burnsCursor = nextCursor;
  if (loadMore) loadMore.hidden = !nextCursor;
}

function appendBurnRows(items) {
  const body = document.getElementById('burnsBody');
  for (const it of items) {
    const tr = document.createElement('tr');

    const tdTime = document.createElement('td');
    tdTime.textContent = shortTime(it.timestamp);
    tr.appendChild(tdTime);

    const tdAmt = document.createElement('td');
    tdAmt.className = 'right amount';
    tdAmt.innerHTML = `${number(it.amount)} <span class="unit">$BURN-E</span>`;
    tr.appendChild(tdAmt);

    const tdType = document.createElement('td');
    const kind = (it.type || 'burn').replace('_',' ');
    const span = document.createElement('span');
    span.className = 'badge-pill';
    span.textContent = titleCase(kind);
    tdType.appendChild(span);
    tr.appendChild(tdType);

    const tdTx = document.createElement('td');
    const a = document.createElement('a');
    a.className = 'txhash';
    a.href = it.explorer_url || '#';
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = shortHash(it.tx_hash || '');
    tdTx.appendChild(a);
    tr.appendChild(tdTx);

    body.appendChild(tr);
  }
  body.dataset.append = '1';
}

function renderMilestones(milestones) {
  const wrap = document.getElementById('milestoneChips');
  if (!wrap) return;
  wrap.innerHTML = '';
  const list = milestones && milestones.length ? milestones : [
    { label: '900M', supply: 900000000, reached: false },
    { label: '500M', supply: 500000000, reached: false },
    { label: '100M', supply: 100000000, reached: false },
    { label: '23M (Goal)', supply: 23000000, reached: false }
  ];
  list.forEach(m => {
    const chip = document.createElement('span');
    chip.className = 'milestone-chip' + (m.reached ? ' reached' : '');
    chip.textContent = m.label;
    wrap.appendChild(chip);
  });
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function number(n) { try { return Number(n).toLocaleString(); } catch { return n; } }
function shortHash(h) { if (!h) return '—'; return h.slice(0,4) + '…' + h.slice(-4); }
function shortTime(ts) { if (!ts) return '—'; const d = new Date(ts); return d.toLocaleString(); }
function titleCase(s){ return (s||'').replace(/\b\w/g, c => c.toUpperCase()); }
function timeAgo(iso) {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function setupModal() {
  const backdrop = document.getElementById('subscribeBackdrop');
  const btnClose = document.getElementById('subscribeClose');
  const form = document.getElementById('subscribeForm');
  setTimeout(() => { if (backdrop) { backdrop.style.display = 'flex'; backdrop.setAttribute('aria-hidden','false'); } }, 30000);
  if (btnClose) btnClose.addEventListener('click', () => { backdrop.style.display = 'none'; backdrop.setAttribute('aria-hidden','true'); });
  if (form) form.addEventListener('submit', () => { setTimeout(() => { if (backdrop) backdrop.style.display = 'none'; }, 500); });
}

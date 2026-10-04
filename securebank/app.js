/* ============================================================
   SecureVault Bank — Application Logic
   Generates SQL queries from banking forms and sends them
   to the SQLInsight backend for ML-based injection detection.
   ============================================================ */

(function () {
  'use strict';

  // ===== STATE =====
  const state = {
    backendUrl: 'http://127.0.0.1:5000',
    connected: false,
    log: [],            // detection history
    logCounter: 0,
    sessionId: 'securebank-live',   // groups all SecureBank scans in SQLInsight dashboard
  };

  // ===== DOM REFS =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const DOM = {
    // Navbar
    navLinks: $$('.navbar__link'),
    statusDot: $('#status-dot'),
    statusText: $('#status-text'),
    navbar: $('#navbar'),

    // Config
    backendUrlInput: $('#backend-url'),
    testConnectionBtn: $('#test-connection-btn'),
    connectionInfo: $('#connection-info'),

    // Hero
    heroStartBtn: $('#hero-start-btn'),
    heroInjectBtn: $('#hero-inject-btn'),
    heroTerminalBody: $('#hero-terminal-body'),

    // Forms
    loginForm: $('#login-form'),
    searchForm: $('#search-form'),
    transferForm: $('#transfer-form'),

    // Result panel
    resultPanel: $('#result-panel'),
    queryCode: $('#query-code'),
    closeResultBtn: $('#close-result'),
    verdictCard: $('#verdict-card'),
    verdictIcon: $('#verdict-icon'),
    verdictLabel: $('#verdict-label'),
    confidenceFill: $('#confidence-fill'),
    confidenceValue: $('#confidence-value'),
    apiResponseCode: $('#api-response-code'),
    resultDetails: $('#result-details'),
    defenseStep: $('#defense-step'),
    defenseContent: $('#defense-content'),
    copyQueryBtn: $('#copy-query-btn'),

    // Detection log
    sectionHistory: $('#section-history'),
    logTbody: $('#log-tbody'),
    logEmpty: $('#log-empty'),
    logTable: $('#log-table'),
    statSafe: $('#stat-safe'),
    statMalicious: $('#stat-malicious'),
    statTotal: $('#stat-total'),
    clearLogBtn: $('#clear-log-btn'),

    // Sections
    formsSection: $('#forms-section'),
  };

  // ===== PARTICLES BACKGROUND =====
  function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    const particleCount = 60;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.3 + 0.05;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59, 130, 246, ${this.opacity})`;
        ctx.fill();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => { p.update(); p.draw(); });

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.04 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(animate);
    }
    animate();
  }

  // ===== SQL QUERY GENERATORS =====
  // These simulate what a vulnerable backend would produce (for educational purposes)

  function generateLoginQuery(username, password) {
    return `SELECT * FROM customers\nWHERE username = '${username}'\n  AND password = '${password}';`;
  }

  function generateSearchQuery(term, type) {
    const columnMap = {
      'account_number': 'account_no',
      'holder_name': 'holder_name',
      'branch': 'branch_code',
    };
    const col = columnMap[type] || 'account_no';
    return `SELECT account_no, holder_name, balance, branch_code, status\nFROM accounts\nWHERE ${col} = '${term}';`;
  }

  function generateTransferQuery(from, to, amount, memo) {
    return `BEGIN TRANSACTION;\n\nUPDATE accounts SET balance = balance - ${amount}\n  WHERE account_no = '${from}';\n\nUPDATE accounts SET balance = balance + ${amount}\n  WHERE account_no = '${to}';\n\nINSERT INTO transactions (from_acc, to_acc, amount, memo, ts)\n  VALUES ('${from}', '${to}', ${amount}, '${memo}', NOW());\n\nCOMMIT;`;
  }

  // ===== BACKEND COMMUNICATION =====
  async function checkBackendHealth() {
    try {
      const resp = await fetch(`${state.backendUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        state.connected = true;
        DOM.statusDot.className = 'status-dot connected';
        DOM.statusText.textContent = `v${data.version || '?'} · LR+RF ${data.rf_model_loaded ? 'Ready' : 'Loading'} · policy=${data.ensemble_policy || 'any'}`;
        DOM.connectionInfo.textContent = `Connected — dashboard: http://127.0.0.1:5000`;
        DOM.connectionInfo.className = 'info-chip connected';
        return true;
      }
    } catch (e) { /* fall through */ }

    state.connected = false;
    DOM.statusDot.className = 'status-dot error';
    DOM.statusText.textContent = 'Offline';
    DOM.connectionInfo.textContent = 'Backend not reachable — showing local analysis only';
    DOM.connectionInfo.className = 'info-chip error';
    return false;
  }

  async function scanQuery(query, sourceLabel, endpoint) {
    if (!state.connected) {
      return localAnalysis(query);
    }
    try {
      const resp = await fetch(`${state.backendUrl}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:      query,
          source:     'SecureVaultBank',
          endpoint:   endpoint || `/${sourceLabel.toLowerCase()}`,
          path:       endpoint || `/${sourceLabel.toLowerCase()}`,
          method:     'POST',
          source_ip:  '192.168.1.' + Math.floor(Math.random() * 254 + 1),
          session_id: state.sessionId,
        }),
      });
      if (resp.ok) {
        return await resp.json();
      }
      return localAnalysis(query);
    } catch (e) {
      return localAnalysis(query);
    }
  }

  // Fallback: basic heuristic detection when backend is offline
  function localAnalysis(query) {
    const q = query.toLowerCase();
    const patterns = [
      /'\s*or\s+'.*?'\s*=\s*'/i,
      /'\s*or\s+1\s*=\s*1/i,
      /;\s*drop\s+table/i,
      /;\s*delete\s+from/i,
      /;\s*update\s+.*\s+set\s+/i,
      /union\s+select/i,
      /--\s*$/m,
      /'\s*;\s*--/i,
      /admin'\s*--/i,
      /'\s*or\s+''='/i,
      /1\s*=\s*1/i,
      /sleep\s*\(/i,
      /benchmark\s*\(/i,
      /char\s*\(/i,
      /concat\s*\(/i,
      /0x[0-9a-f]+/i,
      /load_file/i,
      /into\s+outfile/i,
      /information_schema/i,
    ];

    let matchCount = 0;
    for (const p of patterns) {
      if (p.test(q)) matchCount++;
    }

    const isMalicious = matchCount >= 1;
    const confidence = isMalicious
      ? Math.min(0.65 + matchCount * 0.1, 0.99)
      : Math.max(0.7, 0.95 - q.length * 0.001);

    return {
      verdict: isMalicious ? 'Suspicious' : 'Normal',
      prediction: isMalicious ? 1 : 0,
      confidence: confidence,
      query: query,
      source: 'local-heuristic',
      _local: true,
    };
  }

  // ===== UI UPDATES =====

  function showResult(query, apiResult, formName) {
    DOM.resultPanel.style.display = 'block';
    DOM.queryCode.textContent = query;

    const isMalicious = apiResult.prediction === 1;
    const confidence = (apiResult.confidence * 100).toFixed(1);
    const action = apiResult.action || (isMalicious ? 'BLOCK' : 'ALLOW');
    const actionEmoji = { BLOCK: '🚫', ALLOW: '✅', REVIEW: '⚠️' }[action] || '🔍';
    const isLocal = apiResult._local;

    // Verdict card
    DOM.verdictCard.className = `verdict-card ${isMalicious ? 'malicious' : 'safe'}`;
    DOM.verdictIcon.textContent = isMalicious ? '🚨' : '✅';
    DOM.verdictLabel.textContent = isMalicious
      ? `${actionEmoji} [${action}] SQL INJECTION DETECTED — Query Blocked!`
      : `✓ [${action}] Query is SAFE — No injection detected${isLocal ? ' (local heuristic)' : ''}`;

    DOM.confidenceValue.textContent = confidence + '%';
    setTimeout(() => {
      DOM.confidenceFill.style.width = confidence + '%';
    }, 100);

    // API response
    DOM.apiResponseCode.textContent = JSON.stringify(apiResult, null, 2);
    DOM.resultDetails.style.display = 'block';

    // Defense step (only if malicious)
    if (isMalicious) {
      DOM.defenseStep.style.display = 'block';
      DOM.defenseContent.innerHTML = getDefenseHTML(query, formName);
    } else {
      DOM.defenseStep.style.display = 'none';
    }

    // Add to terminal
    addTerminalLine(query, isMalicious, confidence);

    // Add to log
    addLogEntry(query, apiResult, formName);

    // Scroll to result
    DOM.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getDefenseHTML(query, formName) {
    return `
      <h4>🔍 Attack Analysis</h4>
      <p>The input contains SQL injection patterns that attempt to manipulate the database query structure. 
         This could lead to unauthorized data access, data modification, or complete database compromise.</p>
      
      <h4>🛡️ Recommended Defenses</h4>
      
      <p><strong>1. Parameterized Queries (Prepared Statements):</strong></p>
      <p>Instead of string concatenation, use parameterized queries:</p>
      <pre><code>${getParameterizedExample(formName)}</code></pre>
      
      <p><strong>2. Input Validation & Sanitization:</strong></p>
      <p>Validate all user inputs against expected patterns (whitelist approach). 
         Reject or escape special characters like <code>'</code>, <code>;</code>, <code>--</code>, <code>/*</code>.</p>
      
      <p><strong>3. Least Privilege:</strong></p>
      <p>Database accounts used by the application should have minimal permissions — never use <code>root</code> or <code>sa</code> for web app connections.</p>
      
      <p><strong>4. Web Application Firewall (WAF):</strong></p>
      <p>Deploy a WAF to detect and block common SQL injection patterns before they reach the application.</p>
      
      <p><strong>5. ML-Based Detection (SQLInsight):</strong></p>
      <p>Use machine learning models like the one in this demo to detect sophisticated injection attempts that rule-based systems might miss.</p>
    `;
  }

  function getParameterizedExample(formName) {
    switch (formName) {
      case 'login':
        return `# Python (psycopg2 / mysql-connector)
cursor.execute(
    "SELECT * FROM customers WHERE username = %s AND password = %s",
    (username, password)
)

# Node.js (mysql2)
connection.execute(
    'SELECT * FROM customers WHERE username = ? AND password = ?',
    [username, password]
)`;
      case 'search':
        return `# Python
cursor.execute(
    "SELECT account_no, holder_name, balance FROM accounts WHERE account_no = %s",
    (search_term,)
)

# Node.js
connection.execute(
    'SELECT account_no, holder_name, balance FROM accounts WHERE account_no = ?',
    [searchTerm]
)`;
      case 'transfer':
        return `# Python
cursor.execute(
    "UPDATE accounts SET balance = balance - %s WHERE account_no = %s",
    (amount, from_account)
)
cursor.execute(
    "INSERT INTO transactions (from_acc, to_acc, amount, memo) VALUES (%s, %s, %s, %s)",
    (from_acc, to_acc, amount, memo)
)

# Node.js
connection.execute(
    'UPDATE accounts SET balance = balance - ? WHERE account_no = ?',
    [amount, fromAccount]
)`;
      default:
        return `cursor.execute("SELECT * FROM table WHERE col = %s", (user_input,))`;
    }
  }

  function addTerminalLine(query, isMalicious, confidence) {
    const body = DOM.heroTerminalBody;
    const ts = new Date().toLocaleTimeString();

    const line1 = document.createElement('div');
    line1.className = 'terminal__line';
    line1.innerHTML = `<span class="terminal__prompt">[${ts}]</span> <span class="terminal__output--info">Scanning query...</span>`;
    body.appendChild(line1);

    const line2 = document.createElement('div');
    line2.className = 'terminal__line';
    const shortQuery = query.replace(/\n/g, ' ').substring(0, 60) + (query.length > 60 ? '...' : '');
    line2.innerHTML = `<span class="terminal__prompt">→</span> <span class="terminal__cmd">${escapeHTML(shortQuery)}</span>`;
    body.appendChild(line2);

    const line3 = document.createElement('div');
    line3.className = 'terminal__line';
    if (isMalicious) {
      line3.innerHTML = `<span class="terminal__output--danger">🚨 MALICIOUS (${confidence}% confidence) — BLOCKED</span>`;
    } else {
      line3.innerHTML = `<span class="terminal__output--safe">✅ SAFE (${confidence}% confidence) — ALLOWED</span>`;
    }
    body.appendChild(line3);

    const separator = document.createElement('div');
    separator.className = 'terminal__line terminal__output';
    separator.textContent = '────────────────────────────────';
    body.appendChild(separator);

    body.scrollTop = body.scrollHeight;
  }

  function addLogEntry(query, apiResult, formName) {
    state.logCounter++;
    const entry = {
      id: state.logCounter,
      timestamp: new Date().toLocaleString(),
      form: formName,
      query: query.replace(/\n/g, ' '),
      verdict: apiResult.verdict,
      prediction: apiResult.prediction,
      confidence: (apiResult.confidence * 100).toFixed(1),
      action: apiResult.action || (apiResult.prediction === 1 ? 'BLOCK' : 'ALLOW'),
      detectors: apiResult.detectors || [],
      latency: apiResult.latency_ms ? apiResult.latency_ms.toFixed(1) : null,
    };
    state.log.unshift(entry);

    // Update table
    DOM.logEmpty.style.display = 'none';
    DOM.logTable.style.display = 'table';

    const row = document.createElement('tr');
    row.style.animation = 'fadeInUp 0.3s ease';
    const actionCls = { BLOCK: 'color:#f87171', ALLOW: 'color:#4ade80', REVIEW: 'color:#fbbf24' }[entry.action] || '';
    const detSummary = entry.detectors.length
      ? entry.detectors.map(d => `${d.name}:${d.verdict === 'Suspicious' ? '🔴' : '🟢'}`).join(' ')
      : '';
    row.innerHTML = `
      <td>${entry.id}</td>
      <td>${entry.timestamp}</td>
      <td style="text-transform: capitalize">${entry.form}</td>
      <td title="${escapeHTML(entry.query)}"><code style="font-family: var(--font-mono); font-size: 0.78rem;">${escapeHTML(entry.query.substring(0, 55))}${entry.query.length > 55 ? '...' : ''}</code></td>
      <td>
        <span class="verdict-badge ${entry.prediction === 1 ? 'verdict-badge--malicious' : 'verdict-badge--safe'}">${entry.prediction === 1 ? '🚨' : '✅'} ${entry.verdict}</span>
        <span style="font-size:0.7rem;font-weight:700;margin-left:4px;${actionCls}">[${entry.action}]</span>
        ${detSummary ? `<div style="font-size:0.68rem;opacity:0.6;margin-top:2px">${detSummary}</div>` : ''}
      </td>
      <td><strong>${entry.confidence}%</strong>${entry.latency ? `<div style="font-size:0.7rem;opacity:0.5">${entry.latency}ms</div>` : ''}</td>
    `;

    if (DOM.logTbody.firstChild) {
      DOM.logTbody.insertBefore(row, DOM.logTbody.firstChild);
    } else {
      DOM.logTbody.appendChild(row);
    }

    updateStats();
  }

  function updateStats() {
    const safe = state.log.filter(e => e.prediction === 0).length;
    const mal = state.log.filter(e => e.prediction === 1).length;
    DOM.statSafe.textContent = safe;
    DOM.statMalicious.textContent = mal;
    DOM.statTotal.textContent = state.log.length;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== NAVIGATION =====

  function showSection(section) {
    DOM.navLinks.forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`).classList.add('active');

    if (section === 'history') {
      DOM.formsSection.style.display = 'none';
      DOM.sectionHistory.style.display = 'block';
    } else {
      DOM.formsSection.style.display = 'grid';
      DOM.sectionHistory.style.display = 'none';

      // Scroll to the relevant form card
      const targetCard = document.getElementById(`section-${section}`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCard.style.animation = 'none';
        targetCard.offsetHeight; // trigger reflow
        targetCard.style.animation = 'fadeInUp 0.4s ease';
      }
    }
  }

  // ===== EVENT HANDLERS =====

  function init() {
    initParticles();

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
      DOM.navbar.classList.toggle('scrolled', window.scrollY > 20);
    });

    // Navigation
    DOM.navLinks.forEach(link => {
      link.addEventListener('click', () => {
        showSection(link.dataset.section);
      });
    });

    // Config
    DOM.backendUrlInput.addEventListener('change', () => {
      state.backendUrl = DOM.backendUrlInput.value.replace(/\/+$/, '');
      checkBackendHealth();
    });

    DOM.testConnectionBtn.addEventListener('click', () => {
      state.backendUrl = DOM.backendUrlInput.value.replace(/\/+$/, '');
      DOM.connectionInfo.textContent = 'Testing...';
      DOM.connectionInfo.className = 'info-chip';
      checkBackendHealth();
    });

    // Hero buttons
    DOM.heroStartBtn.addEventListener('click', () => {
      document.getElementById('main-content').scrollIntoView({ behavior: 'smooth' });
    });

    DOM.heroInjectBtn.addEventListener('click', () => {
      // Fill login form with injection & submit
      const usernameInput = document.getElementById('login-username');
      const passwordInput = document.getElementById('login-password');
      usernameInput.value = "admin' OR '1'='1' --";
      passwordInput.value = 'anything';
      usernameInput.classList.add('injected');
      setTimeout(() => usernameInput.classList.remove('injected'), 1000);

      document.getElementById('main-content').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => DOM.loginForm.dispatchEvent(new Event('submit')), 800);
    });

    // Close result
    DOM.closeResultBtn.addEventListener('click', () => {
      DOM.resultPanel.style.display = 'none';
    });

    // Copy query
    DOM.copyQueryBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(DOM.queryCode.textContent).then(() => {
        DOM.copyQueryBtn.textContent = '✓';
        setTimeout(() => DOM.copyQueryBtn.textContent = '📋', 1500);
      });
    });

    // Clear log
    DOM.clearLogBtn.addEventListener('click', () => {
      state.log = [];
      state.logCounter = 0;
      DOM.logTbody.innerHTML = '';
      DOM.logEmpty.style.display = 'flex';
      DOM.logTable.style.display = 'none';
      updateStats();
    });

    // ===== FORM SUBMISSIONS =====

    // Login form
    DOM.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      if (!username && !password) return;

      const query = generateLoginQuery(username, password);
      const payloadToScan = (username + " " + password).trim();
      const btn = document.getElementById('login-submit');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Analyzing...';

      const result = await scanQuery(payloadToScan, 'Login', '/login');
      showResult(query, result, 'login');

      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Sign In & Analyze Query</span>`;
    });

    // Search form
    DOM.searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const term = document.getElementById('search-query').value;
      const type = document.getElementById('search-type').value;
      if (!term) return;

      const query = generateSearchQuery(term, type);
      const payloadToScan = term.trim();
      const btn = document.getElementById('search-submit');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Analyzing...';

      const result = await scanQuery(payloadToScan, 'Search', '/accounts/search');
      showResult(query, result, 'search');

      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Search & Analyze Query</span>`;
    });

    // Transfer form
    DOM.transferForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const from = document.getElementById('transfer-from').value;
      const to = document.getElementById('transfer-to').value;
      const amount = document.getElementById('transfer-amount').value;
      const memo = document.getElementById('transfer-memo').value;
      if (!from && !to) return;

      const query = generateTransferQuery(from, to, amount || '0', memo);
      const payloadToScan = (from + " " + to + " " + amount + " " + memo).trim();
      const btn = document.getElementById('transfer-submit');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Analyzing...';

      const result = await scanQuery(payloadToScan, 'Transfer', '/transfer');
      showResult(query, result, 'transfer');

      btn.disabled = false;
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Transfer & Analyze Query</span>`;
    });

    // ===== QUICK INJECT BUTTONS =====
    document.querySelectorAll('.example-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        if (target === 'login') {
          const u = document.getElementById('login-username');
          const p = document.getElementById('login-password');
          u.value = btn.dataset.username;
          p.value = btn.dataset.password;
          u.classList.add('injected');
          setTimeout(() => u.classList.remove('injected'), 1000);
        } else if (target === 'search') {
          const q = document.getElementById('search-query');
          q.value = btn.dataset.query;
          q.classList.add('injected');
          setTimeout(() => q.classList.remove('injected'), 1000);
        } else if (target === 'transfer') {
          document.getElementById('transfer-from').value = btn.dataset.from || '';
          document.getElementById('transfer-to').value = btn.dataset.to || '';
          document.getElementById('transfer-amount').value = btn.dataset.amount || '';
          document.getElementById('transfer-memo').value = btn.dataset.memo || '';
          const toInput = document.getElementById('transfer-to');
          toInput.classList.add('injected');
          setTimeout(() => toInput.classList.remove('injected'), 1000);
        }
      });
    });

    // Initial health check
    checkBackendHealth();
    // Re-check every 30 seconds
    setInterval(checkBackendHealth, 30000);
  }

  // ===== BOOT =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

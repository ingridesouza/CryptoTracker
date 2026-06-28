/* chat.js — Side panel AI assistant (streaming) */

(function () {
  const fab      = document.getElementById('chat-fab');
  const panel    = document.getElementById('chat-panel');
  const backdrop = document.getElementById('chat-backdrop');
  const messages = document.getElementById('panel-messages');
  const loader   = document.getElementById('panel-loader');
  const input    = document.getElementById('user-input');
  const sendBtn  = document.getElementById('send-btn');
  const clearBtn = document.getElementById('clear-btn');
  const closeBtn = document.getElementById('close-btn');

  if (!fab) return;

  // ── Markdown renderer ────────────────────────────────────
  function renderMarkdown(raw) {
    let t = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Blocos de código — preserva antes de qualquer outra substituição
    const codeBlocks = [];
    t = t.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
      codeBlocks.push(`<pre><code>${code.trimEnd()}</code></pre>`);
      return `\x00CODE${codeBlocks.length - 1}\x00`;
    });

    // Inline code
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Headers (##, ###, ####)
    t = t.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    t = t.replace(/^### (.+)$/gm,  '<h3>$1</h3>');
    t = t.replace(/^## (.+)$/gm,   '<h3>$1</h3>');
    t = t.replace(/^# (.+)$/gm,    '<h2>$1</h2>');

    // Bold e italic (bold primeiro para não conflitar)
    t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    t = t.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g,         '<em>$1</em>');

    // Horizontal rule
    t = t.replace(/^---+$/gm, '<hr>');

    // Listas não-ordenadas — agrupa linhas consecutivas
    t = t.replace(/((?:^[-*] .+\n?)+)/gm, block => {
      const items = block.trim().split('\n')
        .map(l => `<li>${l.replace(/^[-*] /, '')}</li>`)
        .join('');
      return `<ul>${items}</ul>\n`;
    });

    // Listas ordenadas
    t = t.replace(/((?:^\d+\. .+\n?)+)/gm, block => {
      const items = block.trim().split('\n')
        .map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`)
        .join('');
      return `<ol>${items}</ol>\n`;
    });

    // Parágrafos (separa por linha dupla)
    const BLOCK = /^<(h[1-6]|ul|ol|pre|hr|blockquote)/;
    t = t.split(/\n{2,}/).map(block => {
      block = block.trim();
      if (!block) return '';
      if (BLOCK.test(block) || block.startsWith('\x00CODE')) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Restaura blocos de código
    t = t.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[+i]);

    return t;
  }

  let history  = [];
  let streaming = false;

  // ── Panel open / close ───────────────────────────────────
  function openPanel() {
    panel.classList.add('open');
    backdrop.classList.add('visible');
    fab.classList.add('active');
    input.focus();
    loadContextStrip();
  }

  function closePanel() {
    panel.classList.remove('open');
    backdrop.classList.remove('visible');
    fab.classList.remove('active');
  }

  fab.addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel());
  backdrop.addEventListener('click', closePanel);
  closeBtn.addEventListener('click', closePanel);

  // ── Clear conversation ───────────────────────────────────
  clearBtn.addEventListener('click', () => {
    history = [];
    // Remove all rows except the welcome message (first .msg-row)
    const rows = messages.querySelectorAll('.msg-row:not(:first-child)');
    rows.forEach(r => r.remove());
    loader.style.display = 'none';
  });

  // ── Quick chips ──────────────────────────────────────────
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const msg = chip.dataset.msg;
      if (msg && !streaming) {
        input.value = msg;
        if (!panel.classList.contains('open')) openPanel();
        sendMessage();
      }
    });
  });

  // ── Input auto-resize ────────────────────────────────────
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => { if (!streaming) sendMessage(); });

  // ── Typewriter renderer ──────────────────────────────────
  // Recebe texto a qualquer velocidade da API e exibe a ~45 chars/s
  // com variação aleatória para parecer digitação natural.
  function createTypewriter(botDiv, onFinish) {
    let queue      = '';   // texto recebido da API ainda não exibido
    let displayed  = '';   // texto visível no DOM
    let apiDone    = false;
    let timer      = null;

    const MS_PER_TICK = 22;  // intervalo base entre ticks

    function tick() {
      if (displayed.length < queue.length) {
        // 1-4 chars por tick — variação aleatória dá ritmo mais humano
        const step = Math.floor(Math.random() * 3) + 1;
        displayed  = queue.slice(0, displayed.length + step);
        botDiv.innerHTML = renderMarkdown(displayed) + '<span class="stream-cur">▍</span>';
        scrollToBottom();
        timer = setTimeout(tick, MS_PER_TICK + Math.random() * 10);
      } else if (apiDone) {
        // API terminou e tudo foi exibido → renderiza markdown
        timer = null;
        onFinish(displayed);
      } else {
        // Aguarda próximo chunk — mantém cursor piscando
        timer = setTimeout(tick, MS_PER_TICK);
      }
    }

    return {
      push(text) {
        queue += text;
        if (!timer) tick();
      },
      done() { apiDone = true; },
      stop() { if (timer) { clearTimeout(timer); timer = null; } },
    };
  }

  // ── Send message (streaming) ─────────────────────────────
  async function sendMessage() {
    const text = input.value.trim();
    if (!text || streaming) return;

    streaming = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    appendMessage(text, 'user');
    loader.classList.add('visible');
    scrollToBottom();

    let fullText = '';
    let errored  = false;
    let botDiv   = null;
    let tw       = null;

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      loader.classList.remove('visible');

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      // Cria a linha do bot só após o loader sumir
      const botRow = createBotRow();
      botDiv = botRow.querySelector('.message');
      botDiv.classList.add('streaming-msg');

      tw = createTypewriter(botDiv, (finalText) => {
        botDiv.innerHTML = renderMarkdown(finalText);
        botDiv.classList.remove('streaming-msg');
        scrollToBottom();

        history.push({ role: 'user',      content: text });
        history.push({ role: 'assistant', content: finalText });
        if (history.length > 16) history = history.slice(-16);

        streaming = false;
        sendBtn.disabled = false;
        input.focus();
      });

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;

          let parsed;
          try { parsed = JSON.parse(raw); } catch { continue; }

          if (parsed.error) {
            errored = true;
            tw.stop();
            botDiv.textContent = 'Erro ao processar. Tente novamente.';
            botDiv.classList.remove('streaming-msg');
            break;
          }

          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            tw.push(delta);  // enfileira para o typewriter exibir gradualmente
          }
        }

        if (errored) break;
      }

      if (!errored) tw.done();  // sinaliza fim da API; typewriter finaliza ao esvaziar fila

    } catch (e) {
      loader.classList.remove('visible');
      errored = true;
      if (tw) tw.stop();
      if (botDiv) {
        botDiv.textContent = 'Erro de conexão. Tente novamente.';
        botDiv.classList.remove('streaming-msg');
      } else {
        // Erro antes de a resposta chegar: cria linha de erro diretamente
        const errRow = createBotRow();
        errRow.querySelector('.message').textContent = 'Erro de conexão. Tente novamente.';
      }
    }

    if (errored) {
      streaming = false;
      sendBtn.disabled = false;
      input.focus();
    }
    // sucesso: streaming e sendBtn são liberados dentro do callback do typewriter
  }

  // ── DOM helpers ──────────────────────────────────────────
  function appendMessage(text, side) {
    const row = document.createElement('div');
    row.className = `msg-row ${side}`;

    const avatar = document.createElement('div');
    avatar.className = `msg-avatar ${side}`;
    avatar.innerHTML = side === 'bot'
      ? '<i class="fa-solid fa-robot"></i>'
      : '<i class="fa-solid fa-user"></i>';

    const bubble = document.createElement('div');
    bubble.className = `message ${side}-message`;
    bubble.textContent = text;

    row.appendChild(avatar);
    row.appendChild(bubble);

    // Inserir antes do loader
    messages.insertBefore(row, loader);
    scrollToBottom();
    return row;
  }

  function createBotRow() {
    return appendMessage('', 'bot');
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  // ── Context strip ────────────────────────────────────────
  async function loadContextStrip() {
    try {
      const [gResp, pResp] = await Promise.all([
        fetch('/api/global'),
        fetch('/api/portfolio'),
      ]);

      if (gResp.ok) {
        const g = await gResp.json();

        // Fear & Greed
        const fg = g.fear_greed;
        if (fg) {
          const val = fg.value;
          const label = fg.label || '';
          const color = val <= 25 ? 'down' : val >= 60 ? 'up' : '';
          document.getElementById('ctx-fg-val').innerHTML =
            `<span class="${color}">${val} ${label}</span>`;
        }

        // BTC price via top cryptos (separate call, cached)
        fetch('/get-top-cryptos?limit=5').then(r => r.json()).then(data => {
          if (!Array.isArray(data)) return;
          const btc = data.find(c => c.id === 'bitcoin');
          if (!btc) return;
          const ch = btc.price_change_percentage_24h || 0;
          const cls = ch >= 0 ? 'up' : 'down';
          const sign = ch >= 0 ? '+' : '';
          document.getElementById('ctx-btc-val').innerHTML =
            `$${btc.current_price.toLocaleString('en-US', {maximumFractionDigits: 0})} <span class="${cls}">${sign}${ch.toFixed(1)}%</span>`;
        }).catch(() => {});
      }

      if (pResp.ok) {
        const p = await pResp.json();
        const holdings = p.holdings || p;
        if (Array.isArray(holdings) && holdings.length > 0) {
          let totalCost = 0, totalValue = 0;
          holdings.forEach(h => {
            totalCost  += (h.amount || 0) * (h.purchase_price || 0);
            totalValue += (h.current_value || h.amount * (h.current_price || h.purchase_price) || 0);
          });
          if (totalCost > 0) {
            const pnlPct = ((totalValue - totalCost) / totalCost * 100).toFixed(1);
            const cls  = pnlPct >= 0 ? 'up' : 'down';
            const sign = pnlPct >= 0 ? '+' : '';
            document.getElementById('ctx-pf-val').innerHTML =
              `<span class="${cls}">${sign}${pnlPct}%</span>`;
          }
        } else {
          document.getElementById('ctx-pf-val').textContent = 'Vazio';
        }
      }
    } catch {}
  }
})();

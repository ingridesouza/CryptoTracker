/* chat.js — Floating AI assistant widget */

(function () {
  const fab       = document.getElementById('chat-fab');
  const container = document.getElementById('chat-container');
  const messages  = document.getElementById('messages');
  const chatBox   = document.getElementById('chat-box');
  const input     = document.getElementById('user-input');
  const sendBtn   = document.getElementById('send-btn');
  const minBtn    = document.getElementById('minimize-btn');
  const closeBtn  = document.getElementById('close-btn');
  const loader    = document.getElementById('loader');

  if (!fab) return;

  // Toggle open/close via FAB
  fab.addEventListener('click', () => {
    container.classList.toggle('open');
    if (container.classList.contains('open')) input.focus();
  });

  // Minimize — just closes the window, FAB stays
  minBtn.addEventListener('click', () => container.classList.remove('open'));
  closeBtn.addEventListener('click', () => container.classList.remove('open'));

  // Send on click or Enter
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user-message');
    input.value = '';
    loader.classList.add('visible');
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      const r = await fetch('/api/get-bot-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await r.json();
      addMessage(data.response || 'Sem resposta.', 'bot-message');
    } catch {
      addMessage('Erro ao conectar com o assistente. Tente novamente.', 'bot-message');
    } finally {
      loader.classList.remove('visible');
    }
  }

  function addMessage(text, cls) {
    const div = document.createElement('div');
    div.className = `message ${cls}`;
    div.textContent = text;
    messages.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
})();

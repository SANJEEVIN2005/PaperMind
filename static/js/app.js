/* PaperMind — Frontend Logic */

const state = {
  fileHash: null,
  filename: null,
  chatHistory: [],
  quizQuestions: [],
  quizCurrent: 0,
  quizAnswers: {},
  quizNumQ: 5,
  quizDiff: 'medium',
  isLoading: false,
};

/* ── PANELS ── */
function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`panel-${name}`).classList.add('active');
  document.querySelector(`[data-panel="${name}"]`).classList.add('active');
}

function enableNavItems() {
  ['chat','summary','quiz'].forEach(id => {
    const el = document.getElementById(`nav-${id}`);
    if (el) el.disabled = false;
  });
}

/* ── UPLOAD ── */
const uploadZone = document.getElementById('upload-zone');
const fileInput  = document.getElementById('file-input');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Only PDF files are supported.', 'error'); return; }
  if (file.size > 50 * 1024 * 1024) { showToast('File too large. Max 50MB.', 'error'); return; }
  uploadFile(file);
}

function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  document.getElementById('upload-progress').style.display = 'block';
  document.getElementById('doc-card').style.display = 'none';
  startProgressAnimation();

  fetch('/api/upload', { method: 'POST', body: formData })
    .then(r => r.json())
    .then(data => {
      finishProgress();
      if (data.error) { showToast(data.error, 'error'); return; }

      state.fileHash = data.file_hash;
      state.filename = data.filename;
      state.chatHistory = [];

      document.getElementById('doc-name-sidebar').textContent = truncate(data.filename, 26);
      document.getElementById('doc-meta-sidebar').textContent = `${data.pages}p · ${formatNum(data.words)}w`;
      document.getElementById('sidebar-doc').style.display = 'flex';

      document.getElementById('card-title').textContent = data.filename;
      document.getElementById('stat-pages').textContent = data.pages;
      document.getElementById('stat-chunks').textContent = data.chunks;
      document.getElementById('stat-words').textContent = formatNum(data.words);
      document.getElementById('doc-card').style.display = 'block';

      enableNavItems();
      showToast(`✓ ${data.filename} is ready`, 'success');
    })
    .catch(err => {
      finishProgress();
      showToast('Upload failed. Check your connection.', 'error');
    });
}

let progressTimer, stepTimer, currentStep = 0;
const stepLabels = ['step-1','step-2','step-3','step-4','step-5'];
const stepPercents = [0, 20, 45, 68, 88];

function startProgressAnimation() {
  currentStep = 0;
  stepLabels.forEach(id => {
    const dot = document.getElementById(id)?.querySelector('.step-dot');
    if (dot) { dot.classList.remove('active','done'); }
  });
  document.getElementById('progress-fill').style.width = '0%';

  activateStep(0);
  let pct = 0;
  progressTimer = setInterval(() => {
    if (pct < 90) { pct += 0.8; document.getElementById('progress-fill').style.width = pct + '%'; }
  }, 80);

  let s = 0;
  stepTimer = setInterval(() => {
    s++;
    if (s < stepLabels.length) activateStep(s);
    else clearInterval(stepTimer);
  }, 1200);
}

function activateStep(idx) {
  for (let i = 0; i < idx; i++) {
    const dot = document.getElementById(stepLabels[i])?.querySelector('.step-dot');
    if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }
  }
  const dot = document.getElementById(stepLabels[idx])?.querySelector('.step-dot');
  if (dot) dot.classList.add('active');
}

function finishProgress() {
  clearInterval(progressTimer);
  clearInterval(stepTimer);
  document.getElementById('progress-fill').style.width = '100%';
  stepLabels.forEach(id => {
    const dot = document.getElementById(id)?.querySelector('.step-dot');
    if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }
  });
  setTimeout(() => { document.getElementById('upload-progress').style.display = 'none'; }, 900);
}

/* ── CHAT ── */
function fillQuestion(q) {
  const inp = document.getElementById('chat-input');
  inp.value = q;
  inp.focus();
  autoResize(inp);
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question || state.isLoading) return;
  if (!state.fileHash) { showToast('Please upload a PDF first.', 'error'); return; }

  document.getElementById('chat-empty').style.display = 'none';
  state.isLoading = true;
  document.getElementById('send-btn').disabled = true;

  appendMessage('user', question);
  input.value = '';
  input.style.height = 'auto';

  const typingId = appendTyping();
  scrollChat();

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, file_hash: state.fileHash, chat_history: state.chatHistory })
  })
  .then(r => r.json())
  .then(data => {
    removeTyping(typingId);
    state.isLoading = false;
    document.getElementById('send-btn').disabled = false;
    if (data.error) { appendMessage('assistant', `⚠ ${data.error}`); return; }
    appendMessage('assistant', data.answer, data.sources || []);
    state.chatHistory.push({ question, answer: data.answer });
    scrollChat();
  })
  .catch(() => {
    removeTyping(typingId);
    state.isLoading = false;
    document.getElementById('send-btn').disabled = false;
    appendMessage('assistant', '⚠ Something went wrong. Please try again.');
  });
}

function appendMessage(role, text, sources = []) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  div.appendChild(bubble);

  if (role === 'assistant' && sources.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-sources';
    sources.slice(0,3).forEach(s => {
      const chip = document.createElement('div');
      chip.className = 'source-chip';
      chip.innerHTML = `<span class="page-tag">pg ${s.page}</span><span class="source-text">${escHtml(s.snippet)}…</span>`;
      wrap.appendChild(chip);
    });
    div.appendChild(wrap);
  }

  msgs.appendChild(div);
  scrollChat();
}

let _typingN = 0;
function appendTyping() {
  const id = `typing-${_typingN++}`;
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = id;
  div.innerHTML = `<div class="typing-indicator"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  msgs.appendChild(div);
  return id;
}
function removeTyping(id) { document.getElementById(id)?.remove(); }
function scrollChat() { const w = document.getElementById('chat-window'); w.scrollTop = w.scrollHeight; }

/* ── SUMMARY ── */
function generateSummary() {
  if (!state.fileHash) { showToast('Upload a PDF first.', 'error'); return; }
  document.getElementById('gen-summary-btn').disabled = true;
  document.getElementById('summary-loading').style.display = 'flex';
  document.getElementById('summary-content').style.display = 'none';

  fetch(`/api/summary?hash=${state.fileHash}`)
    .then(r => r.json())
    .then(data => {
      document.getElementById('summary-loading').style.display = 'none';
      document.getElementById('gen-summary-btn').disabled = false;
      if (data.error) { showToast(data.error, 'error'); return; }

      const s = data.summary;
      document.getElementById('s-title').textContent = s.title || 'Research Paper';
      document.getElementById('s-overview').textContent = s.overview || '—';
      document.getElementById('s-problem').textContent = s.problem || '—';
      document.getElementById('s-approach').textContent = s.approach || '—';
      document.getElementById('s-limitations').textContent = s.limitations || '—';

      const fEl = document.getElementById('s-findings'); fEl.innerHTML = '';
      (s.key_findings || []).forEach(f => { const li = document.createElement('li'); li.textContent = f; fEl.appendChild(li); });

      const cEl = document.getElementById('s-contributions'); cEl.innerHTML = '';
      (s.contributions || []).forEach(c => { const li = document.createElement('li'); li.textContent = c; cEl.appendChild(li); });

      const kwEl = document.getElementById('s-keywords'); kwEl.innerHTML = '';
      (s.keywords || []).forEach(k => { const sp = document.createElement('span'); sp.className = 'keyword'; sp.textContent = k; kwEl.appendChild(sp); });

      document.getElementById('summary-content').style.display = 'block';
    })
    .catch(() => {
      document.getElementById('summary-loading').style.display = 'none';
      document.getElementById('gen-summary-btn').disabled = false;
      showToast('Failed to generate summary.', 'error');
    });
}

/* ── QUIZ ── */
function stepNum(delta) {
  state.quizNumQ = Math.max(3, Math.min(10, state.quizNumQ + delta));
  document.getElementById('num-q-display').textContent = state.quizNumQ;
}
function setDiff(btn) {
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.quizDiff = btn.dataset.diff;
}

function generateQuiz() {
  if (!state.fileHash) { showToast('Upload a PDF first.', 'error'); return; }
  document.getElementById('gen-quiz-btn').disabled = true;
  document.getElementById('quiz-loading').style.display = 'flex';
  document.getElementById('quiz-content').style.display = 'none';
  document.getElementById('quiz-result').style.display = 'none';
  document.getElementById('question-card').style.display = 'block';

  fetch('/api/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_hash: state.fileHash, num_questions: state.quizNumQ, difficulty: state.quizDiff })
  })
  .then(r => r.json())
  .then(data => {
    document.getElementById('quiz-loading').style.display = 'none';
    document.getElementById('gen-quiz-btn').disabled = false;
    if (data.error) { showToast(data.error, 'error'); return; }
    state.quizQuestions = data.questions;
    state.quizCurrent = 0;
    state.quizAnswers = {};
    document.getElementById('quiz-content').style.display = 'block';
    renderQuestion();
  })
  .catch(() => {
    document.getElementById('quiz-loading').style.display = 'none';
    document.getElementById('gen-quiz-btn').disabled = false;
    showToast('Failed to generate quiz.', 'error');
  });
}

function renderQuestion() {
  const q = state.quizQuestions[state.quizCurrent];
  const total = state.quizQuestions.length;
  const answered = state.quizAnswers[state.quizCurrent];

  document.getElementById('quiz-progress-label').textContent = `Question ${state.quizCurrent + 1} of ${total}`;
  document.getElementById('qpb-fill').style.width = `${((state.quizCurrent + 1) / total) * 100}%`;
  document.getElementById('question-text').textContent = q.question;

  const optEl = document.getElementById('options');
  optEl.innerHTML = '';
  q.options.forEach(opt => {
    const letter = opt[0];
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    if (answered) {
      btn.disabled = true;
      if (letter === q.correct) btn.classList.add('correct');
      else if (letter === answered) btn.classList.add('wrong');
    }
    btn.innerHTML = `<span class="option-letter">${letter}</span><span>${escHtml(opt.slice(3))}</span>`;
    btn.onclick = () => selectAnswer(letter);
    optEl.appendChild(btn);
  });

  const explEl = document.getElementById('explanation');
  if (answered) {
    explEl.innerHTML = `<strong>Explanation:</strong> ${escHtml(q.explanation)}`;
    explEl.style.display = 'block';
  } else {
    explEl.style.display = 'none';
  }

  document.getElementById('btn-prev').disabled = state.quizCurrent === 0;
  const isLast = state.quizCurrent === total - 1;
  const btnNext = document.getElementById('btn-next');
  btnNext.textContent = isLast ? 'Finish →' : 'Next →';
  btnNext.onclick = isLast ? finishQuiz : nextQuestion;
}

function selectAnswer(letter) {
  if (state.quizAnswers[state.quizCurrent] !== undefined) return;
  state.quizAnswers[state.quizCurrent] = letter;
  renderQuestion();
}

function nextQuestion() {
  if (state.quizCurrent < state.quizQuestions.length - 1) { state.quizCurrent++; renderQuestion(); }
}
function prevQuestion() {
  if (state.quizCurrent > 0) { state.quizCurrent--; renderQuestion(); }
}

function finishQuiz() {
  const total = state.quizQuestions.length;
  let correct = 0;
  state.quizQuestions.forEach((q, i) => { if (state.quizAnswers[i] === q.correct) correct++; });
  const pct = Math.round((correct / total) * 100);
  const label = pct >= 80 ? '🎯 Excellent! Great understanding of the paper.' :
                pct >= 60 ? '📖 Good job — review the sections you missed.' :
                '💡 Keep reading — you\'ll nail it next time!';
  document.getElementById('question-card').style.display = 'none';
  document.getElementById('result-score').textContent = `${correct}/${total}`;
  document.getElementById('result-pct').textContent = `${pct}%`;
  document.getElementById('result-label').textContent = label;
  document.getElementById('quiz-result').style.display = 'flex';
}

function restartQuiz() {
  state.quizCurrent = 0;
  state.quizAnswers = {};
  document.getElementById('question-card').style.display = 'block';
  document.getElementById('quiz-result').style.display = 'none';
  renderQuestion();
}

/* ── HELPERS ── */
function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast${type ? ' ' + type : ''}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function truncate(str, max) { return str.length > max ? str.slice(0, max) + '…' : str; }
function formatNum(n) { return Number(n).toLocaleString(); }

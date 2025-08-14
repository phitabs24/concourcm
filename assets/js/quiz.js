// Quiz utilities and core functions
// Functions: loadQuestions, renderQuestion, handleSubmit, showResults, shuffleArray

// Utility: Fisher-Yates shuffle (in place)
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// Helper: normalize various JSON schemas to the internal shape used by the app
// Internal shape: { id?: string, prompt: string, options: string[], answerIndex: number, explanation?: string, number?: number, year?: number|string }
const normalizeQuestion = (raw) => {
  // Already in internal shape
  if (raw && typeof raw.prompt === 'string' && Array.isArray(raw.options)) {
    return raw;
  }

  // New schema: { number, question, options, answer: 'A'|'B'|..., year }
  if (raw && (raw.question || raw.prompt) && Array.isArray(raw.options)) {
    const prompt = raw.question ?? raw.prompt;
    const options = raw.options;

    let answerIndex = -1;
    if (raw.hasOwnProperty('answerIndex') && Number.isInteger(raw.answerIndex)) {
      answerIndex = raw.answerIndex;
    } else if (raw.answer != null) {
      const ans = String(raw.answer).trim();
      // Try letter mapping first (A=0, B=1, ...)
      const letter = ans.toUpperCase().replace(/\.$/, '');
      if (/^[A-Z]$/.test(letter)) {
        answerIndex = letter.charCodeAt(0) - 'A'.charCodeAt(0);
      } else {
        // Try to match the option text
        const byText = options.findIndex((o) => String(o).trim() === ans);
        if (byText >= 0) answerIndex = byText;
        // Try to parse as number (support 0 or 1-based)
        const n = Number(ans);
        if (!Number.isNaN(n)) {
          if (n >= 0 && n < options.length) answerIndex = n;
          if (n > 0 && n <= options.length) answerIndex = n - 1;
        }
      }
    }

    return {
      id: raw.id ?? undefined,
      prompt,
      options,
      answerIndex,
      explanation: raw.explanation ?? undefined,
      number: raw.number ?? undefined,
      year: raw.year ?? undefined,
    };
  }

  // Fallback: try to stringify unknown shapes for visibility
  return {
    prompt: typeof raw === 'string' ? raw : JSON.stringify(raw),
    options: Array.isArray(raw?.options) ? raw.options : [],
    answerIndex: -1,
  };
};

// Load questions from a JSON source (string URL or array of URLs)
// Returns a Promise resolving to an array of normalized question objects
// Each question object shape:
// { id?: string, prompt: string, options: string[], answerIndex: number, explanation?: string, number?: number, year?: number|string }
const loadQuestions = async (source, limit = null) => {
  const toArray = (s) => (Array.isArray(s) ? s : [s]);
  const sources = toArray(source);

  const fetchJson = async (url) => {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`Failed to load questions: ${url} (${resp.status})`);
    return resp.json();
  };

  const settled = await Promise.allSettled(sources.map(fetchJson));
  const fulfilled = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
  const rejected = settled.filter(r => r.status === 'rejected');
  if (rejected.length > 0) {
    console.warn('Some question sources failed to load:', rejected.map(r => r.reason));
  }
  const combined = fulfilled.flat().map(normalizeQuestion);
  shuffleArray(combined);
  return limit ? combined.slice(0, limit) : combined;
};

// Render a single question into a container
// Adds radio inputs named `q-{index}` for grouping
const renderQuestion = (container, question, index) => {
  const article = document.createElement('article');
  article.className = 'question';

  const title = document.createElement('h4');
  const meta = [];
  if (question.year) meta.push(`[${question.year}]`);
  if (question.number != null) meta.push(`#${question.number}`);
  const metaText = meta.length ? ` ${meta.join(' ')}` : '';
  title.textContent = `${index + 1}. ${question.prompt}${metaText}`;
  article.appendChild(title);

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'options';

  question.options.forEach((opt, i) => {
    const id = `q${index}-opt${i}`;

    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `q-${index}`;
    input.value = String(i);
    input.id = id;
    input.required = true; // ensure at least one option per question is chosen

    const text = document.createElement('span');
    text.textContent = opt;

    label.setAttribute('for', id);
    label.appendChild(input);
    label.appendChild(text);
    optionsWrap.appendChild(label);
  });

  article.appendChild(optionsWrap);
  container.appendChild(article);
};

// Handle form submission, compute score and return a results object
const handleSubmit = (form, questions) => {
  const results = {
    total: questions.length,
    correct: 0,
    details: [] // { index, selected, correct }
  };

  questions.forEach((q, idx) => {
    const selected = form.querySelector(`input[name="q-${idx}"]:checked`);
    const selectedIndex = selected ? Number(selected.value) : null;
    const isCorrect = selectedIndex === q.answerIndex;
    if (isCorrect) results.correct += 1;
    results.details.push({ index: idx, selected: selectedIndex, correct: q.answerIndex });
  });

  return results;
};

// Show final results and list correct answers for those missed
const showResults = (container, results, questions) => {
  container.innerHTML = '';
  const score = document.createElement('p');
  score.innerHTML = `<strong>Score:</strong> ${results.correct} / ${results.total}`;
  container.appendChild(score);

  const missed = results.details.filter(d => d.selected !== d.correct);
  if (missed.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'results';

    const heading = document.createElement('h4');
    heading.textContent = 'Review';
    wrap.appendChild(heading);

    const list = document.createElement('ol');
    missed.forEach(({ index, selected, correct }) => {
      const li = document.createElement('li');
      const q = questions[index];
      const userAns = selected != null ? q.options[selected] : 'No answer';
      const correctAns = q.options[correct];
      const explanation = q.explanation ? ` — ${q.explanation}` : '';
      li.innerHTML = `<strong>Q${index + 1}.</strong> ${q.prompt}<br>` +
        `Your answer: <em>${userAns}</em><br>` +
        `Correct answer: <em>${correctAns}</em>${explanation}`;
      list.appendChild(li);
    });
    wrap.appendChild(list);
    container.appendChild(wrap);
  }

  // Add a convenience reload button at the bottom so users don't need to scroll up
  const bottomControls = document.createElement('div');
  bottomControls.style.marginTop = '1rem';
  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.className = 'btn';
  reloadBtn.textContent = 'Reload Questions';
  reloadBtn.addEventListener('click', () => {
    // Dispatch a custom event; each page can listen and call its own loadAndRender
    document.dispatchEvent(new CustomEvent('reload-questions'));
    // Scroll back to top for a fresh start
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  bottomControls.appendChild(reloadBtn);
  container.appendChild(bottomControls);
};

// Expose functions globally for ease of use in static pages
window.quiz = {
  shuffleArray,
  loadQuestions,
  renderQuestion,
  handleSubmit,
  showResults,
};

# PaperMind — Research Paper Assistant

AI-powered RAG app to chat with research papers, generate summaries, and take quizzes.
Uses **Groq** (free & fast) + **HuggingFace** embeddings (runs locally, no API needed).

---

## Quick Start

### 1. Get a FREE Groq API Key
Go to → https://console.groq.com
Sign up → API Keys → Create Key → Copy it

### 2. Setup

```bash
# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure .env

```bash
copy .env.example .env
```

Open `.env` and paste your key:
```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
FLASK_SECRET_KEY=anyrandomstring123
```

### 4. Run

```bash
python app.py
```

Open → http://localhost:5000

---

## Cost

| Service | Cost |
|---|---|
| Groq API (LLaMA 3.1 8B) | **FREE** (generous limits) |
| HuggingFace Embeddings | **FREE** (runs locally) |

**Completely free to use.**

---

## Stack

- **Flask** — backend
- **LangChain** — RAG pipeline  
- **Groq + LLaMA 3.1 8B** — LLM (fast & free)
- **HuggingFace all-MiniLM-L6-v2** — embeddings (local)
- **FAISS** — vector store
- **PyPDF** — PDF parsing

---

## Features

- Upload any research PDF
- Ask questions with source citations
- Generate structured paper summary
- Quiz yourself with MCQs (Easy / Medium / Hard)
- Conversation memory (last 5 turns)

---

## Troubleshooting

**`ModuleNotFoundError`** → Run `venv\Scripts\activate` first

**`AuthenticationError`** → Check your GROQ_API_KEY in `.env`

**Slow first upload** → HuggingFace model downloads once (~90MB), then cached

**Port in use** → Change `port=5000` to `port=5001` in `app.py`

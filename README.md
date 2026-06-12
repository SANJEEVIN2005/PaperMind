# PaperMind 🧠
> Chat with research papers using AI. Ask questions, get summaries, and test your understanding — all powered by RAG.

---

## What is PaperMind?

PaperMind is a **Retrieval-Augmented Generation (RAG)** web application that lets you upload any research paper (PDF) and interact with it using natural language. Instead of reading 30-page papers from start to finish, just ask what you need to know.

### Features

- **Ask the Paper** — Conversational Q&A with source citations and page references
- **Paper Summary** — Structured breakdown: problem, methodology, findings, contributions, keywords
- **Quiz Me** — Auto-generated MCQ quiz with 3 difficulty levels and explanations
- **Multi-Paper Support** — Upload multiple papers and switch between them in the sidebar
- **Conversation Memory** — Remembers last 4 turns of your chat per paper

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      USER BROWSER                        │
│              (HTML + CSS + Vanilla JS)                   │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP requests
┌─────────────────────▼───────────────────────────────────┐
│                   FLASK BACKEND                          │
│         /api/upload  /api/chat  /api/quiz                │
│               /api/summary                               │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                  RAG PIPELINE                            │
│                                                          │
│  PDF Upload                                              │
│      │                                                   │
│      ▼                                                   │
│  PyPDFLoader ──► Extract text per page                   │
│      │                                                   │
│      ▼                                                   │
│  RecursiveCharacterTextSplitter                          │
│                                                          │
│      │                                                   │
│      ▼                                                   │
│  HuggingFace Embeddings                                  │
│  (all-MiniLM-L6-v2, runs locally)                        │
│      │                                                   │
│      ▼                                                   │
│  FAISS Vector Store ──► Saved by MD5 hash                │
│                                                          │
│  At Query Time:                                          │
│  User Question ──► Embed ──► FAISS similarity search     │
│      │                                                   │
│      ▼                                                   │
│  Top-5 relevant chunks retrieved                         │
│      │                                                   │
│      ▼                                                   │
│  Groq LLaMA 3.1 8B ──► Answer + Sources                  │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Flask 3.0 |
| RAG Framework | LangChain |
| LLM | Groq — LLaMA 3.1 8B Instant (Free) |
| Embeddings | HuggingFace all-MiniLM-L6-v2 (Local, Free) |
| Vector Store | FAISS (Local, Persistent) |
| PDF Processing | PyPDF |
| Frontend | Vanilla JS + CSS (No framework) |

**Cost to run: $0** — Groq API is free, embeddings run locally.

---

## Project Structure

```
papermind/
├── app.py                  # Flask routes & API endpoints
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variable template
├── README.md
├── utils/
│   ├── __init__.py
│   └── rag_engine.py       # Full RAG pipeline
├── templates/
│   └── index.html          # Single-page UI
├── static/
│   ├── css/style.css       # Design system
│   └── js/app.js           # Frontend logic
├── uploads/                # Uploaded PDFs (auto-created, gitignored)
└── vectorstore/            # FAISS indices (auto-created, gitignored)
```

---

## Quick Start

### 1. Get a Free Groq API Key
Go to [console.groq.com](https://console.groq.com) → API Keys → Create Key

### 2. Clone & Setup

```bash
git clone https://github.com/SANJEEVIN2005/PaperMind.git
cd PaperMind

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and add your key:
```
GROQ_API_KEY=gsk_your_key_here
FLASK_SECRET_KEY=anyrandomstring
```

### 4. Run

```bash
python app.py
```

Open → **http://localhost:5000**

---

## How RAG Works Here

**The problem RAG solves:**
LLMs are trained on general data and have a knowledge cutoff. They can't answer questions about your specific documents.

**The RAG solution:**
1. Your PDF is split into small chunks (1000 characters each)
2. Each chunk is converted into a vector (numerical representation) using an embedding model
3. All vectors are stored in FAISS (a vector database)
4. When you ask a question, it's also converted to a vector
5. FAISS finds the most similar chunks to your question
6. Those chunks are sent to the LLM as context
7. The LLM answers based only on your document — no hallucination

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload` | Upload and process a PDF |
| GET | `/api/documents` | Get all uploaded documents |
| POST | `/api/set_active` | Switch active document |
| GET | `/api/summary?hash=...` | Generate paper summary |
| POST | `/api/chat` | Ask a question |
| POST | `/api/quiz` | Generate quiz questions |

---

## Key Design Decisions

- **FAISS over cloud vector DB** — files are cached by MD5 hash locally, re-uploading the same PDF skips re-embedding
- **HuggingFace embeddings over OpenAI** — completely free, runs on CPU, no API call needed
- **Direct LLM call over ConversationalRetrievalChain** — avoids stale memory bugs, gives varied responses per question
- **Per-document chat history** — switching papers restores that paper's conversation

---

## What I Learned Building This

- How RAG pipelines actually work end-to-end
- Why chunking strategy matters (too big = noise, too small = lost context)
- How vector similarity search works with FAISS
- The difference between embedding models and LLMs
- Why LangChain's memory can cause repeated outputs and how to work around it

-

---

*Built with LangChain, Groq, FAISS, and Flask*

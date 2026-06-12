import os
os.environ["GROQ_API_KEY"] = "your_groq_api_key"
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from dotenv import load_dotenv
load_dotenv()

import json
import hashlib
import traceback
from pathlib import Path
from typing import Optional

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain.prompts import PromptTemplate
from langchain.schema import Document

VECTORSTORE_DIR = Path("vectorstore")
VECTORSTORE_DIR.mkdir(exist_ok=True)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def get_embeddings():
    return HuggingFaceEmbeddings(
        model_name=EMBED_MODEL,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True}
    )


def get_llm(temperature: float = 0.2):
    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=temperature,
        groq_api_key=GROQ_API_KEY
    )


def get_file_hash(filepath: str) -> str:
    hasher = hashlib.md5()
    with open(filepath, "rb") as f:
        hasher.update(f.read())
    return hasher.hexdigest()


def process_pdf(filepath: str) -> dict:
    try:
        file_hash = get_file_hash(filepath)
        vs_path = VECTORSTORE_DIR / file_hash

        # Skip re-embedding if already processed
        if vs_path.exists():
            embeddings = get_embeddings()
            vectorstore = FAISS.load_local(
                str(vs_path), embeddings,
                allow_dangerous_deserialization=True
            )
            loader = PyPDFLoader(filepath)
            pages = loader.load()
            pages = [p for p in pages if p.page_content.strip()]
            full_text = " ".join([p.page_content for p in pages])
            return {
                "file_hash": file_hash,
                "total_pages": len(pages),
                "total_chunks": vectorstore.index.ntotal,
                "word_count": len(full_text.split()),
                "preview": pages[0].page_content[:300] if pages else ""
            }

        loader = PyPDFLoader(filepath)
        pages = loader.load()

        if not pages:
            raise ValueError("PDF appears to be empty or unreadable.")

        pages = [p for p in pages if p.page_content.strip()]
        if not pages:
            raise ValueError("No readable text found. This may be a scanned/image-based PDF.")

        total_pages = len(pages)
        full_text = " ".join([p.page_content for p in pages])
        word_count = len(full_text.split())

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        chunks = splitter.split_documents(pages)

        if not chunks:
            raise ValueError("Could not split PDF into chunks.")

        embeddings = get_embeddings()
        vectorstore = FAISS.from_documents(chunks, embeddings)
        vectorstore.save_local(str(vs_path))

        return {
            "file_hash": file_hash,
            "total_pages": total_pages,
            "total_chunks": len(chunks),
            "word_count": word_count,
            "preview": pages[0].page_content[:300]
        }
    except Exception as e:
        traceback.print_exc()
        raise e


def load_vectorstore(file_hash: str) -> Optional[FAISS]:
    vs_path = VECTORSTORE_DIR / file_hash
    if not vs_path.exists():
        return None
    embeddings = get_embeddings()
    return FAISS.load_local(
        str(vs_path), embeddings,
        allow_dangerous_deserialization=True
    )


def ask_question(file_hash: str, question: str, chat_history: list = None) -> dict:
    """
    Bug 3 fix: direct retrieval + LLM call instead of ConversationalRetrievalChain
    with memory — avoids stale context and repeated output templates.
    """
    vectorstore = load_vectorstore(file_hash)
    if not vectorstore:
        raise ValueError("Vectorstore not found. Please upload the PDF first.")

    # Retrieve relevant chunks
    docs = vectorstore.similarity_search(question, k=5)
    context = "\n\n---\n\n".join([d.page_content for d in docs])

    # Build conversation history string
    history_str = ""
    if chat_history:
        for turn in chat_history[-4:]:  # last 4 turns only
            history_str += f"User: {turn['question']}\nAssistant: {turn['answer']}\n\n"

    # Direct prompt — no chain memory issues
    prompt = f"""You are an expert research paper analyst. Answer the question based strictly on the paper context below.
Be specific, detailed and vary your response style based on what is asked.
Do not repeat a template. If asked for summary give summary. If asked a fact, give the fact directly.
If the answer is not in the context, say "This information is not available in the paper."

Paper Context:
{context}

{"Previous conversation:" + chr(10) + history_str if history_str else ""}

Question: {question}

Answer:"""

    llm = get_llm(temperature=0.3)
    response = llm.invoke(prompt)

    return {
        "answer": response.content.strip(),
        "source_documents": docs
    }


def generate_quiz(file_hash: str, num_questions: int = 5, difficulty: str = "medium") -> list:
    vectorstore = load_vectorstore(file_hash)
    if not vectorstore:
        raise ValueError("Vectorstore not found.")

    docs = vectorstore.similarity_search(
        "methodology results findings conclusions key concepts",
        k=8
    )
    context = "\n\n".join([d.page_content for d in docs])
    llm = get_llm(temperature=0.7)

    difficulty_desc = {
        "easy": "basic comprehension and recall",
        "medium": "understanding of methodology, findings, and implications",
        "hard": "critical analysis, statistical interpretation, and deep conceptual understanding"
    }.get(difficulty, "medium")

    quiz_prompt = f"""You are an academic assessment expert. Based on the following research paper content,
generate exactly {num_questions} multiple choice questions at {difficulty} difficulty level
(focusing on {difficulty_desc}).

Research Paper Content:
{context}

Return ONLY a valid JSON array:
[
  {{
    "question": "Question text here?",
    "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
    "correct": "A",
    "explanation": "Brief explanation referencing the paper."
  }}
]

Rules:
- Questions must come directly from the paper
- Exactly 4 options labeled A), B), C), D)
- correct field must be "A", "B", "C", or "D"
- Return ONLY the JSON array, no other text"""

    response = llm.invoke(quiz_prompt)
    raw = response.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def summarize_paper(file_hash: str) -> dict:
    vectorstore = load_vectorstore(file_hash)
    if not vectorstore:
        raise ValueError("Vectorstore not found.")

    sections = {
        "abstract_intro": "abstract introduction background motivation",
        "methodology": "methodology methods approach experiments dataset",
        "results": "results findings performance evaluation metrics",
        "conclusion": "conclusion future work limitations contributions"
    }

    section_texts = {}
    for key, query in sections.items():
        docs = vectorstore.similarity_search(query, k=3)
        section_texts[key] = "\n".join([d.page_content for d in docs])

    llm = get_llm(temperature=0.3)

    summary_prompt = f"""You are an expert research paper analyst. Analyze and provide a structured summary.

Abstract/Introduction:
{section_texts['abstract_intro']}

Methodology:
{section_texts['methodology']}

Results:
{section_texts['results']}

Conclusion:
{section_texts['conclusion']}

Return ONLY valid JSON, no markdown, no extra text:
{{
  "title": "Paper title or Research Paper",
  "overview": "2-3 sentence overview",
  "problem": "Core problem addressed",
  "approach": "Methodology used",
  "key_findings": ["Finding 1", "Finding 2", "Finding 3"],
  "contributions": ["Contribution 1", "Contribution 2"],
  "limitations": "Key limitations",
  "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]
}}"""

    response = llm.invoke(summary_prompt)
    raw = response.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
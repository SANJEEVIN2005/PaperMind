import os
os.environ["GROQ_API_KEY"] = "your_groq_api_key"

from dotenv import load_dotenv
load_dotenv()

import uuid
import traceback
from pathlib import Path
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from werkzeug.utils import secure_filename

from utils.rag_engine import process_pdf, ask_question, generate_quiz, summarize_paper

app = Flask(__name__)
app.secret_key = "supersecretkey123"
CORS(app)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() == "pdf"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Only PDF files are supported"}), 400

    filename = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4()}_{filename}"
    filepath = UPLOAD_DIR / unique_name
    file.save(str(filepath))

    try:
        meta = process_pdf(str(filepath))

        # ── Store ALL uploaded docs in session, not just the latest ──
        if "documents" not in session:
            session["documents"] = {}

        session["documents"][meta["file_hash"]] = {
            "filename": filename,
            "pages": meta["total_pages"],
            "chunks": meta["total_chunks"],
            "words": meta["word_count"],
        }
        session["active_hash"] = meta["file_hash"]
        session.modified = True

        return jsonify({
            "success": True,
            "filename": filename,
            "file_hash": meta["file_hash"],
            "pages": meta["total_pages"],
            "chunks": meta["total_chunks"],
            "words": meta["word_count"],
        })
    except Exception as e:
        traceback.print_exc()
        filepath.unlink(missing_ok=True)
        return jsonify({"error": str(e)}), 500


@app.route("/api/set_active", methods=["POST"])
def set_active():
    """Switch active document"""
    data = request.get_json()
    file_hash = data.get("file_hash")
    if not file_hash:
        return jsonify({"error": "No hash provided"}), 400
    session["active_hash"] = file_hash
    session.modified = True
    return jsonify({"success": True})


@app.route("/api/documents", methods=["GET"])
def get_documents():
    """Return all uploaded documents"""
    docs = session.get("documents", {})
    active = session.get("active_hash")
    return jsonify({"documents": docs, "active_hash": active})


@app.route("/api/summary", methods=["GET"])
def summary():
    file_hash = request.args.get("hash") or session.get("active_hash")
    if not file_hash:
        return jsonify({"error": "No document loaded"}), 400
    try:
        result = summarize_paper(file_hash)
        return jsonify({"success": True, "summary": result})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    question = data.get("question", "").strip()
    file_hash = data.get("file_hash") or session.get("active_hash")
    chat_history = data.get("chat_history", [])

    if not question:
        return jsonify({"error": "Question cannot be empty"}), 400
    if not file_hash:
        return jsonify({"error": "No document loaded. Please upload a PDF first."}), 400

    try:
        result = ask_question(file_hash, question, chat_history)
        answer = result.get("answer", "")
        sources = []
        for doc in result.get("source_documents", []):
            page = doc.metadata.get("page", 0) + 1
            snippet = doc.page_content[:200].strip()
            entry = {"page": page, "snippet": snippet}
            if entry not in sources:
                sources.append(entry)
        return jsonify({"success": True, "answer": answer, "sources": sources[:3]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/quiz", methods=["POST"])
def quiz():
    data = request.get_json()
    file_hash = data.get("file_hash") or session.get("active_hash")
    num_questions = max(3, min(10, int(data.get("num_questions", 5))))
    difficulty = data.get("difficulty", "medium")

    if not file_hash:
        return jsonify({"error": "No document loaded"}), 400
    try:
        questions = generate_quiz(file_hash, num_questions, difficulty)
        return jsonify({"success": True, "questions": questions})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Max 50MB"}), 413


if __name__ == "__main__":
    app.run(debug=True, port=5000)
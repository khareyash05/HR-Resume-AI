import json
import os
import re
from json.decoder import JSONDecodeError
from pathlib import Path

from docx import Document as DocxDocument
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pypdf import PdfReader


def read_resume_text(path):
    ext = Path(path).suffix.lower()

    if ext == ".pdf":
        reader = PdfReader(path)
        parts = []
        for page in reader.pages:
            try:
                parts.append(
                    page.extract_text() or ""
                )  # this is required for if any page is balnck, it will return None ,causing join to fail
            except Exception:  # skip bad page if any
                continue
        return "\n".join(parts).strip()

    if ext in (".docx", ".doc"):
        doc = DocxDocument(path)
        texts = []
        for p in doc.paragraphs:
            texts.append(p.text)
        return "\n".join(texts).strip()

    raise ValueError(f"Unsupported file type: {ext}")


EXTRACTION_PROMPT = """You are a resume parser. Extract the following fields from the resume text.

  Return a strict JSON object with these keys:
  - name (string): full name of the candidate
  - email (string): primary email
  - phone (string): primary phone number with country code if available
  - company (string): the candidate's CURRENT or MOST RECENT company
  - designation (string): their CURRENT or MOST RECENT job title
  - skills (array of strings): up to 15 most relevant technical skills
  - confidence (object): for EACH of the above fields, a number from 0.0 to 1.0 indicating how confident you are in the extracted
  value. Use 0.0 if the field could not be found.

  Rules:
  - If a field is genuinely not present in the resume, set it to null and confidence 0.0.
  - Do not invent or guess. Lower confidence if the resume is ambiguous.
  - Return ONLY valid JSON. No prose, no markdown fences.
  """


def extract_fields(resume_text):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")

    model_name = os.getenv("GEMINI_MODEL", "gemini-3-pro-preview")
    llm = ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
    )

    resp = llm.invoke(
        [
            SystemMessage(content=EXTRACTION_PROMPT),
            HumanMessage(
                content=f"Resume:\n\n{resume_text[:15000]}"
            ),  # we use starting 15k chars only, also to prevent model context window overflow
        ]
    )

    if hasattr(resp, "content"):
        raw = resp.content
    else:
        raw = str(resp)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:  # in cases where LLM return something like Here is your JSON {}, using regex to find first block
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise
        data = json.loads(match.group(0))

    skills = data.get("skills", [])
    if isinstance(skills, str):
        parts = skills.split(",")
        skills = []
        for part in parts:
            cleaned = part.strip()
            if cleaned:
                skills.append(cleaned)

    confidence = data.get("confidence") or {}
    for key in ("name", "email", "phone", "company", "designation", "skills"):
        if key not in confidence:
            confidence[key] = 0.0

    return {
        "name": data.get("name"),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "company": data.get("company"),
        "designation": data.get("designation"),
        "skills": skills,
        "confidence": confidence,
    }

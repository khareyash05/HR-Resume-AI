import os

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI


@tool
def send_document_request(channel: str, recipient: str, subject: str, body: str) -> str:
    """Send a personalized PAN/Aadhaar document request to the candidate.

    Args:
        channel: 'email' or 'sms'.
        recipient: the email address or phone number to send to.
        subject: short subject line (used for email; can be empty for sms).
        body: the full personalized message body.
    """

    # in real scenarios, this would calls some smtp library to send email
    # or some sms library service
    # the above comment also allows LLM to look why this tool is used

    return f"Request queued via {channel} to {recipient}."


AGENT_SYSTEM_PROMPT = """You are an HR onboarding assistant. Your job is to request PAN and Aadhaar
  documents from a candidate after their resume has been parsed.

  You have one tool: send_document_request(channel, recipient, subject, body).

  Decision rules:
  - Prefer email if the candidate has one; otherwise use SMS to their phone.
  - The message must be polite, professional, and clearly personalized using the candidate's
    name, current company, and designation if available.
  - Briefly explain WHY the documents are needed (KYC / onboarding verification) and reassure
    about confidentiality.
  - Ask for clear scans/photos of: (1) PAN card, (2) Aadhaar card.
  - Keep email body to 5-9 sentences. Keep SMS body to 2-3 sentences.
  - Sign off as "HR Team".

  You MUST call the send_document_request tool exactly once. Do not reply with plain text only.
  """


def generate_request(candidate):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")

    model_name = os.getenv("GEMINI_MODEL", "gemini-3-pro-preview")
    llm = ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
    )

    # bind the tool so gemini's response comes back as expected format instead of hazy and unpredicatble formats
    llm_with_tools = llm.bind_tools([send_document_request])

    candidate_summary = (
        f"Name: {candidate.get('name') or 'unknown'}\n"
        f"Email: {candidate.get('email') or 'not provided'}\n"
        f"Phone: {candidate.get('phone') or 'not provided'}\n"
        f"Company: {candidate.get('company') or 'unknown'}\n"
        f"Designation: {candidate.get('designation') or 'unknown'}\n"
    )

    messages = [
        SystemMessage(content=AGENT_SYSTEM_PROMPT),
        HumanMessage(
            content=f"Candidate profile:\n{candidate_summary}\n\nDraft and send the document request now."
        ),
    ]

    resp = llm_with_tools.invoke(messages)

    tool_calls = resp.tool_calls
    if tool_calls:
        args = tool_calls[0].get("args") or {}
        return {
            "channel": args.get("channel", ""),
            "recipient": args.get("recipient", ""),
            "subject": args.get("subject", ""),
            "body": args.get("body", ""),
        }

    # if not working with tools, usoing a falllback
    return _fallback_request(candidate)


def _fallback_request(candidate):
    name = candidate.get("name") or "there"
    email = candidate.get("email")
    phone = candidate.get("phone")
    if email:
        return {
            "channel": "email",
            "recipient": email,
            "subject": "Document request: PAN and Aadhaar for onboarding",
            "body": (
                f"Hi {name},\n\n"
                "As part of your onboarding, please share clear scans of your PAN card and Aadhaar card. "
                "These are needed for KYC verification and will be handled confidentially.\n\n"
                "Thanks,\nHR Team"
            ),
        }
    return {
        "channel": "sms",
        "recipient": phone or "",
        "subject": "",
        "body": (
            f"Hi {name}, please share photos of your PAN and Aadhaar cards for onboarding KYC. "
            "Thanks, HR Team."
        ),
    }

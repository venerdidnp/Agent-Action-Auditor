from openai import OpenAI

from app.core.config import settings


def get_client() -> OpenAI:
    if not settings.groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy backend/.env.example to backend/.env and fill it in."
        )
    return OpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url)


def chat(messages: list[dict], system: str | None = None) -> str:
    client = get_client()
    full_messages: list[dict] = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)
    response = client.chat.completions.create(
        model=settings.groq_model,
        max_tokens=1024,
        messages=full_messages,
    )
    return response.choices[0].message.content or ""

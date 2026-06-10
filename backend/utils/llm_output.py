from __future__ import annotations

import json
import re
from typing import Any


def get_text_from_response(response: Any) -> str:
    """Extract text from LangChain response."""
    if hasattr(response, "content"):
        return response.content
    if isinstance(response, dict):
        if "messages" in response:
            return response["messages"][-1].content
        if "choices" in response:
            return response["choices"][0]["message"]["content"]
    return str(response)


def extract_think_and_result(text: str) -> tuple[str, str]:
    """Strip <think>...</think> blocks."""
    match = re.search(r"<think>(.*?)</think>", text, re.DOTALL)
    think = match.group(1).strip() if match else ""
    result = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    return think, result


def convert_json_output(text: str) -> dict[str, Any]:
    """Parse JSON from LLM output, handling markdown fences."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:].strip()
    if text.startswith("```"):
        text = text[3:].strip()
    if text.endswith("```"):
        text = text[:-3].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > 0:
            return json.loads(text[start:end])
        raise


def preprocess_response(
    response: Any,
    only_text: bool = True,
    exclude_think: bool = True,
    json_output: bool = True,
) -> Any:
    """Chain: extract text -> strip think -> parse JSON."""
    if only_text or exclude_think or json_output:
        response = get_text_from_response(response)
    if exclude_think:
        _, response = extract_think_and_result(response)
    if json_output:
        try:
            response = convert_json_output(response)
        except Exception:
            return {"error": "Invalid JSON output", "raw_content": response}
    return response

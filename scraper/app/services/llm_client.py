"""OpenRouter API client for Qwen extraction tasks."""
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings

logger = logging.getLogger(__name__)

# USD per 1M tokens — as of 2025-Q2, from openrouter.ai/models
_PRICING: dict[str, dict[str, float]] = {
    "qwen/qwen3.5-9b":                          {"input": 0.050, "output": 0.150},
    "qwen/qwen3-8b":                            {"input": 0.050, "output": 0.400},
    "qwen/qwen-2.5-7b-instruct":                {"input": 0.040, "output": 0.100},
    "qwen/qwen-2.5-72b-instruct":               {"input": 0.120, "output": 0.390},
    "deepseek/deepseek-chat-v3-0324":           {"input": 0.270, "output": 1.100},
    "deepseek/deepseek-chat":                   {"input": 0.270, "output": 1.100},
    "google/gemini-2.0-flash-lite-001":         {"input": 0.075, "output": 0.300},
    "mistralai/mistral-small-3.1-24b-instruct": {"input": 0.030, "output": 0.110},
    "meta-llama/llama-3.1-8b-instruct":         {"input": 0.020, "output": 0.050},
}


@dataclass
class LLMResult:
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int
    success: bool
    error: str | None = None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=15))
async def call_openrouter(
    messages: list[dict],
    model: str,
    temperature: float = 0.1,
    max_tokens: int = 4096,
    json_mode: bool = True,
) -> LLMResult:
    """Call OpenRouter API with retry logic."""
    if not settings.openrouter_api_key:
        return LLMResult(
            content='{"error": "OPENROUTER_API_KEY not configured"}',
            model=model, input_tokens=0, output_tokens=0,
            cost_usd=0.0, latency_ms=0, success=False,
            error="OPENROUTER_API_KEY not configured",
        )

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_site_url,
        "X-Title": settings.openrouter_site_name,
    }

    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        # Defensive response parsing — OpenRouter may return HTTP 200 with an
        # error payload (e.g. rate-limit, upstream failure) where `choices` is
        # null or the message object is missing.
        if data.get("error"):
            err = data["error"]
            msg = err.get("message") or str(err)
            raise ValueError(f"OpenRouter API error: {msg}")

        choices = data.get("choices") or []
        if not choices:
            raise ValueError(f"OpenRouter returned no choices (data: {str(data)[:200]})")
        first = choices[0] or {}
        message = first.get("message") or {}
        content = message.get("content") or ""

        latency = int((time.monotonic() - t0) * 1000)
        usage = data.get("usage", {})
        input_t = usage.get("prompt_tokens", 0)
        output_t = usage.get("completion_tokens", 0)
        pricing = _PRICING.get(model, {"input": 0.35, "output": 0.40})
        cost = (input_t * pricing["input"] + output_t * pricing["output"]) / 1_000_000

        return LLMResult(
            content=content,
            model=model,
            input_tokens=input_t,
            output_tokens=output_t,
            cost_usd=cost,
            latency_ms=latency,
            success=True,
        )

    except Exception as e:
        latency = int((time.monotonic() - t0) * 1000)
        logger.error("OpenRouter call failed: %s", e)
        return LLMResult(
            content="", model=model, input_tokens=0, output_tokens=0,
            cost_usd=0.0, latency_ms=latency, success=False, error=str(e),
        )


# ── Prompt builders ──────────────────────────────────────────────────────────

def build_classify_messages(article_text: str, reference_context: str = "", source_context: str = "") -> list[dict]:
    system = (
        "你是电子音乐活动信息分析专家。分析微信公众号文章内容，"
        "判断是否包含活动信息及信息完整度等级。请用JSON格式输出。"
    )
    if source_context:
        system += "\n\n## 来源信息\n" + source_context
    if reference_context:
        system += "\n\n以下是已知的场地、艺人和厂牌参考数据，分析时请留意是否出现这些已知名称：\n" + reference_context
    return [
        {
            "role": "system",
            "content": system,
        },
        {
            "role": "user",
            "content": (
                f"请分析以下文章，输出JSON：\n\n"
                f"文章内容：\n{article_text[:6000]}\n\n"
                "输出格式：\n"
                "{\n"
                '  "event_detected": true/false,\n'
                '  "event_name": "活动名或null",\n'
                '  "info_level": 1,  // 1=仅日期场地, 2=有阵容无时段, 3=完整时段表\n'
                '  "key_info": {\n'
                '    "date": "YYYY-MM-DD或null",\n'
                '    "venue": "场地或null",\n'
                '    "city": "城市或null",\n'
                '    "has_lineup": false,\n'
                '    "has_timetable": false,\n'
                '    "artists_mentioned": []\n'
                "  },\n"
                '  "next_check_priority": "high/medium/low"\n'
                "}"
            ),
        },
    ]


def build_extract_messages(article_text: str, reference_context: str = "", source_context: str = "") -> list[dict]:
    system = (
        "你是电子音乐活动Line-up解析专家。从文本中提取结构化的DJ/VJ/Performer时段表信息。"
        "特别注意渐进披露：先有阵容后有具体时段。请用JSON格式输出。"
    )
    if source_context:
        system += "\n\n## 来源信息\n" + source_context
    if reference_context:
        system += (
            "\n\n以下是已知的场地、艺人和厂牌参考数据，提取时请优先匹配这些已知名称"
            "（注意可能有别名、中英文混用的情况）：\n" + reference_context
        )
    return [
        {
            "role": "system",
            "content": system,
        },
        {
            "role": "user",
            "content": (
                f"请从以下活动推文中提取完整Line-up时段表：\n\n{article_text[:12000]}\n\n"
                "输出JSON格式：\n"
                "{\n"
                '  "extraction_confidence": 0.0,\n'
                '  "event": {"name": "", "date": "YYYY-MM-DD", "venue": "", "city": ""},\n'
                '  "status": "tba/partial/complete",\n'
                '  "stages": [\n'
                "    {\n"
                '      "name": "舞台名",\n'
                '      "slots": [\n'
                "        {\n"
                '          "start_time": "HH:MM",\n'
                '          "end_time": "HH:MM",\n'
                '          "artists": ["艺人名"],\n'
                '          "is_b2b": false,\n'
                '          "set_type": "DJ/Live/VJ/Hybrid",\n'
                '          "special_note": ""\n'
                "        }\n"
                "      ]\n"
                "    }\n"
                "  ],\n"
                '  "unresolved_text": []\n'
                "}"
            ),
        },
    ]


def build_diff_messages(old_content: str, new_content: str) -> list[dict]:
    return [
        {
            "role": "system",
            "content": "你是文本差异分析专家。对比活动文章两个版本，识别新增的时段表信息。请用JSON输出。",
        },
        {
            "role": "user",
            "content": (
                f"旧版本：\n{old_content[:4000]}\n\n"
                f"新版本：\n{new_content[:4000]}\n\n"
                "输出JSON：\n"
                "{\n"
                '  "has_changes": false,\n'
                '  "change_type": "timetable_added/lineup_expanded/info_corrected/none",\n'
                '  "new_slots": [],\n'
                '  "added_artists": [],\n'
                '  "removed_artists": [],\n'
                '  "summary": ""\n'
                "}"
            ),
        },
    ]

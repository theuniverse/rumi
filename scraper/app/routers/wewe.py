"""Proxy endpoints for WeWeRSS management API."""
import logging

import httpx
from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["wewe"])
logger = logging.getLogger(__name__)


@router.get("/wewe/accounts")
async def list_wewe_accounts():
    """
    Return the list of WeChat public accounts subscribed in WeWeRSS.
    Proxies to GET {rsshub_base}/feeds — accessible from the internal Docker network.
    Includes AUTH_CODE token if configured (WeWeRSS management API may require it).
    """
    base = settings.rsshub_base.rstrip("/")
    params: dict = {}
    if settings.wewe_auth_code:
        params["token"] = settings.wewe_auth_code

    try:
        # Use a fresh transport (retries=0) to avoid keep-alive pooling issues
        # with local port forwarders such as Podman Desktop's gvproxy.
        transport = httpx.AsyncHTTPTransport(retries=0)
        async with httpx.AsyncClient(timeout=10, transport=transport) as client:
            resp = await client.get(
                f"{base}/feeds",
                params=params,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("WeWeRSS /feeds fetch failed: %s", e)
        return {"ok": False, "accounts": [], "error": str(e)}

    # WeWeRSS returns a list; normalise field names across versions
    raw_list = data if isinstance(data, list) else data.get("data", data.get("items", []))
    accounts = []
    for item in raw_list:
        # id field: "id" or "mpId"
        mp_id = item.get("id") or item.get("mpId") or ""
        # name field: "name" or "mpName"
        name = item.get("name") or item.get("mpName") or mp_id
        if mp_id:
            accounts.append({
                "id": mp_id,
                "name": name,
                "feed_path": f"/feeds/{mp_id}.xml",
            })

    accounts.sort(key=lambda a: a["name"].lower())
    return {"ok": True, "accounts": accounts}

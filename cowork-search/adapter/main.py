import os

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


SEARXNG_URL = os.getenv(
    "SEARXNG_URL",
    "http://searxng:8080"
).rstrip("/")


app = FastAPI(
    title="Claude Cowork Search Adapter",
    version="1.0.0"
)


class SearchRequest(BaseModel):
    q: str = Field(min_length=1)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "searxng": SEARXNG_URL
    }


@app.post("/search")
async def search(request: SearchRequest):
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{SEARXNG_URL}/search",
                params={
                    "q": request.q,
                    "format": "json"
                }
            )

            response.raise_for_status()
            data = response.json()

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"SearXNG request failed: {exc}"
        )

    results = []

    for item in data.get("results", [])[:10]:
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "content": item.get("content", "")
        })

    return {
        "results": results
    }
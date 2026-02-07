"""Web search tool for the music agent to research input content."""

from __future__ import annotations

import httpx
import logging

log = logging.getLogger(__name__)


async def web_search(query: str, max_results: int = 5) -> str:
    """Search the web for information about a query.
    
    Args:
        query: The search query string
        max_results: Maximum number of results to return (default: 5)
        
    Returns:
        A formatted string with search results including titles and snippets
    """
    try:
        # Using DuckDuckGo as a free search option
        async with httpx.AsyncClient() as client:
            params = {
                "q": query,
                "format": "json",
                "no_html": 1,
                "max_results": max_results,
            }
            response = await client.get(
                "https://api.duckduckgo.com/",
                params=params,
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            
            results = []
            
            # Process abstract results
            if data.get("Abstract"):
                results.append(f"Summary: {data['Abstract']}")
            
            # Process related topics (similar to search results)
            if data.get("RelatedTopics"):
                for i, topic in enumerate(data["RelatedTopics"][:max_results]):
                    if isinstance(topic, dict):
                        title = topic.get("FirstURL", "")
                        snippet = topic.get("Text", "")
                        if snippet:
                            results.append(f"{i+1}. {snippet[:200]}\n   URL: {title}")
            
            if results:
                log.info(f"Web search results for '{query}': {len(results)} results")
                return "\n".join(results)
            else:
                return f"No results found for: {query}"
                
    except httpx.HTTPError as e:
        error_msg = f"Web search error: {str(e)}"
        log.error(error_msg)
        return error_msg
    except Exception as e:
        error_msg = f"Unexpected error during web search: {str(e)}"
        log.error(error_msg)
        return error_msg

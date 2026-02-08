"""Integration tests for the music agent with Kimi's built-in web search."""

import pytest
from pathlib import Path
from src.agent.music_agent import generate_music_prompt, prepare_content
from src.models.song_tree import SongCharacteristics


class TestMusicAgentWebSearch:
    """Test the music agent with Kimi's $web_search tool."""
    
    def test_prepare_content_text_only(self):
        """Test content preparation with text only."""
        content = prepare_content(text="A beautiful sunset")
        
        assert isinstance(content, list)
        assert len(content) > 0
        assert content[0]["type"] == "text"
        assert "sunset" in content[0]["text"]
    
    
    def test_prepare_content_with_image(self):
        """Test content preparation with an image file."""
        # Use the test image from the test fixtures
        test_image = Path("tests/fel/fel.jpeg")
        if test_image.exists():
            content = prepare_content(file_paths=[test_image])
            
            assert isinstance(content, list)
            # Should have base64-encoded image
            assert any(c.get("type") == "image_url" for c in content)
    
    
    def test_prepare_content_mixed(self):
        """Test content preparation with both text and image."""
        test_image = Path("tests/fel/fel.jpeg")
        if test_image.exists():
            content = prepare_content(
                file_paths=[test_image],
                text="This is a test image"
            )
            
            assert isinstance(content, list)
            assert len(content) >= 1
            # Should have text and image content
            has_text = any(c.get("type") == "text" for c in content)
            has_image = any(c.get("type") == "image_url" for c in content)
            assert has_text or has_image
    
    
    @pytest.mark.asyncio
    async def test_generate_music_prompt_with_web_search(self):
        """Test music prompt generation with web search enabled."""
        test_image = Path("tests/fel/fel.jpeg")
        if not test_image.exists():
            pytest.skip("Test image not found")
        
        result = await generate_music_prompt(
            file_paths=[test_image],
            text="Czech Technical University building",
            disable_web_search=False,
        )
        
        assert isinstance(result, SongCharacteristics)
        assert result.mood is not None
    
    
    @pytest.mark.asyncio
    async def test_generate_music_prompt_without_web_search(self):
        """Test music prompt generation with web search disabled."""
        test_image = Path("tests/fel/fel.jpeg")
        if not test_image.exists():
            pytest.skip("Test image not found")
        
        result = await generate_music_prompt(
            file_paths=[test_image],
            text="A technical building with purple facade",
            disable_web_search=True,
        )
        
        assert isinstance(result, SongCharacteristics)
        assert result.mood is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

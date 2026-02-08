import json

import pytest
from pydantic import ValidationError

from src.models.song_tree import SongCharacteristics, SongNode


class TestSongNode:
    def test_simple_leaf_node(self):
        """Test creating a simple leaf node with just a name and value."""
        node = SongNode(name="Title", value="A Moment's Echo")
        assert node.name == "Title"
        assert node.value == "A Moment's Echo"
        assert node.children == []

    def test_node_with_children(self):
        """Test creating a node with child nodes."""
        children = [
            SongNode(name="Piano", value=None),
            SongNode(name="Strings", value=None),
        ]
        node = SongNode(name="Instruments", children=children)
        assert len(node.children) == 2
        assert node.children[0].name == "Piano"

    def test_node_with_list_value(self):
        """Test node with a list as value."""
        node = SongNode(
            name="Moods",
            value=["nostalgic", "hopeful", "introspective"]
        )
        assert isinstance(node.value, list)
        assert len(node.value) == 3

    def test_node_with_metadata(self):
        """Test node with metadata attributes."""
        node = SongNode(
            name="Intro",
            value=None,
            metadata={"duration": "8 bars", "energy": 0.2}
        )
        assert node.metadata["duration"] == "8 bars"
        assert node.metadata["energy"] == 0.2

    def test_node_with_numeric_value(self):
        """Test node with numeric values."""
        node = SongNode(name="BPM", value=120)
        assert node.value == 120
        assert isinstance(node.value, int)

    def test_node_with_dict_value(self):
        """Test node with dict as value."""
        node = SongNode(
            name="Configuration",
            value={"tempo": 120, "key": "C minor"}
        )
        assert isinstance(node.value, dict)
        assert node.value["tempo"] == 120

    def test_deeply_nested_structure(self):
        """Test creating a deeply nested tree structure."""
        leaf = SongNode(name="Reverb", value="high")
        characteristic = SongNode(name="Characteristics", children=[leaf])
        instrument = SongNode(name="Piano", children=[characteristic])
        instrumentation = SongNode(name="Instrumentation", children=[instrument])
        song = SongNode(name="Song", children=[instrumentation])
        
        assert song.children[0].name == "Instrumentation"
        assert song.children[0].children[0].name == "Piano"
        assert song.children[0].children[0].children[0].children[0].value == "high"

    def test_node_missing_required_name(self):
        """Test that name is required."""
        with pytest.raises(ValidationError):
            SongNode()

    def test_node_with_mixed_types(self):
        """Test node with various types in metadata and value."""
        node = SongNode(
            name="MixedData",
            value=[1, "two", 3.0],
            metadata={
                "count": 3,
                "label": "mixed",
                "active": True,
                "nested": {"key": "value"}
            }
        )
        assert len(node.value) == 3
        assert node.metadata["nested"]["key"] == "value"


class TestSongCharacteristics:
    def test_simple_characteristics(self):
        """Test creating minimal SongCharacteristics with just metadata."""
        root = SongNode(
            name="Song",
            children=[
                SongNode(name="Title", value="Test Song"),
                SongNode(name="Genre", value="electronic")
            ]
        )
        song = SongCharacteristics(root=root)
        assert song.root.name == "Song"
        assert len(song.root.children) == 2

    def test_complex_tree_structure(self):
        """Test complex nested tree matching real song characteristics."""
        root = SongNode(
            name="Song",
            children=[
                SongNode(
                    name="Instrumentation",
                    children=[
                        SongNode(
                            name="Piano",
                            metadata={"role": "primary"},
                            children=[
                                SongNode(name="Characteristics", value=["warm", "reverberant"])
                            ]
                        ),
                        SongNode(
                            name="Strings",
                            metadata={"role": "supporting"},
                            children=[
                                SongNode(name="Characteristics", value=["sustained", "distant"])
                            ]
                        )
                    ]
                ),
                SongNode(
                    name="Structure",
                    children=[
                        SongNode(
                            name="Intro",
                            metadata={"duration": "8 bars", "energy": 0.2},
                            children=[
                                SongNode(name="Description", value="minimal piano entrance")
                            ]
                        )
                    ]
                )
            ]
        )
        song = SongCharacteristics(root=root)
        
        assert song.root.children[0].name == "Instrumentation"
        assert len(song.root.children[0].children) == 2
        assert song.root.children[0].children[0].metadata["role"] == "primary"

    def test_json_serialization(self):
        """Test that SongCharacteristics serializes to JSON correctly."""
        root = SongNode(
            name="Song",
            children=[
                SongNode(name="Title", value="Serialization Test"),
                SongNode(
                    name="Instruments",
                    children=[
                        SongNode(name="Piano", value=None),
                        SongNode(name="Synth", value=None)
                    ]
                )
            ]
        )
        song = SongCharacteristics(root=root)
        
        json_str = song.model_dump_json()
        assert isinstance(json_str, str)
        
        parsed = json.loads(json_str)
        assert parsed["root"]["name"] == "Song"
        assert len(parsed["root"]["children"]) == 2

    def test_deserialization_from_dict(self):
        """Test creating SongCharacteristics from dict."""
        data = {
            "root": {
                "name": "Song",
                "value": None,
                "children": [
                    {"name": "Title", "value": "Test", "children": [], "metadata": {}},
                    {
                        "name": "Genre",
                        "value": "ambient",
                        "children": [],
                        "metadata": {}
                    }
                ],
                "metadata": {}
            }
        }
        
        song = SongCharacteristics(**data)
        assert song.root.name == "Song"
        assert song.root.children[0].value == "Test"

    def test_round_trip_serialization(self):
        """Test JSON serialization and deserialization."""
        original = SongCharacteristics(
            root=SongNode(
                name="Song",
                children=[
                    SongNode(name="Title", value="Round Trip Test"),
                    SongNode(
                        name="Details",
                        children=[
                            SongNode(name="BPM", value=120),
                            SongNode(name="Key", value="C minor")
                        ]
                    )
                ]
            )
        )
        
        # Serialize to JSON
        json_str = original.model_dump_json()
        
        # Deserialize back
        restored = SongCharacteristics.model_validate_json(json_str)
        
        assert restored.root.name == original.root.name
        assert len(restored.root.children) == len(original.root.children)
        assert restored.root.children[0].value == original.root.children[0].value

    def test_arbitrary_tree_flexibility(self):
        """Test that tree can organize data in any way the model decides."""
        # Model might decide to organize by emotion instead of structure
        root = SongNode(
            name="Song",
            children=[
                SongNode(
                    name="Emotional Narrative",
                    children=[
                        SongNode(
                            name="Act I: Longing",
                            metadata={"intensity": 0.2, "duration": "25%"},
                            children=[
                                SongNode(name="Instruments", value=["piano", "ambient pads"]),
                                SongNode(name="Mood", value="contemplative")
                            ]
                        ),
                        SongNode(
                            name="Act II: Discovery",
                            metadata={"intensity": 0.6, "duration": "50%"},
                            children=[
                                SongNode(name="Instruments", value=["piano", "strings", "synth"]),
                                SongNode(name="Mood", value="hopeful")
                            ]
                        ),
                        SongNode(
                            name="Act III: Catharsis",
                            metadata={"intensity": 0.9, "duration": "25%"},
                            children=[
                                SongNode(name="Instruments", value=["full band", "choir"]),
                                SongNode(name="Mood", value="triumphant")
                            ]
                        )
                    ]
                )
            ]
        )
        
        song = SongCharacteristics(root=root)
        assert song.root.children[0].children[0].name == "Act I: Longing"
        assert len(song.root.children[0].children) == 3

    def test_empty_children_list(self):
        """Test node with empty children list."""
        node = SongNode(name="Terminal Node", value="leaf", children=[])
        song = SongCharacteristics(root=node)
        assert song.root.children == []

    def test_null_values_allowed(self):
        """Test that None values are allowed (useful for branch nodes)."""
        root = SongNode(
            name="Song",
            value=None,
            children=[
                SongNode(name="Child1", value="has value"),
                SongNode(name="Child2", value=None)
            ]
        )
        song = SongCharacteristics(root=root)
        assert song.root.value is None
        assert song.root.children[1].value is None

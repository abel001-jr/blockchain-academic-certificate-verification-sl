"""Certificate branding presets — shared source for API + PDF generation."""

CERT_PRESETS = {
    "classic_navy": {
        "id": "classic_navy",
        "label": "Classic Navy",
        "primary": "#022448",
        "accent": "#7b5900",
        "bg": "#FAF7F2",
        "surface": "#ffffff",
        "muted": "#43474e",
    },
    "forest_green": {
        "id": "forest_green",
        "label": "Forest Green",
        "primary": "#1B4332",
        "accent": "#B08968",
        "bg": "#F5F7F4",
        "surface": "#ffffff",
        "muted": "#495057",
    },
    "deep_burgundy": {
        "id": "deep_burgundy",
        "label": "Deep Burgundy",
        "primary": "#4A0E1F",
        "accent": "#C9A227",
        "bg": "#FBF6F4",
        "surface": "#ffffff",
        "muted": "#5C4A4A",
    },
    "slate_blue": {
        "id": "slate_blue",
        "label": "Slate Blue",
        "primary": "#1E3A5F",
        "accent": "#5B8DEF",
        "bg": "#F4F7FB",
        "surface": "#ffffff",
        "muted": "#4A5568",
    },
    "warm_charcoal": {
        "id": "warm_charcoal",
        "label": "Warm Charcoal",
        "primary": "#2D2A26",
        "accent": "#C4784A",
        "bg": "#F7F5F2",
        "surface": "#ffffff",
        "muted": "#5C574F",
    },
}


def get_preset(preset_id: str) -> dict:
    return CERT_PRESETS.get(preset_id) or CERT_PRESETS["classic_navy"]

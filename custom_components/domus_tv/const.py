"""Constants for Domus TV."""

DOMAIN = "domus_tv"
STORAGE_KEY = "domus_tv"
STORAGE_VERSION = 1

PANEL_URL = "domus-tv"
PANEL_COMPONENT = "domus-tv-panel"
STATIC_URL = "/domus_tv_static"

PAIR_CODE_TTL = 600  # seconds a pairing code stays valid
PAIR_MAX_PENDING = 5
TOKEN_LIFETIME_DAYS = 3650

TILE_TYPES = (
    "auto", "toggle", "light", "button", "sensor", "cover",
    "climate", "camera", "lock", "media", "header",
)

# Attributes forwarded to the TV, by domain (keeps polling payloads small).
FORWARDED_ATTRIBUTES = {
    "light": ("brightness", "color_mode", "supported_color_modes", "rgb_color"),
    "cover": ("current_position", "supported_features"),
    "climate": (
        "current_temperature", "temperature", "target_temp_low", "target_temp_high",
        "hvac_modes", "hvac_action", "min_temp", "max_temp", "target_temp_step",
    ),
    "media_player": ("media_title", "media_artist", "volume_level", "is_volume_muted", "source"),
    "weather": ("temperature", "temperature_unit", "humidity"),
    "fan": ("percentage",),
    "camera": (),
    "sensor": ("state_class",),
}
COMMON_ATTRIBUTES = ("friendly_name", "unit_of_measurement", "icon", "device_class", "entity_picture")

from dataclasses import dataclass, field


@dataclass
class PluginInfo:
    name: str
    display_name: str
    description: str
    required_tools: list[str]
    enabled_by_default: bool = False
    always_enabled: bool = False


_REGISTRY: dict[str, PluginInfo] = {}


def register(info: PluginInfo) -> None:
    _REGISTRY[info.name] = info


def all_plugins() -> list[PluginInfo]:
    return list(_REGISTRY.values())


def get_plugin(name: str) -> PluginInfo | None:
    return _REGISTRY.get(name)


def is_valid_plugin(name: str) -> bool:
    return name in _REGISTRY

from abc import ABC, abstractmethod


class Plugin(ABC):
    name: str
    display_name: str
    description: str
    capabilities: list[str]
    always_enabled: bool = False

    @abstractmethod
    def solve(self, problem: str) -> dict:
        pass

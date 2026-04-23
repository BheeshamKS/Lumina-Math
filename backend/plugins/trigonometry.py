from plugins.base import Plugin
from plugins.registry import register, PluginInfo


class TrigonometryPlugin(Plugin):
    name = "trigonometry"
    display_name = "Trigonometry"
    description = "Trigonometric identities, inverse trig, and simplification."
    capabilities = ["trigsimp", "asin", "acos", "atan", "trig_identities"]

    def solve(self, problem: str) -> dict:
        from services.math_engine import solve_problem
        return solve_problem(problem)


register(PluginInfo(
    name="trigonometry",
    display_name="Trigonometry",
    description="Trigonometric identities and inverse functions.",
    required_tools=["trigsimp", "asin", "acos", "atan"],
    enabled_by_default=False,
))

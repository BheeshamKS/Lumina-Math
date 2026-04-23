from plugins.base import Plugin
from plugins.registry import register, PluginInfo
from services.math_engine import solve_problem


class CorePlugin(Plugin):
    name = "core"
    display_name = "Core Math"
    description = "Basic arithmetic, algebra, and equation solving. Always active."
    capabilities = ["arithmetic", "algebra", "equations", "simplify", "factor", "expand"]
    always_enabled = True

    def solve(self, problem: str) -> dict:
        return solve_problem(problem)


register(PluginInfo(
    name="core",
    display_name="Core Math",
    description="Basic arithmetic, algebra, and equation solving. Always active.",
    required_tools=["solve", "simplify", "expand", "factor"],
    enabled_by_default=True,
    always_enabled=True,
))

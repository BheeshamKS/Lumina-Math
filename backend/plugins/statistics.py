from plugins.base import Plugin
from plugins.registry import register, PluginInfo


class StatisticsPlugin(Plugin):
    name = "statistics"
    display_name = "Statistics"
    description = "Mean, standard deviation, variance, and distributions."
    capabilities = ["mean", "std", "variance", "distribution"]

    def solve(self, problem: str) -> dict:
        from services.math_engine import solve_problem
        return solve_problem(problem)


register(PluginInfo(
    name="statistics",
    display_name="Statistics",
    description="Mean, standard deviation, and distributions.",
    required_tools=["stats", "mean", "variance"],
    enabled_by_default=False,
))

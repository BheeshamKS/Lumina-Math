from plugins.base import Plugin
from plugins.registry import register, PluginInfo
from services.math_engine import solve_derivative, solve_integral, solve_limit


class CalculusPlugin(Plugin):
    name = "calculus"
    display_name = "Calculus"
    description = "Derivatives, integrals, and limits using SymPy."
    capabilities = ["derivative", "integral", "limit"]

    def solve(self, problem: str) -> dict:
        from services.math_engine import solve_problem
        return solve_problem(problem)


register(PluginInfo(
    name="calculus",
    display_name="Calculus",
    description="Derivatives, integrals, and limits.",
    required_tools=["diff", "integrate", "limit"],
    enabled_by_default=False,
))

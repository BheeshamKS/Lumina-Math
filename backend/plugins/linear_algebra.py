from plugins.base import Plugin
from plugins.registry import register, PluginInfo


class LinearAlgebraPlugin(Plugin):
    name = "linear_algebra"
    display_name = "Linear Algebra"
    description = "Matrix operations, eigenvalues, and systems of equations."
    capabilities = ["matrix_multiply", "matrix_add", "det", "inverse", "transpose", "eigenvalues"]

    def solve(self, problem: str) -> dict:
        from services.math_engine import solve_problem
        return solve_problem(problem)


register(PluginInfo(
    name="linear_algebra",
    display_name="Linear Algebra",
    description="Matrix operations, eigenvalues, and systems of equations.",
    required_tools=["Matrix", "det", "inv", "eigenvals"],
    enabled_by_default=False,
))

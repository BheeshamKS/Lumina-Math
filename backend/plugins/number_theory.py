from plugins.base import Plugin
from plugins.registry import register, PluginInfo


class NumberTheoryPlugin(Plugin):
    name = "number_theory"
    display_name = "Number Theory"
    description = "Primes, GCD/LCM, factorization, and modular arithmetic."
    capabilities = ["isprime", "factorint", "gcd", "lcm", "mod"]

    def solve(self, problem: str) -> dict:
        from services.math_engine import solve_problem
        return solve_problem(problem)


register(PluginInfo(
    name="number_theory",
    display_name="Number Theory",
    description="Primes, GCD, and modular arithmetic.",
    required_tools=["isprime", "factorint", "gcd", "mod"],
    enabled_by_default=False,
))

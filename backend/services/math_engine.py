"""
Math Engine — SymPy does ALL arithmetic and symbolic computation.
The LLM never touches raw numbers; it only formats what this module produces.
"""

import ast
import re
from typing import Any
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)
from sympy import (
    symbols, solve, simplify, factor, expand, diff, integrate,
    limit, Symbol, Eq, latex, sympify, sqrt, Rational, pi, E,
    Matrix, det, oo, sin, cos, tan, log, exp, Abs, solve_linear_system,
)


TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application, convert_xor)

# ── LaTeX → SymPy text pre-processor ─────────────────────────────────────────

_LATEX_SUBS = [
    # Fractions:  \frac{a}{b}  →  (a)/(b)
    (re.compile(r"\\frac\{([^}]+)\}\{([^}]+)\}"), r"((\1)/(\2))"),
    # Powers with braces:  x^{2}  →  x^2   (multiple chars)
    (re.compile(r"\^{([^}]+)}"), r"^(\1)"),
    # sqrt:  \sqrt{x}  →  sqrt(x)
    (re.compile(r"\\sqrt\{([^}]+)\}"), r"sqrt(\1)"),
    # sqrt without braces:  \sqrt x  →  sqrt(x)
    (re.compile(r"\\sqrt\s+(\w+)"), r"sqrt(\1)"),
    # Absolute value:  \left|x\right|  or  |x|  →  Abs(x)
    (re.compile(r"\\left\|([^|]+)\\right\|"), r"Abs(\1)"),
    # Log/trig with braces:  \sin{x}  →  sin(x)
    (re.compile(r"\\(sin|cos|tan|log|ln|exp)\{([^}]+)\}"), r"\1(\2)"),
    # Log/trig plain:  \sin x  →  sin(x)
    (re.compile(r"\\(sin|cos|tan|log|ln)\s+(\w+)"), r"\1(\2)"),
    # \ln  →  log
    (re.compile(r"\\ln\b"), "log"),
    # Operators
    (re.compile(r"\\cdot"), "*"),
    (re.compile(r"\\times"), "*"),
    (re.compile(r"\\div"), "/"),
    (re.compile(r"\\pm"), "+"),   # simplified
    # Greek letters
    (re.compile(r"\\pi\b"), "pi"),
    (re.compile(r"\\theta\b"), "theta"),
    (re.compile(r"\\alpha\b"), "alpha"),
    (re.compile(r"\\beta\b"), "beta"),
    # Brackets
    (re.compile(r"\\left[\(\[]"), "("),
    (re.compile(r"\\right[\)\]]"), ")"),
    (re.compile(r"\\left\{"), "("),
    (re.compile(r"\\right\}"), ")"),
    # Remaining backslash commands → strip
    (re.compile(r"\\[a-zA-Z]+"), ""),
    # Braces → parens
    (re.compile(r"\{"), "("),
    (re.compile(r"\}"), ")"),
]


def _preprocess_latex(text: str) -> str:
    """
    Convert LaTeX notation to SymPy-parseable algebra.
    Applies an ordered sequence of regex substitutions.
    Returns the cleaned string.
    """
    s = text.strip()
    # Strip $ / $$ delimiters that may come from calculator push or user paste
    s = re.sub(r"^\$\$(.+)\$\$$", r"\1", s, flags=re.DOTALL)
    s = re.sub(r"^\$([^$\n]+)\$$", r"\1", s)
    s = s.strip()
    for pattern, replacement in _LATEX_SUBS:
        s = pattern.sub(replacement, s)
    # Collapse any double spaces left behind
    s = re.sub(r"  +", " ", s).strip()
    return s


# ── helpers ─────────────────────────────────────────────────────────────────

def _safe_parse(expr_str: str) -> sp.Expr:
    """Parse a string into a SymPy expression, raising ValueError on failure.
    Runs LaTeX pre-processing first so both LaTeX and plain-text inputs work.
    """
    cleaned = _preprocess_latex(expr_str)
    try:
        return parse_expr(cleaned, transformations=TRANSFORMATIONS)
    except Exception:
        # If preprocessing over-mangled it, try the original string too
        try:
            return parse_expr(expr_str, transformations=TRANSFORMATIONS)
        except Exception as exc:
            raise ValueError(f"Cannot parse expression: {expr_str!r}") from exc


def _detect_variables(expr: sp.Expr) -> list[Symbol]:
    """Return free symbols sorted alphabetically."""
    return sorted(expr.free_symbols, key=lambda s: s.name)


# ── problem classifiers ──────────────────────────────────────────────────────

def _is_equation(text: str) -> bool:
    return "=" in text


def _is_derivative(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ["d/dx", "derivative", "differentiate", "diff(", "d/d"])


def _is_integral(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ["integral", "integrate", "∫", "antiderivative"])


def _is_limit(text: str) -> bool:
    t = text.lower()
    return "limit" in t or "lim" in t


def _is_factor(text: str) -> bool:
    t = text.lower()
    return t.strip().startswith("factor") or "factor(" in t


def _is_simplify(text: str) -> bool:
    t = text.lower()
    return t.strip().startswith("simplify") or "simplify(" in t


def _is_expand(text: str) -> bool:
    t = text.lower()
    return t.strip().startswith("expand") or "expand(" in t


# ── individual solvers ───────────────────────────────────────────────────────

def solve_equation(equation_str: str) -> dict[str, Any]:
    """Solve an equation like '2x + 4 = 8' or 'x^2 - 5x + 6 = 0'."""
    parts = equation_str.split("=", 1)
    if len(parts) != 2:
        raise ValueError("Equation must contain exactly one '=' sign.")

    lhs = _safe_parse(parts[0].strip())
    rhs = _safe_parse(parts[1].strip())
    equation = Eq(lhs, rhs)
    free = _detect_variables(lhs - rhs)

    if not free:
        # numeric check
        result = simplify(lhs - rhs)
        is_true = result == 0
        return {
            "type": "equation",
            "equation_latex": latex(equation),
            "steps": [
                {"description": "Simplify both sides", "expression": latex(simplify(lhs)), "expression_rhs": latex(simplify(rhs))},
                {"description": "Evaluate", "expression": str(is_true)},
            ],
            "solutions": [],
            "is_identity": bool(is_true),
        }

    solve_var = free[0]
    solutions = solve(equation, solve_var)
    steps = _equation_steps(lhs, rhs, solve_var, solutions)

    return {
        "type": "equation",
        "equation_latex": latex(equation),
        "variable": str(solve_var),
        "steps": steps,
        "solutions": [latex(s) for s in solutions],
        "solutions_numeric": [str(float(s.evalf())) if s.is_number else str(s) for s in solutions],
    }


def _equation_steps(lhs, rhs, var, solutions) -> list[dict]:
    """Generate pedagogical steps for equation solving."""
    steps = []
    expr = lhs - rhs  # bring everything to one side

    # Step 1 — original form
    steps.append({
        "description": "Write the equation",
        "expression": latex(Eq(lhs, rhs)),
    })

    # Step 2 — move terms (rhs → 0)
    if rhs != 0:
        steps.append({
            "description": f"Move all terms to the left side (subtract {latex(rhs)} from both sides)",
            "expression": latex(Eq(expr, 0)),
        })

    # Step 3 — expand
    expanded = expand(expr)
    if expanded != expr:
        steps.append({
            "description": "Expand / distribute",
            "expression": latex(Eq(expanded, 0)),
        })
        expr = expanded

    # Step 4 — factor (if polynomial)
    try:
        factored = factor(expr)
        if factored != expr and "*" in str(factored):
            steps.append({
                "description": "Factor the expression",
                "expression": latex(Eq(factored, 0)),
            })
    except Exception:
        pass

    # Step 5 — solutions
    if solutions:
        for sol in solutions:
            steps.append({
                "description": f"Solve for {var}",
                "expression": latex(Eq(var, sol)),
            })
    else:
        steps.append({"description": "No real solutions found.", "expression": "\\emptyset"})

    # Step 6 — verify
    if solutions:
        verified = []
        for sol in solutions:
            lhs_val = simplify(lhs.subs(var, sol))
            rhs_val = simplify(rhs.subs(var, sol))
            verified.append(f"{latex(var)} = {latex(sol)} \\Rightarrow {latex(lhs_val)} = {latex(rhs_val)}")
        steps.append({
            "description": "Verify by substituting back",
            "expression": " \\quad ".join(verified),
        })

    return steps


def solve_derivative(text: str) -> dict[str, Any]:
    """Differentiate an expression. Handles 'd/dx[expr]', 'diff(expr, x)', or 'differentiate expr'."""
    t = text.strip()

    # Pattern 1: diff(expr, var) — extract both
    diff_call = re.match(r"diff\s*\(\s*(.+?)\s*,\s*([a-zA-Z])\s*\)\s*$", t, re.IGNORECASE)
    if diff_call:
        expr_str = diff_call.group(1)
        var_name = diff_call.group(2).lower()
    else:
        # Pattern 2: d/dx(expr) or d/dx[expr]
        d_dx = re.search(r"d/d([a-zA-Z])\s*[\[\(](.+?)[\]\)]\s*$", t, re.IGNORECASE)
        if d_dx:
            var_name = d_dx.group(1).lower()
            expr_str = d_dx.group(2)
        else:
            # Pattern 3: strip leading keyword, infer variable
            expr_str = re.sub(r"^(diff|differentiate|derivative\s+of)\s+", "", t, flags=re.IGNORECASE).strip()
            syms = _safe_parse(expr_str).free_symbols
            var_name = sorted(syms, key=lambda s: s.name)[0].name if syms else "x"

    expr = _safe_parse(expr_str)
    var = Symbol(var_name)

    result = diff(expr, var)
    simplified_result = simplify(result)

    steps = [
        {"description": "Original expression", "expression": latex(expr)},
        {"description": f"Apply differentiation rules with respect to {var_name}", "expression": latex(result)},
    ]
    if simplified_result != result:
        steps.append({"description": "Simplify", "expression": latex(simplified_result)})

    return {
        "type": "derivative",
        "expression_latex": latex(expr),
        "variable": var_name,
        "steps": steps,
        "result": latex(simplified_result),
    }


def solve_integral(text: str) -> dict[str, Any]:
    """Integrate an expression indefinitely or over bounds."""
    t = text.lower().strip()
    expr_str = re.sub(r"^(integrate|integral of|∫)\s*", "", t).strip()

    # Check for definite integral bounds: expr from a to b
    bounds_match = re.search(r"(.+?)\s+from\s+(-?[\w\d\.]+)\s+to\s+(-?[\w\d\.]+)", expr_str)
    dx_match = re.search(r"(.+?)\s*d([a-z])$", expr_str)

    if bounds_match:
        core = bounds_match.group(1).strip()
        low = sympify(bounds_match.group(2))
        high = sympify(bounds_match.group(3))
        expr = _safe_parse(core)
        free = _detect_variables(expr)
        var = free[0] if free else Symbol("x")
        indef = integrate(expr, var)
        definite = integrate(expr, (var, low, high))
        steps = [
            {"description": "Set up the definite integral", "expression": f"\\int_{{{latex(low)}}}^{{{latex(high)}}} {latex(expr)}\\, d{var}"},
            {"description": "Find the antiderivative", "expression": f"\\left[{latex(indef)}\\right]_{{{latex(low)}}}^{{{latex(high)}}}"},
            {"description": "Evaluate at bounds", "expression": f"{latex(indef.subs(var, high))} - {latex(indef.subs(var, low))}"},
            {"description": "Result", "expression": latex(simplify(definite))},
        ]
        return {"type": "integral", "definite": True, "steps": steps, "result": latex(simplify(definite))}

    if dx_match:
        core = dx_match.group(1).strip()
        var_name = dx_match.group(2)
    else:
        core = expr_str
        free = _safe_parse(core).free_symbols
        var_name = sorted(free, key=lambda s: s.name)[0].name if free else "x"

    expr = _safe_parse(core)
    var = Symbol(var_name)
    result = integrate(expr, var)
    simplified_result = simplify(result)

    steps = [
        {"description": "Expression to integrate", "expression": f"\\int {latex(expr)}\\, d{var}"},
        {"description": "Apply integration rules", "expression": latex(result)},
        {"description": "Add constant of integration C", "expression": latex(simplified_result) + " + C"},
    ]
    return {
        "type": "integral",
        "definite": False,
        "steps": steps,
        "result": latex(simplified_result) + " + C",
    }


def _strip_keyword(text: str, keyword: str) -> str:
    """Remove a leading keyword and any surrounding brackets from an expression string."""
    s = re.sub(rf"^{keyword}\s*", "", text.strip(), flags=re.IGNORECASE)
    # Remove matched outer parens/brackets only when balanced
    s = s.strip()
    if (s.startswith("(") and s.endswith(")")) or (s.startswith("[") and s.endswith("]")):
        inner = s[1:-1]
        # verify brackets were the outer wrapper, not part of expr
        depth = 0
        for ch in inner:
            if ch in "([": depth += 1
            elif ch in ")]": depth -= 1
            if depth < 0:
                return s  # mismatched — don't strip
        s = inner
    return s


def solve_simplify(text: str) -> dict[str, Any]:
    expr_str = _strip_keyword(text, "simplify")
    expr = _safe_parse(expr_str)
    expanded = expand(expr)
    result = simplify(expr)
    steps = [
        {"description": "Original expression", "expression": latex(expr)},
        {"description": "Expand", "expression": latex(expanded)},
        {"description": "Simplify", "expression": latex(result)},
    ]
    return {"type": "simplify", "steps": steps, "result": latex(result)}


def solve_factor(text: str) -> dict[str, Any]:
    expr_str = _strip_keyword(text, "factor")
    expr = _safe_parse(expr_str)
    result = factor(expr)
    expanded = expand(expr)
    steps = [
        {"description": "Original expression", "expression": latex(expr)},
        {"description": "Expand to confirm polynomial form", "expression": latex(expanded)},
        {"description": "Factor completely", "expression": latex(result)},
    ]
    return {"type": "factor", "steps": steps, "result": latex(result)}


def solve_expand(text: str) -> dict[str, Any]:
    expr_str = _strip_keyword(text, "expand")
    expr = _safe_parse(expr_str)
    result = expand(expr)
    steps = [
        {"description": "Original expression", "expression": latex(expr)},
        {"description": "Apply distributive property", "expression": latex(result)},
    ]
    return {"type": "expand", "steps": steps, "result": latex(result)}


def solve_limit(text: str) -> dict[str, Any]:
    t = text.lower().strip()
    # Patterns: "limit of x^2 as x -> 0", "lim x->2 (x^2-4)/(x-2)"
    match = re.search(r"(?:limit\s+of|lim)\s+(.+?)\s+as\s+([a-z])\s*(?:->|→|approaches)\s*([^\s,]+)", t)
    if not match:
        raise ValueError("Could not parse limit. Use: 'limit of EXPR as VAR -> VALUE'")

    expr_str = match.group(1)
    var_name = match.group(2)
    point_str = match.group(3)

    expr = _safe_parse(expr_str)
    var = Symbol(var_name)
    point = oo if point_str in ("inf", "infinity", "∞") else sympify(point_str)

    result = limit(expr, var, point)
    steps = [
        {"description": "Expression", "expression": latex(expr)},
        {"description": f"Evaluate limit as {var_name} → {point_str}", "expression": f"\\lim_{{{var_name} \\to {latex(point)}}} {latex(expr)}"},
        {"description": "Result", "expression": latex(result)},
    ]
    return {"type": "limit", "steps": steps, "result": latex(result)}


# ── matrix helpers ───────────────────────────────────────────────────────────

def _find_matrix_spans(text: str) -> list[str]:
    """
    Extract every top-level [[...]] substring from text using bracket counting.
    Handles nested brackets correctly.
    """
    result = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] == '[' and i + 1 < n and text[i + 1] == '[':
            depth = 0
            start = i
            while i < n:
                if text[i] == '[':
                    depth += 1
                elif text[i] == ']':
                    depth -= 1
                    if depth == 0:
                        result.append(text[start:i + 1])
                        i += 1
                        break
                i += 1
        else:
            i += 1
    return result


def _parse_py_matrix(s: str) -> sp.Matrix:
    """Parse a Python list-of-lists string like '[[1,2],[3,4]]' → SymPy Matrix."""
    try:
        data = ast.literal_eval(s.strip())
    except Exception:
        raise ValueError(f"Cannot parse matrix literal: {s!r}")
    if not isinstance(data, list) or not all(isinstance(r, list) for r in data):
        raise ValueError(f"Expected list-of-lists, got: {s!r}")
    # Allow int/float/Fraction entries
    return sp.Matrix([[sp.sympify(c) for c in row] for row in data])


def _is_matrix_operation(text: str) -> bool:
    """Detect Python list-of-lists matrix notation OR LaTeX pmatrix/bmatrix."""
    if re.search(r'\[\s*\[', text):
        return True
    if re.search(r'\\begin\s*\{[pbvBV]?matrix\}', text):
        return True
    return False


def _matrix_mult_steps(A: sp.Matrix, B: sp.Matrix, C: sp.Matrix) -> list[dict]:
    steps: list[dict] = [
        {"description": "Matrix A",      "expression": latex(A)},
        {"description": "Matrix B",      "expression": latex(B)},
    ]
    # Show per-element dot-product detail for small matrices
    rows_a, cols_a = A.shape
    cols_b = B.shape[1]
    if rows_a <= 3 and cols_b <= 3:
        for i in range(rows_a):
            for j in range(cols_b):
                terms = " + ".join(
                    f"({latex(A[i, k])} \\cdot {latex(B[k, j])})"
                    for k in range(cols_a)
                )
                steps.append({
                    "description": f"Entry ({i+1},{j+1}) — row {i+1} · col {j+1}",
                    "expression":  f"{terms} = {latex(C[i, j])}",
                })
    steps.append({"description": "Result A \\times B", "expression": latex(C)})
    return steps


def _parse_latex_matrices(text: str) -> list[sp.Matrix]:
    """
    Parse all \\begin{pmatrix}...\\end{pmatrix} (also bmatrix/vmatrix) blocks.
    Returns a list of SymPy Matrix objects.
    """
    pattern = re.compile(
        r'\\begin\s*\{[pbvBV]?matrix\}(.*?)\\end\s*\{[pbvBV]?matrix\}',
        re.DOTALL
    )
    matrices = []
    for m in pattern.finditer(text):
        body = m.group(1).strip()
        # Split rows on \\
        rows_raw = re.split(r'\\\\', body)
        rows = []
        for row_str in rows_raw:
            cells = [c.strip() for c in row_str.split('&')]
            rows.append([sp.sympify(_preprocess_latex(c)) for c in cells if c])
        if rows and all(rows):
            matrices.append(sp.Matrix(rows))
    return matrices


def solve_matrix_operation(text: str) -> dict[str, Any]:
    """
    Handle matrix operations expressed as Python list notation OR LaTeX pmatrix.
    Supports: A*B (multiply), A+B, A-B, det(A), inv(A), A^T.
    """
    t = text.strip()

    # ── parse all matrices present ─────────────────────────────────
    # Try Python list notation first, then LaTeX pmatrix
    spans = _find_matrix_spans(t)
    if spans:
        matrices = [_parse_py_matrix(s) for s in spans]
    else:
        matrices = _parse_latex_matrices(t)

    if not matrices:
        raise ValueError(f"No matrices found in: {t!r}")

    A = matrices[0]

    # ── single-matrix operations ───────────────────────────────────
    if len(matrices) == 1:
        tl = t.lower()
        if "det" in tl:
            d = A.det()
            return {
                "type": "matrix",
                "steps": [
                    {"description": "Matrix", "expression": latex(A)},
                    {"description": "Determinant", "expression": latex(d)},
                ],
                "result": latex(d),
            }
        if "inv" in tl or "inverse" in tl:
            if A.det() == 0:
                raise ValueError("Matrix is singular (det = 0); inverse does not exist.")
            inv = A.inv()
            return {
                "type": "matrix",
                "steps": [
                    {"description": "Matrix", "expression": latex(A)},
                    {"description": "Inverse", "expression": latex(inv)},
                ],
                "result": latex(inv),
            }
        if "transpose" in tl or re.search(r'\^[tT]\b', t):
            T = A.T
            return {
                "type": "matrix",
                "steps": [
                    {"description": "Matrix", "expression": latex(A)},
                    {"description": "Transpose", "expression": latex(T)},
                ],
                "result": latex(T),
            }
        # Default: just display it
        return {
            "type": "matrix",
            "steps": [{"description": "Matrix", "expression": latex(A)}],
            "result": latex(A),
        }

    # ── binary operations ──────────────────────────────────────────
    B = matrices[1]

    # Find the operator that sits between the two matrix representations
    if spans and len(spans) >= 2:
        idx_a_end   = t.index(spans[0]) + len(spans[0])
        idx_b_start = t.index(spans[1], idx_a_end)
        between     = t[idx_a_end:idx_b_start].strip()
    else:
        # LaTeX pmatrix: look for operator between \end{...} and \begin{...}
        m = re.search(
            r'\\end\s*\{[pbvBV]?matrix\}\s*([+\-*×@]?)\s*\\begin', t
        )
        between = m.group(1).strip() if m else '*'

    # Normalise: ×, @, times → multiply; otherwise use the raw char
    if re.match(r'^[×*@]$|^\\times$|^times$', between):
        op = '*'
    elif between == '+':
        op = '+'
    elif between == '-':
        op = '-'
    else:
        op = '*'   # default to multiply when operator is ambiguous

    if op == '*':
        if A.shape[1] != B.shape[0]:
            raise ValueError(
                f"Cannot multiply: A is {A.shape[0]}×{A.shape[1]} "
                f"but B is {B.shape[0]}×{B.shape[1]}."
            )
        C = A * B
        return {
            "type":   "matrix",
            "steps":  _matrix_mult_steps(A, B, C),
            "result": latex(C),
        }
    elif op == '+':
        C = A + B
        return {
            "type":  "matrix",
            "steps": [
                {"description": "Matrix A", "expression": latex(A)},
                {"description": "Matrix B", "expression": latex(B)},
                {"description": "A + B (element-wise)", "expression": latex(C)},
            ],
            "result": latex(C),
        }
    else:  # subtract
        C = A - B
        return {
            "type":  "matrix",
            "steps": [
                {"description": "Matrix A", "expression": latex(A)},
                {"description": "Matrix B", "expression": latex(B)},
                {"description": "A − B (element-wise)", "expression": latex(C)},
            ],
            "result": latex(C),
        }


# ── main dispatcher ──────────────────────────────────────────────────────────

def solve_problem(text: str) -> dict[str, Any]:
    """
    Primary entry point. Classifies the input and routes to the correct solver.
    Accepts plain-text algebra or LaTeX notation.
    Raises ValueError on parse failure.
    """
    raw = text.strip()

    # Matrix check BEFORE LaTeX pre-processing — the preprocessor would mangle
    # pmatrix/bmatrix LaTeX and Python list-of-lists notation.
    if _is_matrix_operation(raw):
        return solve_matrix_operation(raw)

    text = _preprocess_latex(raw)

    if _is_limit(text):
        return solve_limit(text)
    if _is_derivative(text):
        return solve_derivative(text)
    if _is_integral(text):
        return solve_integral(text)
    if _is_factor(text):
        return solve_factor(text)
    if _is_expand(text):
        return solve_expand(text)
    if _is_simplify(text):
        return solve_simplify(text)
    if _is_equation(text):
        return solve_equation(text)

    # Fallback: try to simplify as a bare expression
    try:
        return solve_simplify(text)
    except Exception:
        raise ValueError(f"Unrecognized problem type: {text!r}")

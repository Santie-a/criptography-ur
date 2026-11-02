"""Teoría de números básica: algoritmo de Euclides extendido e inverso modular."""

from __future__ import annotations


def egcd(a: int, b: int) -> tuple[int, int, int]:
    """Euclides extendido (versión iterativa).

    Devuelve (g, x, y) tales que a*x + b*y = g = mcd(a, b).
    """
    old_r, r = a, b
    old_x, x = 1, 0
    old_y, y = 0, 1
    while r != 0:
        q = old_r // r
        old_r, r = r, old_r - q * r
        old_x, x = x, old_x - q * x
        old_y, y = y, old_y - q * y
    if old_r < 0:  # normaliza el signo del mcd
        old_r, old_x, old_y = -old_r, -old_x, -old_y
    return old_r, old_x, old_y


def modinv(a: int, m: int) -> int:
    """Inverso de a módulo m usando Euclides extendido.

    Si a*x + m*y = 1, entonces a*x ≡ 1 (mod m) y x es el inverso.
    Lanza ZeroDivisionError si a ≡ 0 y ValueError si mcd(a, m) != 1.
    """
    if m <= 1:
        raise ValueError("el módulo debe ser mayor que 1")
    a %= m
    if a == 0:
        raise ZeroDivisionError("0 no tiene inverso modular")
    g, x, _ = egcd(a, m)
    if g != 1:
        raise ValueError(f"{a} no es invertible módulo {m} (mcd = {g})")
    return x % m

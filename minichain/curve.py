"""Curvas elípticas en forma corta de Weierstrass sobre F_p.

    E(F_p):  y^2 = x^3 + a*x + b  (mod p)

Los puntos de E(F_p) junto con el punto en el infinito O forman un grupo
abeliano: O es el neutro, el inverso de (x, y) es (x, -y) y la suma se define
con la regla de la cuerda y la tangente. Aquí se implementa todo en
coordenadas afines, usando el inverso modular por Euclides extendido.

Nota: la multiplicación escalar no es de tiempo constante. Es correcta, pero
filtraría información por canales laterales en un sistema real.
"""

from __future__ import annotations

from dataclasses import dataclass

from .ntheory import modinv


@dataclass(frozen=True)
class Curve:
    name: str
    p: int  # primo del cuerpo
    a: int
    b: int
    gx: int  # generador G
    gy: int
    n: int  # orden de G (primo)
    h: int = 1  # cofactor

    @property
    def G(self) -> "Point":
        return Point(self, self.gx, self.gy)

    @property
    def infinity(self) -> "Point":
        return Point(self, None, None)

    def contains(self, x: int, y: int) -> bool:
        return (y * y - (x * x * x + self.a * x + self.b)) % self.p == 0

    @property
    def coord_size(self) -> int:
        """Bytes necesarios para una coordenada."""
        return (self.p.bit_length() + 7) // 8


class Point:
    """Punto de una curva. El punto en el infinito tiene x = y = None."""

    __slots__ = ("curve", "x", "y")

    def __init__(self, curve: Curve, x: int | None, y: int | None):
        if (x is None) != (y is None):
            raise ValueError("ambas coordenadas deben ser None o ninguna")
        if x is not None:
            x %= curve.p
            y %= curve.p
            if not curve.contains(x, y):
                raise ValueError(f"({x}, {y}) no está en la curva {curve.name}")
        self.curve = curve
        self.x = x
        self.y = y

    @property
    def is_infinity(self) -> bool:
        return self.x is None

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Point):
            return NotImplemented
        return self.curve == other.curve and self.x == other.x and self.y == other.y

    def __hash__(self) -> int:
        return hash((self.curve.name, self.x, self.y))

    def __neg__(self) -> "Point":
        if self.is_infinity:
            return self
        return Point(self.curve, self.x, -self.y)

    def __add__(self, other: "Point") -> "Point":
        return point_add(self, other)

    def __sub__(self, other: "Point") -> "Point":
        return point_add(self, -other)

    def double(self) -> "Point":
        return point_double(self)

    def __mul__(self, k: int) -> "Point":
        return scalar_mult(k, self)

    __rmul__ = __mul__

    def __repr__(self) -> str:
        if self.is_infinity:
            return f"Point({self.curve.name}, O)"
        return f"Point({self.curve.name}, x={self.x:#x}, y={self.y:#x})"


def point_double(P: Point) -> Point:
    """2P con la recta tangente: λ = (3x² + a) / (2y)."""
    if P.is_infinity or P.y == 0:
        # Si y = 0 la tangente es vertical: P tiene orden 2.
        return P.curve.infinity
    c = P.curve
    lam = (3 * P.x * P.x + c.a) * modinv(2 * P.y, c.p) % c.p
    x3 = (lam * lam - 2 * P.x) % c.p
    y3 = (lam * (P.x - x3) - P.y) % c.p
    return Point(c, x3, y3)


def point_add(P: Point, Q: Point) -> Point:
    """P + Q con la recta secante: λ = (y2 - y1) / (x2 - x1)."""
    if P.curve != Q.curve:
        raise ValueError("los puntos pertenecen a curvas distintas")
    if P.is_infinity:
        return Q
    if Q.is_infinity:
        return P
    c = P.curve
    if P.x == Q.x:
        if (P.y + Q.y) % c.p == 0:
            return c.infinity  # P + (-P) = O
        return point_double(P)  # P == Q
    lam = (Q.y - P.y) * modinv(Q.x - P.x, c.p) % c.p
    x3 = (lam * lam - P.x - Q.x) % c.p
    y3 = (lam * (P.x - x3) - P.y) % c.p
    return Point(c, x3, y3)


def scalar_mult(k: int, P: Point) -> Point:
    """k·P con double-and-add, recorriendo los bits de k de izquierda a derecha.

    Para cada bit: R = 2R, y si el bit es 1, R = R + P.
    Cuesta O(log k) operaciones de grupo en lugar de k - 1 sumas.
    """
    if k < 0:
        return scalar_mult(-k, -P)
    R = P.curve.infinity
    for bit in bin(k)[2:]:
        R = point_double(R)
        if bit == "1":
            R = point_add(R, P)
    return R


def scalar_mult_trace(k: int, P: Point) -> list[dict]:
    """Igual que scalar_mult, pero registra cada paso (para visualizarlo)."""
    if k <= 0:
        raise ValueError("k debe ser positivo")
    steps = []
    R = P.curve.infinity
    for i, bit in enumerate(bin(k)[2:]):
        R = point_double(R)
        steps.append({"bit_index": i, "bit": bit, "op": "double", "point": R})
        if bit == "1":
            R = point_add(R, P)
            steps.append({"bit_index": i, "bit": bit, "op": "add", "point": R})
    return steps


def enumerate_points(curve: Curve, limit: int = 5000) -> list[Point]:
    """Todos los puntos afines de una curva pequeña (más O al inicio).

    Usa el criterio de Euler para saber si x^3 + ax + b es un cuadrado.
    """
    if curve.p > limit:
        raise ValueError(f"p demasiado grande para enumerar (máximo {limit})")
    p = curve.p
    roots: dict[int, list[int]] = {}
    for y in range(p):
        roots.setdefault(y * y % p, []).append(y)
    pts = [curve.infinity]
    for x in range(p):
        rhs = (x * x * x + curve.a * x + curve.b) % p
        for y in roots.get(rhs, []):
            pts.append(Point(curve, x, y))
    return pts


def encode_point(P: Point, compressed: bool = True) -> bytes:
    """Codificación SEC1: 02/03 || x (comprimida) o 04 || x || y."""
    if P.is_infinity:
        raise ValueError("el punto en el infinito no se codifica")
    size = P.curve.coord_size
    x = P.x.to_bytes(size, "big")
    if compressed:
        return bytes([2 + (P.y & 1)]) + x
    return b"\x04" + x + P.y.to_bytes(size, "big")


def decode_point(curve: Curve, data: bytes) -> Point:
    """Inverso de encode_point. Valida que el punto esté en la curva."""
    size = curve.coord_size
    if len(data) == 1 + 2 * size and data[0] == 4:
        x = int.from_bytes(data[1 : 1 + size], "big")
        y = int.from_bytes(data[1 + size :], "big")
        return Point(curve, x, y)
    if len(data) == 1 + size and data[0] in (2, 3):
        x = int.from_bytes(data[1:], "big")
        if x >= curve.p:
            raise ValueError("coordenada x fuera de rango")
        if curve.p % 4 != 3:
            raise NotImplementedError("raíz cuadrada implementada solo para p ≡ 3 (mod 4)")
        rhs = (x * x * x + curve.a * x + curve.b) % curve.p
        y = pow(rhs, (curve.p + 1) // 4, curve.p)  # raíz cuadrada si p ≡ 3 (mod 4)
        if y * y % curve.p != rhs:
            raise ValueError("x no corresponde a ningún punto de la curva")
        if (y & 1) != (data[0] & 1):
            y = curve.p - y
        return Point(curve, x, y)
    raise ValueError("codificación de punto inválida")


def point_order(P: Point, max_order: int = 100_000) -> int:
    """Orden de P en el grupo (búsqueda lineal, solo para curvas pequeñas)."""
    Q, k = P, 1
    while not Q.is_infinity:
        Q, k = Q + P, k + 1
        if k > max_order:
            raise ValueError("orden demasiado grande")
    return k


# Curva de Bitcoin (SEC 2, sección 2.4.1).
secp256k1 = Curve(
    name="secp256k1",
    p=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F,
    a=0,
    b=7,
    gx=0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    gy=0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
    n=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141,
    h=1,
)

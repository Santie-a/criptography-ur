"""Punto de entrada: `python -m minichain`, `python minichain` o `python .` desde la carpeta."""

if __package__:
    from .demo import main
else:
    # Ejecutado como carpeta o como archivo suelto: no hay paquete padre, así que
    # se agrega la carpeta que contiene a minichain al path y se importa por su
    # nombre real (funciona aunque la carpeta se haya renombrado al compartirla).
    import importlib
    import os
    import sys

    _here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.dirname(_here))
    main = importlib.import_module(os.path.basename(_here) + ".demo").main

main()

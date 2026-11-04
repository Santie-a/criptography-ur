# Documentación de minichain

Esta carpeta explica el proyecto desde cero. No hace falta saber de blockchain
ni de curvas elípticas: cada documento parte de lo básico y llega hasta el
detalle del código.

## Por dónde empezar

Si es la primera vez, léelos en este orden. Cada uno toma entre 10 y 20 minutos.

| # | Documento | Qué vas a entender |
|---|---|---|
| 1 | [El proyecto en general](01-proyecto.md) | Qué es minichain, qué demuestra, qué partes tiene y quiénes son los personajes de la simulación. |
| 2 | [Blockchain](02-blockchain.md) | Qué es una cadena de bloques, cómo se encadenan los bloques, qué es un árbol de Merkle, qué es minar y cómo se valida todo. |
| 3 | [Criptografía](03-criptografia.md) | Hashes, aritmética modular, curvas elípticas y la firma digital ECDSA, con un ejemplo con números pequeños. |
| 4 | [La vulnerabilidad](04-vulnerabilidad.md) | Por qué repetir el nonce de una firma entrega la clave privada, paso a paso y con números, y cómo se evita. |
| 5 | [El código](05-codigo.md) | Qué hace cada archivo y cómo se conectan entre sí. |
| 6 | [La interfaz](06-interfaz.md) | Para qué sirve cada sección y cada página de la aplicación web. |
| 7 | [Guion para exponer](07-guion-exposicion.md) | Un recorrido de la demostración en vivo, con lo que conviene decir en cada pantalla. |

Para consultar en cualquier momento: el [glosario](glosario.md), con todos los
términos en una línea cada uno.

## Para quien va a modificar o desplegar el proyecto

| Documento | Contenido |
|---|---|
| [Conectar la UI con la simulación](CONECTAR_UI.md) | Cómo viaja una acción desde la interfaz hasta el núcleo, la lista de endpoints y cómo agregar funcionalidades. |
| [Despliegue](DESPLIEGUE.md) | Red local del salón, Docker, proxy inverso y qué cambiar para muchos usuarios. |
| [Sistema de diseño](DISENO.md) | Por qué la interfaz se ve y se organiza como se ve: estructura, colores, tipografía y contraste. |

## Una aclaración antes de empezar

Es común decir "el cifrado de la blockchain", pero **en este proyecto (y en
Bitcoin) nada está cifrado**. Cifrar es ocultar un mensaje para que solo alguien
con una clave lo pueda leer. Aquí todo es público a propósito: cualquiera puede
leer todas las transacciones.

Lo que sí se usa es criptografía para otras dos cosas:

- **Firmas digitales (ECDSA)**: prueban que una transacción la autorizó el dueño
  de la cuenta y que nadie la modificó después.
- **Funciones hash (SHA-256)**: dan a cada dato una "huella" que cambia por
  completo si se altera un solo carácter. Sirven para encadenar los bloques y
  detectar manipulaciones.

La vulnerabilidad que demuestra el proyecto es un fallo en las **firmas**, no en
un cifrado. El documento [3](03-criptografia.md) explica la diferencia con más
calma.

# Glosario

Cada término en pocas palabras, con el documento donde se explica a fondo.

| Término | Significado | Más en |
|---|---|---|
| **Aritmética modular** | Hacer cuentas "dando la vuelta" al llegar a un número n, como un reloj. a mod n es el residuo de dividir a entre n. | [3.3](03-criptografia.md#33-aritmética-modular) |
| **Billetera** | Un par de claves (privada y pública) y una dirección. Quien tiene la clave privada controla el dinero. | [2.2](02-blockchain.md#22-las-cuentas-y-las-direcciones) |
| **Bloque** | Un grupo de transacciones con un encabezado que incluye el hash del bloque anterior. | [2.5](02-blockchain.md#25-los-bloques) |
| **Bloque génesis** | El primer bloque (número 0). Reparte el dinero inicial. | [2.3](02-blockchain.md#23-las-transacciones) |
| **Cifrar** | Ocultar un mensaje para que solo quien tiene la clave lo lea. **No se usa en este proyecto.** | [3.1](03-criptografia.md#31-cifrar-firmar-y-hashear-no-son-lo-mismo) |
| **Clave privada (d)** | Número secreto de 256 bits con el que se firma. | [3.7](03-criptografia.md#37-la-firma-digital-ecdsa) |
| **Clave pública (Q)** | Q = d·G. Se publica; sirve para verificar firmas. | [3.7](03-criptografia.md#37-la-firma-digital-ecdsa) |
| **Coinbase / recompensa** | Transacción sin firma con la que el minero se paga 50 monedas al principio de cada bloque. | [2.3](02-blockchain.md#23-las-transacciones) |
| **Curva elíptica** | Conjunto de puntos que cumplen y² = x³ + ax + b. Sus puntos se pueden sumar. | [3.4](03-criptografia.md#34-curvas-elípticas) |
| **Dificultad** | Cuántos bits en cero debe tener el hash de un bloque. Cada bit duplica el trabajo de minar. | [2.7](02-blockchain.md#27-la-prueba-de-trabajo-minar) |
| **Dirección** | Identificador corto de una cuenta, derivado de la clave pública. En minichain empieza con `mc`. | [2.2](02-blockchain.md#22-las-cuentas-y-las-direcciones) |
| **Double-and-add** | Forma rápida de calcular k·P: por cada bit de k, duplicar, y si el bit es 1, sumar P. | [3.5](03-criptografia.md#35-multiplicar-un-punto-por-un-número) |
| **ECDSA** | Algoritmo de firma digital con curvas elípticas. Lo usa Bitcoin. | [3.7](03-criptografia.md#37-la-firma-digital-ecdsa) |
| **Euclides extendido** | Algoritmo para calcular el inverso modular. | [3.3](03-criptografia.md#33-aritmética-modular) |
| **Firma (r, s)** | Par de números que prueba que el dueño de la clave privada autorizó un mensaje. | [3.7](03-criptografia.md#37-la-firma-digital-ecdsa) |
| **G (generador)** | Punto fijo y público de la curva desde el que se calculan todas las claves públicas. | [3.6](03-criptografia.md#36-por-qué-es-seguro-el-logaritmo-discreto) |
| **Grupo** | Conjunto con una operación que tiene neutro, inversos y es asociativa. Los puntos de una curva elíptica forman uno. | [3.4](03-criptografia.md#34-curvas-elípticas) |
| **Hash** | Huella de tamaño fijo de un dato. Cambia por completo si el dato cambia en un carácter. | [3.2](03-criptografia.md#32-funciones-hash-sha-256) |
| **HMAC-DRBG** | Generador de números pseudoaleatorios basado en HMAC. RFC 6979 lo usa para calcular k. | [3.8](03-criptografia.md#38-el-nonce-k-el-punto-débil) |
| **Inverso modular (a⁻¹)** | El número que multiplicado por a da 1 módulo n. Reemplaza a la división. | [3.3](03-criptografia.md#33-aritmética-modular) |
| **Logaritmo discreto** | El problema de encontrar d a partir de Q = d·G. Es imposible en la práctica, y en eso se basa la seguridad. | [3.6](03-criptografia.md#36-por-qué-es-seguro-el-logaritmo-discreto) |
| **Low-s** | Regla de Bitcoin que exige usar el menor de s y n − s. El ataque funciona igual. | [4.8](04-vulnerabilidad.md#48-cómo-ocurre-en-la-simulación) |
| **Mempool** | Lista de transacciones válidas que esperan entrar en un bloque. | [2.4](02-blockchain.md#24-la-mempool-la-sala-de-espera) |
| **Merkle (árbol, raíz, prueba)** | Árbol de hashes que resume las transacciones de un bloque en un solo hash (la raíz). La prueba demuestra que una transacción está incluida con muy pocos hashes. | [2.6](02-blockchain.md#26-el-árbol-de-merkle) |
| **Minar** | Probar nonces de bloque hasta que el hash cumpla la dificultad. | [2.7](02-blockchain.md#27-la-prueba-de-trabajo-minar) |
| **n (orden)** | Cuántas veces hay que sumar G para volver al punto en el infinito. Las claves privadas van de 1 a n − 1. | [3.6](03-criptografia.md#36-por-qué-es-seguro-el-logaritmo-discreto) |
| **Nonce de bloque** | Contador que el minero cambia para buscar un hash válido. Es público y no importa que se repita. | [2.5](02-blockchain.md#25-los-bloques) |
| **Nonce de firma (k)** | Número secreto de un solo uso de cada firma ECDSA. **Si se repite, se pierde la clave privada.** | [3.8](03-criptografia.md#38-el-nonce-k-el-punto-débil) |
| **Principio del palomar** | Si hay más elementos que casillas, alguna casilla tiene al menos dos. Explica por qué Bob repite nonce. | [4.8](04-vulnerabilidad.md#48-cómo-ocurre-en-la-simulación) |
| **Prueba de trabajo** | Exigir que el hash de un bloque cumpla una condición difícil de alcanzar y fácil de verificar. | [2.7](02-blockchain.md#27-la-prueba-de-trabajo-minar) |
| **Punto en el infinito (O)** | El "cero" de la suma de puntos: P + O = P y P + (−P) = O. | [3.4](03-criptografia.md#34-curvas-elípticas) |
| **Replay (ataque de repetición)** | Volver a enviar una transacción vieja y válida. Lo impide el contador `seq`. | [2.3](02-blockchain.md#23-las-transacciones) |
| **RFC 6979** | Estándar que calcula k a partir de la clave privada y del mensaje, sin azar. Es la defensa. | [4.10](04-vulnerabilidad.md#410-la-defensa) |
| **RNG** | Generador de números aleatorios (random number generator). | [3.8](03-criptografia.md#38-el-nonce-k-el-punto-débil) |
| **secp256k1** | La curva y² = x³ + 7 con un primo de 256 bits. Es la de Bitcoin. | [3.6](03-criptografia.md#36-por-qué-es-seguro-el-logaritmo-discreto) |
| **Semilla** | Número del que salen todos los datos simulados. La misma semilla da la misma red. | [1](01-proyecto.md#los-personajes-de-la-simulación) |
| **seq** | Contador de transacciones de cada cuenta. Evita repeticiones. | [2.3](02-blockchain.md#23-las-transacciones) |
| **SHA-256** | La función hash que usa el proyecto (y Bitcoin). Da 256 bits. | [3.2](03-criptografia.md#32-funciones-hash-sha-256) |
| **Transacción** | Orden de pago firmada: emisor, destinatario, monto, seq, memo y firma. | [2.3](02-blockchain.md#23-las-transacciones) |
| **txid** | Hash de una transacción. Su identificador único. | [2.3](02-blockchain.md#23-las-transacciones) |
| **Validador** | Programa que revisa toda la cadena y reporta cualquier regla incumplida. | [2.8](02-blockchain.md#28-el-validador-cómo-se-detecta-una-manipulación) |
| **z** | El hash del mensaje, como número. Es lo que se firma en realidad. | [3.7](03-criptografia.md#37-la-firma-digital-ecdsa) |

# 7. Guion para exponer

> **En una frase:** un recorrido de unos 15 minutos por la aplicación, que va del
> síntoma (una alerta) a la causa (las matemáticas) y termina en la solución.

La interfaz no impone un orden, así que este es solo una sugerencia. Cada paso
dice **qué abrir**, **qué hacer** y **qué decir**.

---

## Antes de empezar

- [ ] Compilar la interfaz una vez: `cd frontend && npm install && npm run build`.
- [ ] Arrancar: `python -m server`. Abrir `http://localhost:8000`.
- [ ] Si el servidor tiene `MINICHAIN_ADMIN_TOKEN` (siempre en la versión
      publicada): pulsar **Administrar** en el encabezado e ingresar el token en el
      PC desde el que se expone. Sin eso no aparecen Minar, Transferir ni Explotar.
- [ ] Ir a **Escenario** y comprobar: semilla 2026, dificultad 14, Bob con **RNG
      defectuoso**, entropía 3. Pulsar **Regenerar** para partir de una red limpia.
- [ ] Si el público se va a conectar desde sus celulares: arrancar con
      `MINICHAIN_HOST=0.0.0.0 python -m server` y compartir la IP del computador
      (ver [Despliegue](DESPLIEGUE.md)).
- [ ] Plan B si algo falla: `python -m minichain --pausa` en una terminal cuenta la
      misma historia paso a paso.

---

## 0. Opcional: que el público se una (3 min) · Tú → Mi billetera

**Hacer:** compartir la URL. Cada persona abre **Mi billetera** en su celular,
escribe su nombre y pulsa **Crear billetera**. Desde el PC (administrador), enviarle
monedas a algunos con **Transferir** y **Minar**. Pedirles que se envíen entre ellos.

**Decir:** "La clave privada de cada uno se acaba de generar en su celular y no salió
de ahí. Para enviar no necesitan contraseña: la firma es la prueba de que son
ustedes. Ni yo, que administro el servidor, puedo gastar su dinero."

---

## 1. El síntoma (1 min) · Red → Resumen

**Hacer:** mostrar la pantalla de inicio.

**Decir:** "Esto es un explorador de una blockchain simulada, con la misma curva y
el mismo algoritmo de firma que Bitcoin. Hay cinco billeteras y unas veinte
transacciones. Y el sistema nos está avisando de algo: la clave privada de Bob está
expuesta. Nadie entró a su computador. Esto se descubrió leyendo la cadena, que es
pública. Vamos a entender por qué."

---

## 2. Qué es una blockchain (3 min) · Red → Bloques

**Hacer:**
1. Señalar la tira de bloques: cada uno apunta al hash del anterior.
2. En el inspector, pestaña **Encabezado**: mostrar "Lo que se hashea" y que el hash
   empieza con ceros.
3. Pestaña **Árbol de Merkle**: elegir una transacción y mostrar el camino resaltado.
4. Abrir el diálogo **Minar** y minar un bloque con dificultad 16 o 18: mostrar los
   intentos.

**Decir:**
- "Cada bloque guarda la huella del anterior. Si alguien cambia algo del pasado, la
  huella cambia y el siguiente bloque deja de cuadrar."
- "El árbol de Merkle resume todas las transacciones en un solo hash, y permite
  probar que una transacción está en el bloque con muy pocos datos."
- "Minar es buscar a ciegas un número que haga que el hash empiece con ceros. Cada
  bit de dificultad duplica el trabajo. Por eso reescribir la historia es caro."

---

## 3. Que no se puede manipular (2 min) · Seguridad → Integridad

**Hacer:**
1. Pestaña **Cadena actual**: válida.
2. Pestaña **Simular manipulación**: elegir "Cambiar el monto" → **Aplicar y validar**.
3. Repetir con "Cambiar el monto, recalcular Merkle y re-minar".

**Decir:** "Si cambio un monto, falla la firma y la raíz de Merkle. Si además
recalculo y vuelvo a minar, se rompe el enlace con el bloque siguiente. El
validador revisa diez reglas y no se le escapa ninguna. Entonces, ¿cómo le robaron
a Bob?"

---

## 4. Las matemáticas (4 min) · Laboratorio

### Curva elíptica

**Hacer:** elegir el ejemplo "y² = x³ + 7 (mod 67)". Hacer clic en dos puntos para
sumarlos. Cambiar a **Escalar k · P** y calcular con k = 13.

**Decir:** "Los puntos de una curva elíptica se pueden sumar, y el resultado es otro
punto de la curva. Multiplicar un punto por un número es fácil (aquí está la tabla
de double-and-add), pero deshacerlo, encontrar el número a partir del punto, es
imposible con números de 256 bits. Eso es lo que separa la clave privada de la
pública."

### ECDSA

**Hacer:**
1. Firmar con **RFC 6979** y recorrer la derivación de la derecha: z, k, r, s y la
   verificación.
2. Escribir otro mensaje en "Verificar la misma firma sobre otro mensaje": inválida.
3. Cambiar a **Fijo**, firmar un mensaje, cambiar el texto y volver a firmar.
4. Aparece "Nonce repetido detectado" → **Recuperar la clave privada**.

**Decir:** "Cada firma usa un número secreto de un solo uso, el nonce k. Una firma
sola no revela nada: es una ecuación con dos incógnitas. Pero si se repite k, tengo
dos ecuaciones con las mismas dos incógnitas, y las puedo resolver. Mírenlo: con dos
firmas públicas sale la clave privada, idéntica a la de arriba."

---

## 5. El ataque sobre la cadena (3 min) · Seguridad → Análisis de firmas

**Hacer:**
1. Mostrar las métricas y la tabla de firmas: las filas rojas de Bob con el mismo r.
2. En el inspector, recorrer la **Recuperación**: k, d, y d·G = Q.
3. En **Explotar**, enviar los fondos a Mallory y pulsar el botón.
4. Señalar el aviso: "La validación sigue pasando", y la tabla de saldos.

**Decir:**
- "La billetera de Bob tenía un generador de números aleatorios defectuoso, como el
  de Android en 2013: solo ocho valores posibles. Firmó diez veces, así que por el
  principio del palomar tuvo que repetir."
- "Mallory solo leyó la cadena. Con dos firmas calculó la clave de Bob y firmó una
  transferencia de todo su saldo. El validador la acepta, porque la firma es
  perfecta: está hecha con la clave verdadera. No hay forma de distinguir a Bob de
  alguien que tiene su clave."
- "Lo mismo le pasó a Sony con la PlayStation 3 en 2010: usaban siempre el mismo k."

---

## 6. La defensa (2 min) · Análisis de firmas → Comparar estrategias

**Hacer:**
1. **Ejecutar** la comparación: con RFC 6979, cero claves recuperadas.
2. **Firmar tres mensajes con la misma clave**: los dos iguales dan el mismo r, el
   distinto da otro.
3. Ir a **Escenario**, cambiar el nonce de Bob a RFC 6979, **Regenerar**, y volver al
   Resumen: la alerta desapareció.

**Decir:** "La solución es no depender del azar: calcular k a partir de la clave
privada y del mensaje, con el estándar RFC 6979. Mensajes distintos dan nonces
distintos e impredecibles; el mismo mensaje da la misma firma, que no sirve para el
ataque. Y una advertencia: cambiar la billetera ahora no salva las firmas viejas. Si
ya se repitió un nonce, hay que mover los fondos a una clave nueva."

---

## Preguntas frecuentes del público

**¿La blockchain está cifrada?**
No. Todo es público a propósito. La criptografía se usa para firmar (probar quién
autorizó cada pago) y para hashear (detectar cambios). Ver
[3.1](03-criptografia.md#31-cifrar-firmar-y-hashear-no-son-lo-mismo).

**¿Esto rompe Bitcoin?**
No. Bitcoin y ECDSA están bien; el fallo está en una billetera que genera mal sus
nonces. Las billeteras modernas usan RFC 6979 y no tienen este problema.

**¿No basta con un validador más estricto?**
No. Una firma hecha con la clave robada es matemáticamente idéntica a una del dueño.

**¿Cuánto tarda el ataque con números reales?**
Milisegundos: son unas pocas restas, multiplicaciones e inversos modulares.

**¿Por qué Bob repite si su generador es "aleatorio"?**
Porque solo tiene 8 estados posibles (está mal inicializado, como el de Android).
Con 10 firmas y 8 valores, alguno se repite por fuerza.

**¿Y si dos personas distintas usan el mismo k?**
Entonces hay tres incógnitas y dos ecuaciones; el despeje directo no alcanza, pero
basta con que se filtre una de las dos claves para que caiga la otra.

**¿Qué pasa si se firma dos veces el mismo mensaje con RFC 6979?**
Sale exactamente la misma firma. Como z₁ = z₂ y s₁ = s₂, las ecuaciones del ataque
dan 0 = 0: no revelan nada.

---

Anterior: [6. La interfaz](06-interfaz.md) · Índice: [Documentación](README.md)

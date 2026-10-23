# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase12d-torch.spec.ts >> a lit torch is visible and its fuel freezes with the paused world
- Location: artifacts\verification\m16-2.26\baseline-checkout\e2e\phase12d-torch.spec.ts:4:1

# Error details

```
Error: page.evaluate: Error: Could not place a hearth for torch fixture
    at eval (eval at evaluate (:311:30), <anonymous>:23:24)
    at UtilityScript.evaluate (<anonymous>:313:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic:
      - generic [ref=e4]:
        - generic [ref=e5]: A0 primavera d5 00:24 · 6°C
        - generic [ref=e6]: Paleolítico inferior · 31 vivos · 0/9 construidos · paso 4
        - button "Continuar" [active] [ref=e7] [cursor=pointer]
        - slider [ref=e8]: "5"
        - generic [ref=e9]: 5/s
        - button "Construir" [ref=e10] [cursor=pointer]
        - button "Fabricar" [ref=e11] [cursor=pointer]
        - generic "Cuánto hace tu personaje por sí mismo (R)" [ref=e12]:
          - button "Tú diriges" [ref=e13] [cursor=pointer]
          - button "Se mantiene vivo" [ref=e14] [cursor=pointer]
          - button "Actúa solo" [ref=e15] [cursor=pointer]
        - button "⚙" [ref=e16] [cursor=pointer]
      - generic [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e19]: Garra Rhaiksen
          - button "▾" [ref=e20] [cursor=pointer]
        - generic [ref=e21]:
          - generic [ref=e22]: Garra Rhaiksen tú
          - generic [ref=e23]: hombre, 33 años · banda Belsh
          - generic [ref=e24]: eres tú
          - generic [ref=e25]: sin nada que hacer
          - generic [ref=e26]:
            - button "Ahora" [ref=e27] [cursor=pointer]
            - button "Perfil" [ref=e28] [cursor=pointer]
            - button "Equipo" [ref=e29] [cursor=pointer]
            - button "Trabajo" [ref=e30] [cursor=pointer]
            - button "Lazos" [ref=e31] [cursor=pointer]
            - button "Vida" [ref=e32] [cursor=pointer]
          - generic [ref=e33]: Estado
          - generic [ref=e34]:
            - generic [ref=e35]: salud
            - generic [ref=e38]: "100"
          - generic [ref=e39]:
            - generic [ref=e40]: hambre
            - generic [ref=e42]: "0"
          - generic [ref=e43]:
            - generic [ref=e44]: sed
            - generic [ref=e46]: "0"
          - generic [ref=e47]:
            - generic [ref=e48]: cansancio
            - generic [ref=e50]: "0"
          - generic [ref=e51]:
            - generic [ref=e52]: frío
            - generic [ref=e54]: "0"
          - generic [ref=e55]:
            - generic [ref=e56]: soledad
            - generic [ref=e58]: "0"
          - generic [ref=e59]: "Motivo de querencia: 0.00"
          - generic [ref=e60]: Dieta · parte de las comidas recientes
          - generic [ref=e61]:
            - generic [ref=e62]: grasa
            - generic [ref=e65]: "27"
          - generic [ref=e66]:
            - generic [ref=e67]: proteína
            - generic [ref=e70]: "23"
          - generic [ref=e71]:
            - generic [ref=e72]: hidratos
            - generic [ref=e75]: "50"
          - generic [ref=e76]: Hoy todavía no ha comido nada.
          - generic [ref=e77]: Come una dieta bastante equilibrada.
          - generic [ref=e78]: Lleva
          - generic [ref=e79]: Antorcha ×1, Hacha de mano ×1
          - generic [ref=e80]: Quiere
          - generic [ref=e81]:
            - generic [ref=e82]:
              - generic [ref=e83]: dormido
              - generic [ref=e86]: "6.37"
            - generic [ref=e87]:
              - generic [ref=e88]: descansando
              - generic [ref=e91]: "0.85"
            - generic [ref=e92]:
              - generic [ref=e93]: propose
              - generic [ref=e96]: "0.71"
            - generic [ref=e97]:
              - generic [ref=e98]: trayendo materiales
              - generic [ref=e101]: "0.47"
            - generic [ref=e102]:
              - generic [ref=e103]: entrenando
              - generic [ref=e106]: "0.26"
            - generic [ref=e107]:
              - generic [ref=e108]: recolectando
              - generic [ref=e111]: "0.15"
      - generic [ref=e112]: WASD caminar · arrastrar mover · F centrar · clic examinar · clic derecho acciones · B construir · M fabricar · C mandar · G red tecnológica · K árbol familiar · T grafo de la tribu · O mundo · V levantar el tejado · Z alternar niebla de guerra · R quién dirige · P plegar panel · H ocultar interfaz · espacio pausa · Esc menú
      - button "El mundo tal como lo conoces (O)" [ref=e114] [cursor=pointer]: ◍
  - generic: v0.16.18-alpha (efecda)
  - button "Casas rivales" [ref=e115] [cursor=pointer]
```
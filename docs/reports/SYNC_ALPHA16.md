# Sincronización con 2.1.0-alpha.16 (en curso)

`package.lock` apunta a `v2.1.0-alpha.16/JWPLC-Sim/feature/ui-widgets-runtime` (platform-jwplc), que contiene PR #199 (API gráfica de `JWPLC_TFT` 0.4.0) y la librería nueva `JWPLC_UI_Widgets`. Al fusionarse en `v2.1.0-alpha.16/JWPLC-Sim/main` se vuelve a fijar el commit de esa rama.

## Cambios del package que afectan al simulador

| Cambio | Efecto en JWPLC Sim |
|---|---|
| `JWPLC_TFT` en modo fuente con TFT_eSPI 2.5.43 en `src/` | `JWPLC_TFT.cpp` incluye la copia local; el autoload ya no arrastra la TFT_eSPI de `third_party`. Con `JWSIM`, la copia de `src/` se compila con el procesador Generic (la resolvió el package, sin cambios aquí). `parity --update`: TFT_eSPI sale del autoload |
| `JWPLC_TFT` 0.4.0: recorte, líneas gruesas, polilíneas y sprites | Ejemplo nuevo `Display_Graficos_Sprite`, con prueba y 3 capturas |
| Librería nueva `JWPLC_UI_Widgets` 0.1.0 | `parity --update`; ejemplo `Widgets_Parametros`, con prueba y 6 capturas |

La entrada `TFT_eSPI` de `thirdPartyLibraries` y su `flagOverrides` se mantienen: no se enlazan mientras ningún sketch incluya `<TFT_eSPI.h>` directamente.

## Resultado (01/11/2026, Linux native)

- `jwsim-cli parity`: PASS (0 diferencias).
- `jwsim-cli matrix` con el package en `3ba1996` (PR #199): 126 ejemplos; 125 compilan, corren y pasan su prueba. El único sin prueba era `Display_Graficos_Sprite`, que se añade aquí.
- `jwsim-cli test` de los dos ejemplos nuevos: PASS, deterministas en dos corridas.
- `JWSIM_G4_TFT_HMI` (native): la página RTC difiere 170 px de la referencia **también con alpha.15**; no viene de estos cambios.

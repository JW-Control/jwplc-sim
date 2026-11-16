# Módulo hidropónico NFT

Módulo NFT (película de nutrientes) con reservorio. Entradas a 24 VDC: bomba de recirculación (B1-B2), electroválvula de llenado (V1-V2) y bomba dosificadora de nutrientes (D1-D2). Salidas: flotador de nivel bajo (LS1-LS2, cierra con el nivel bajo), nivel 4-20 mA (AO+ AO-, 0-100 %) y sensor de pH, conductividad y temperatura por RS-485 (Modbus RTU, dirección 3, 9600 8N1; input 0 = pH×100, 1 = CE×100 mS/cm, 2 = °C×10, 3 = nivel×10 %; holding 0 = consigna de CE×100). Las plantas consumen agua mientras circula la solución y la CE sube al dosificar y baja al llenar.

Componente hecho con el editor de componentes de JWPLC Sim (Herramientas → Editor de componentes). Es solo datos: `component.json` (E/S, modelo por bloques y comunicación) y `symbol.svg` (generado; el dibujo original está en `art.svg`). Formato: `docs/COMPONENTES.md`.

Bornes: `V+`, `V-`, `B1`, `B2`, `V1`, `V2`, `D1`, `D2`, `LS1`, `LS2`, `AO+`, `AO-`, `A`, `B`.

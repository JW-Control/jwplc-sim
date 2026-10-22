# Modelo ST7789

Controlador de pantalla TFT de Sitronix, interfaz SPI de 4 hilos (D/C
aparte), con el panel IPS de 1,9" 170×320 del JWPLC Basic (CS = GPIO33, D/C
= GPIO25, RST = GPIO14; `jwplc_spi_bus.h` y `JWPLC_TFT/src/tft_setup.h`).
Referencia: **ST7789V datasheet v1.6** (Sitronix). Implementación:
[`st7789.cpp`](st7789.cpp), interfaz
[`../include/jwsim/models/st7789.h`](../include/jwsim/models/st7789.h). El
código bajo prueba es TFT_eSPI 2.5.43 con la configuración del package.

## Comportamiento modelado

| # | Comportamiento | Sección | Estado |
|---|---|---|---|
| 1 | CASET/RASET fijan la ventana; RAMWR escribe píxeles RGB565 (MSB primero) recorriendo columnas y luego páginas | 9.1.20–22 | Modelado |
| 2 | Al pasar el final de la ventana, la escritura vuelve al inicio | 8.12 | Modelado |
| 3 | MADCTL MV intercambia columna/página; MX invierte el sentido de la columna | 9.1.28, 8.12 | Modelado |
| 4 | MADCTL MY invierte el sentido de la página | 9.1.28 | Modelado |
| 5 | D/C bajo = comando, alto = parámetros/datos; un comando sigue vigente entre ciclos de CS (TFT_eSPI envía comando y datos por separado) | 8.4 | Modelado |
| 6 | Vista del panel: columnas 35..204 de la memoria, girada a horizontal (320×170, `setRotation(1)` de JWPLC_TFT); BGR e INVON son los de fábrica del panel: sin ellos se ven rojo/azul intercambiados o colores invertidos | 9.1.28, 9.1.9 | Modelado (panel BGR e IPS invertido, según `tft_setup.h`) |
| 7 | Tras reset la pantalla duerme (SLPIN) y está apagada (DISPOFF): se ve negra hasta SLPOUT + DISPON | 9.1.1, 9.1.15 | Modelado |
| 8 | RESX (RST) en bajo reinicia los registros | 7.4 | Modelado (la memoria conserva su contenido) |
| 9 | Zona cambiada (para enviar a la interfaz solo lo que cambió) | — (del simulador) | Modelado |

## No modelado

- Lectura de memoria y registros (RAMRD, RDDID): SDO no está conectado al bus
  en el JWPLC Basic; el modelo responde 0xFF.
- Desplazamiento vertical (VSCRDEF/VSCSAD), modo parcial, 12/18 bits por
  píxel, gamma y tensiones (PORCTRL, VCOMS, PVGAMCTRL...): se aceptan sin
  efecto visible.
- Retroiluminación: siempre encendida.

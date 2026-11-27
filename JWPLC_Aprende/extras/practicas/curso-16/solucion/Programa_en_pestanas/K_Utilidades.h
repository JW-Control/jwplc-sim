/*
  K_Utilidades.h · Temporizadores y flancos (no se edita)

  Las clases de la lección 14:
    TON     t.ejecutar(entrada, 2000)  true cuando la entrada lleva 2 s activa
    TOF     t.ejecutar(entrada, 5000)  sigue true 5 s después de la entrada
    Flanco  f.subida(senal) / f.bajada(senal)  true solo en la vuelta del cambio

  Crea un objeto por cada uso, en B_Tags.h.
*/
#pragma once

class TON
{
public:
    bool ejecutar(bool entrada, uint32_t tiempoMs)
    {
        if (!entrada)
        {
            contando = false;
            salida = false;
        }
        else
        {
            if (!contando)
            {
                contando = true;
                inicio = millis();
            }
            salida = millis() - inicio >= tiempoMs;
        }
        return salida;
    }

private:
    uint32_t inicio = 0;
    bool contando = false;
    bool salida = false;
};

class TOF
{
public:
    bool ejecutar(bool entrada, uint32_t tiempoMs)
    {
        if (entrada)
        {
            salida = true;
            caida = millis();
        }
        else if (salida && millis() - caida >= tiempoMs)
        {
            salida = false;
        }
        return salida;
    }

private:
    uint32_t caida = 0;
    bool salida = false;
};

class Flanco
{
public:
    bool subida(bool senal)
    {
        bool hubo = senal && !anterior;
        anterior = senal;
        return hubo;
    }

    bool bajada(bool senal)
    {
        bool hubo = !senal && anterior;
        anterior = senal;
        return hubo;
    }

private:
    bool anterior = false;
};

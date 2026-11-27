// Curso JWPLC Basic · Lección 14 · Temporizadores y flancos como clases
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// ---------------------------------------------------------------------------
// La caja de herramientas: TON, TOF y Flanco, como los bloques de un PLC.
// Tienen los mismos nombres que la pestaña K_Utilidades de la plantilla de
// proyecto JWPLC, así que ya sabrás usarlos cuando llegues a ella.
// ---------------------------------------------------------------------------

// Retardo a la conexión: salida = la entrada lleva "tiempoMs" activa.
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

// Retardo a la desconexión: la salida sigue "tiempoMs" después de la entrada.
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

// Flanco: true solo en la vuelta en que la señal cambia.
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

// ---------------------------------------------------------------------------
// La máquina: un compresor de aire.
// ---------------------------------------------------------------------------

// Un objeto por cada uso. Nunca compartas un temporizador entre dos usos:
// cada uno tiene que recordar su propio tiempo.
TON filtroPresostato;   // La presión tiene que estar baja 2 s seguidos.
TOF ventilacion;        // El ventilador sigue 5 s después de parar.
Flanco arranqueMotor;   // Para contar arranques.

bool compresor = false;
uint32_t arranques = 0;

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 14: presostato I0.0, compresor Q0.0, ventilador Q0.1");
}

void loop()
{
    bool presionBaja = digitalRead(I0_0) == HIGH;

    // El compresor marcha mientras el presostato pida aire, filtrado 2 s.
    compresor = filtroPresostato.ejecutar(presionBaja, 2000);

    if (arranqueMotor.subida(compresor))
    {
        arranques = arranques + 1;
        Serial.println("Arranques: " + String(arranques));
    }

    digitalWrite(Q0_0, compresor);
    digitalWrite(Q0_1, ventilacion.ejecutar(compresor, 5000));
}

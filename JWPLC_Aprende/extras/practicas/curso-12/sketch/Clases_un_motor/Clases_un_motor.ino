// Curso JWPLC Basic · Lección 12 · Clases: un motor con sus funciones
// La guía de la lección (qué vas a aprender, qué conectar, cómo probarlo y
// qué practicar) está en el README.md del ejemplo; en JWPLC Sim se ve a la
// izquierda del código.

// Una clase es el plano de un equipo: qué datos guarda y qué sabe hacer.
// Con este plano se arman todos los motores que haga falta.
class Motor
{
public:
    // El constructor: se ejecuta una vez al crear cada motor y le dice
    // qué relé maneja y cómo se llama.
    Motor(uint16_t rele, String texto)
    {
        salida = rele;
        nombre = texto;
    }

    // La marcha y parada de la lección 08, escrita una sola vez.
    void controlar(bool marcha, bool paradaSinApretar)
    {
        if (marcha && paradaSinApretar)
        {
            arrancar();
        }
        if (!paradaSinApretar)
        {
            parar();
        }
        digitalWrite(salida, enMarcha);
    }

    void arrancar()
    {
        if (!enMarcha)
        {
            enMarcha = true;
            Serial.println(nombre + " en marcha");
        }
    }

    void parar()
    {
        if (enMarcha)
        {
            enMarcha = false;
            Serial.println(nombre + " detenida");
        }
    }

    bool estaEnMarcha()
    {
        return enMarcha;
    }

private:
    // Los datos de cada motor. "private": solo las funciones de la clase
    // los tocan, así nadie cambia enMarcha sin pasar por arrancar() o parar().
    uint16_t salida;
    String nombre;
    bool enMarcha = false;
};

// Dos objetos hechos con el mismo plano, cada uno con sus propios datos.
Motor bomba1(Q0_0, "Bomba 1");
Motor bomba2(Q0_1, "Bomba 2");

void setup()
{
    Serial.begin(115200);
    Serial.println("Lección 12: bomba 1 en I0.0/I0.1, bomba 2 en I0.2/I0.3");
}

void loop()
{
    // Las paradas son NC: activas mientras nadie las aprieta.
    bomba1.controlar(digitalRead(I0_0) == HIGH, digitalRead(I0_1) == HIGH);
    bomba2.controlar(digitalRead(I0_2) == HIGH, digitalRead(I0_3) == HIGH);
}

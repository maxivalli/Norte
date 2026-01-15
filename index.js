const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require('dotenv').config();

const app = express();

// --- CONFIGURACIÓN ---
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// --- CONEXIÓN A POSTGRES ---
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// --- AUTO-MIGRACIÓN: CREACIÓN DE TABLA SI NO EXISTE ---
const inicializarTabla = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS autos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      precio NUMERIC DEFAULT 0,
      moneda VARCHAR(10) DEFAULT 'U$S',
      imagenes TEXT[], 
      motor VARCHAR(100),
      transmision VARCHAR(50),
      anio INTEGER,
      combustible VARCHAR(50),
      kilometraje INTEGER,
      descripcion TEXT,
      reservado BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log("✅ Tabla 'autos' verificada/creada");
  } catch (err) {
    console.error("❌ Error al crear la tabla:", err.message);
  }
};

// Ejecutar inicialización al arrancar
inicializarTabla();

// Chivato de conexión
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Error de conexión DB:", err.message);
  } else {
    console.log("✅ Conexión a la DB establecida correctamente");
  }
});

// --- RUTAS API ---

// 1. OBTENER TODOS LOS AUTOS
app.get("/api/autos", async (req, res) => {
  try {
    const query = "SELECT * FROM autos ORDER BY id DESC";
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error en el servidor");
  }
});

// 2. CREAR AUTO NUEVO
app.post("/api/autos", async (req, res) => {
  try {
    const {
      nombre, precio, imagenes, reservado, motor, transmision,
      anio, combustible, descripcion, kilometraje, moneda,
    } = req.body;

    const query = `
      INSERT INTO autos 
      (nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *`;

    const values = [
      nombre, parseInt(precio) || 0, imagenes, reservado || false, motor,
      transmision, parseInt(anio) || 0, combustible, descripcion,
      parseInt(kilometraje) || 0, moneda,
    ];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error al guardar");
  }
});

// 3. EDITAR AUTO
app.put("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre, precio, imagenes, reservado, motor, transmision,
      anio, combustible, descripcion, kilometraje, moneda,
    } = req.body;

    const query = `
      UPDATE autos 
      SET nombre=$1, precio=$2, imagenes=$3, reservado=$4, motor=$5, 
          transmision=$6, anio=$7, combustible=$8, descripcion=$9, 
          kilometraje=$10, moneda=$11
      WHERE id=$12
      RETURNING *`;

    const values = [
      nombre, parseInt(precio) || 0, imagenes, reservado, motor,
      transmision, parseInt(anio) || 0, combustible, descripcion,
      parseInt(kilometraje) || 0, moneda, id
    ];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error al editar");
  }
});

// 4. ELIMINAR AUTO
app.delete("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM autos WHERE id = $1", [id]);
    res.json({ message: "Eliminado correctamente" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error al eliminar");
  }
});

// --- INICIAR SERVIDOR ---
// Railway asigna el puerto automáticamente mediante process.env.PORT
const PORT = process.env.PORT || 5001; 
app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});
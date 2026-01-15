const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require('dotenv').config();

const app = express();

// --- 1. CONFIGURACIÓN DE CORS MANUAL (Solución definitiva) ---
app.use((req, res, next) => {
  // Permite que cualquier origen conecte (localhost, vercel, etc.)
  res.header("Access-Control-Allow-Origin", "*"); 
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  
  // Responder inmediatamente a la petición de prueba (Preflight)
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// --- 2. MIDDLEWARES ---
app.use(express.json()); // Importante: debajo del CORS

// --- 3. CONEXIÓN A POSTGRES ---
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_PUBLIC, // Para trabajar en producción poner DARABASE_URL
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// --- 4. AUTO-MIGRACIÓN (Crear tabla) ---
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
    console.log("✅ Tabla 'autos' verificada");
  } catch (err) {
    console.error("❌ Error en tabla:", err.message);
  }
};

inicializarTabla();

// --- 5. RUTAS API ---

// GET - Obtener todos
app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

// POST - Crear
app.post("/api/autos", async (req, res) => {
  try {
    const { nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda } = req.body;
    const query = `
      INSERT INTO autos 
      (nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
    const values = [nombre, parseInt(precio) || 0, imagenes, reservado || false, motor, transmision, parseInt(anio) || 0, combustible, descripcion, parseInt(kilometraje) || 0, moneda];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar" });
  }
});

// PUT - Editar
app.put("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda } = req.body;
    const query = `
      UPDATE autos SET nombre=$1, precio=$2, imagenes=$3, reservado=$4, motor=$5, transmision=$6, anio=$7, combustible=$8, descripcion=$9, kilometraje=$10, moneda=$11
      WHERE id=$12 RETURNING *`;
    const values = [nombre, parseInt(precio) || 0, imagenes, reservado, motor, transmision, parseInt(anio) || 0, combustible, descripcion, parseInt(kilometraje) || 0, moneda, id];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al editar" });
  }
});

// DELETE - Borrar
app.delete("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM autos WHERE id = $1", [id]);
    res.json({ message: "Eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

// --- 6. INICIO ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});
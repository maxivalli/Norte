const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
require('dotenv').config();

const app = express();

// --- 1. CONFIGURACIÓN ---
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "dist")));

const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// --- 2. MIGRACIÓN Y VERIFICACIÓN ---
const inicializarTabla = async () => {
  try {
    // Creamos la tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS autos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        precio NUMERIC DEFAULT 0,
        moneda VARCHAR(10) DEFAULT '$',
        imagenes TEXT[], 
        motor VARCHAR(100),
        transmision VARCHAR(50),
        anio INTEGER,
        combustible VARCHAR(50),
        kilometraje INTEGER,
        descripcion TEXT,
        color VARCHAR(100),
        reservado BOOLEAN DEFAULT false,
        visitas INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Verificamos si existe la columna color (por si la tabla ya existía de antes)
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='autos' AND column_name='color') THEN
          ALTER TABLE autos ADD COLUMN color VARCHAR(100);
        END IF;
      END $$;
    `);

    console.log("✅ Base de datos lista y color verificado");
  } catch (err) {
    console.error("❌ Error en inicialización de DB:", err.message);
  }
};

inicializarTabla();

// --- 3. FUNCIONES AUXILIARES ---
const crearSlug = (nombre) => {
  if (!nombre) return "";
  return nombre.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// --- 4. RUTAS DE LA API ---

app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

app.patch("/api/autos/:id/visita", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE autos SET visitas = visitas + 1 WHERE id = $1 RETURNING visitas`, 
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar visitas" });
  }
});

app.post("/api/autos", async (req, res) => {
  try {
    const { nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda, color } = req.body;
    const query = `
      INSERT INTO autos 
      (nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda, color, visitas) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0) RETURNING *`;
    const values = [nombre, Math.round(Number(precio)) || 0, imagenes, reservado || false, motor, transmision, Math.round(Number(anio)) || 0, combustible, descripcion, Math.round(Number(kilometraje)) || 0, moneda, color];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al guardar" });
  }
});

app.put("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda, color } = req.body;
    const query = `
      UPDATE autos SET nombre=$1, precio=$2, imagenes=$3, reservado=$4, motor=$5, transmision=$6, anio=$7, combustible=$8, descripcion=$9, kilometraje=$10, moneda=$11, color=$12
      WHERE id=$13 RETURNING *`;
    const values = [nombre, Math.round(Number(precio)) || 0, imagenes, reservado, motor, transmision, Math.round(Number(anio)) || 0, combustible, descripcion, Math.round(Number(kilometraje)) || 0, moneda, color, id];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al editar" });
  }
});

app.delete("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM autos WHERE id = $1", [id]);
    res.json({ message: "Eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

// --- 5. RUTA PARA COMPARTIR (OPTIMIZADA PARA FACEBOOK) ---
app.get("/share/auto/:slug", async (req, res) => {
  const { slug } = req.params;
  const FRONTEND_BASE_URL = "https://norteautomotores.up.railway.app";

  try {
    // Buscamos todos para encontrar el match de slug (o podrías optimizarlo con una columna slug en DB)
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find((a) => crearSlug(a.nombre) === slug);

    if (!auto) return res.redirect(FRONTEND_BASE_URL);

    const titulo = `${auto.nombre} | Norte Automotores`;
    const precioFormat = Number(auto.precio) === 0 ? "Consultar" : `${auto.moneda} ${Math.round(auto.precio).toLocaleString("es-AR")}`;
    const descripcion = `Precio: ${precioFormat} - Año: ${auto.anio}. Motor ${auto.motor}. Ver más detalles en Norte Automotores.`;
    
    // Aseguramos que la imagen sea HTTPS y de buen tamaño para FB
    const imagen = auto.imagenes && auto.imagenes[0] 
      ? auto.imagenes[0].replace("http://", "https://") 
      : "";

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${titulo}</title>
        
        <meta property="og:title" content="${titulo}">
        <meta property="og:description" content="${descripcion}">
        <meta property="og:image" content="${imagen}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:type" content="website">
        <meta property="og:url" content="${FRONTEND_BASE_URL}/auto/${slug}">
        <meta property="og:site_name" content="Norte Automotores">

        <script>window.location.href = "${FRONTEND_BASE_URL}/#catalogo";</script>
        <meta http-equiv="refresh" content="0;url=${FRONTEND_BASE_URL}/#catalogo">
      </head>
      <body style="background: #1a1a1a; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
        <div style="text-align: center;">
          <h2>Redirigiendo a Norte Automotores...</h2>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.redirect(FRONTEND_BASE_URL);
  }
});

// --- 6. REACT COMODÍN ---
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
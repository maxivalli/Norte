const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

// --- 1. CONFIGURACIÓN ---
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "dist")));

const isProduction = process.env.NODE_ENV === "production";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
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
    CREATE TABLE IF NOT EXISTS banners (
      id SERIAL PRIMARY KEY,
      imagen_url TEXT NOT NULL,
      titulo VARCHAR(255),
      activo BOOLEAN DEFAULT true,
      orden INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    console.log("✅ Base de datos lista");
  } catch (err) {
    console.error("❌ Error en inicialización de DB:", err.message);
  }
};

inicializarTabla();

// --- 3. FUNCIONES AUXILIARES ---
const crearSlug = (nombre) => {
  if (!nombre) return "";
  return nombre
    .toLowerCase()
    .trim()
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
      [id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar visitas" });
  }
});

app.post("/api/autos", async (req, res) => {
  try {
    const {
      nombre,
      precio,
      imagenes,
      reservado,
      motor,
      transmision,
      anio,
      combustible,
      descripcion,
      kilometraje,
      moneda,
      color,
      etiqueta,
    } = req.body;
    const query = `
      INSERT INTO autos 
      (nombre, precio, imagenes, reservado, motor, transmision, anio, combustible, descripcion, kilometraje, moneda, color, visitas, etiqueta) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13) RETURNING *`;

    const values = [
      nombre,
      Math.round(Number(precio)) || 0,
      imagenes,
      reservado || false,
      motor,
      transmision,
      Math.round(Number(anio)) || 0,
      combustible,
      descripcion,
      Math.round(Number(kilometraje)) || 0,
      moneda,
      color,
      etiqueta, // <-- Nuevo campo
    ];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al guardar" });
  }
});

app.put("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      precio,
      imagenes,
      reservado,
      motor,
      transmision,
      anio,
      combustible,
      descripcion,
      kilometraje,
      moneda,
      color,
      etiqueta,
    } = req.body;
    const query = `
      UPDATE autos SET nombre=$1, precio=$2, imagenes=$3, reservado=$4, motor=$5, transmision=$6, anio=$7, combustible=$8, descripcion=$9, kilometraje=$10, moneda=$11, color=$12, etiqueta=$13
      WHERE id=$14 RETURNING *`;

    const values = [
      nombre,
      Math.round(Number(precio)) || 0,
      imagenes,
      reservado,
      motor,
      transmision,
      Math.round(Number(anio)) || 0,
      combustible,
      descripcion,
      Math.round(Number(kilometraje)) || 0,
      moneda,
      color,
      etiqueta,
      id,
    ];
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

// --- RUTAS PARA BANNERS ---

// Obtener todos los banners (para el admin)
app.get("/api/banners", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM banners ORDER BY orden ASC, id DESC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener banners" });
  }
});

// Obtener solo banners activos (para la web pública)
app.get("/api/banners/activos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM banners WHERE activo = true ORDER BY orden ASC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener banners activos" });
  }
});

// Guardar un nuevo banner
app.post("/api/banners", async (req, res) => {
  try {
    const { imagen_url, titulo, orden } = req.body;
    const query = `
      INSERT INTO banners (imagen_url, titulo, orden) 
      VALUES ($1, $2, $3) RETURNING *`;
    const values = [imagen_url, titulo, orden || 0];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al guardar banner" });
  }
});

// Borrar un banner
app.delete("/api/banners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM banners WHERE id = $1", [id]);
    res.json({ message: "Banner eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar banner" });
  }
});

// Alternar estado activo/inactivo (opcional para el admin)
app.patch("/api/banners/:id/estado", async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    const result = await pool.query(
      "UPDATE banners SET activo = $1 WHERE id = $2 RETURNING *",
      [activo, id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar estado" });
  }
});

// --- 5. RUTA PARA COMPARTIR (DEBE IR ANTES DEL COMODÍN) ---
app.get("/share/auto/:slug", async (req, res) => {
  const { slug } = req.params;
  const FRONTEND_BASE_URL = "https://norteautomotores.up.railway.app";

  try {
    // Traemos los autos para comparar el slug
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find((a) => crearSlug(a.nombre) === slug);

    // SI NO EXISTE EL AUTO, REDIRIGE AL HOME
    if (!auto) {
      console.log("Auto no encontrado para el slug:", slug);
      return res.redirect(FRONTEND_BASE_URL);
    }

    const titulo = `${auto.nombre} | Norte Automotores`;
    const precioFormat =
      Number(auto.precio) === 0
        ? "Consultar"
        : `${auto.moneda} ${Math.round(auto.precio).toLocaleString("es-AR")}`;

    const descripcion = `Precio: ${precioFormat} - Año: ${auto.anio}. Motor ${auto.motor}. Ver más detalles en Norte Automotores.`;
    const imagen =
      auto.imagenes && auto.imagenes[0]
        ? auto.imagenes[0].replace("http://", "https://")
        : "";

    // Enviamos el HTML con Meta Tags para que WhatsApp/FB lo lean
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
  <meta property="og:title" content="${titulo}">
  <meta property="og:description" content="${descripcion}">
  <meta property="og:image" content="${imagen}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${FRONTEND_BASE_URL}/share/auto/${slug}">
  <meta http-equiv="refresh" content="2;url=${FRONTEND_BASE_URL}/auto/${slug}">
</head>

</html>
`);
  } catch (err) {
    console.error("Error en share:", err);
    res.redirect(FRONTEND_BASE_URL);
  }
});

// --- 6. REACT COMODÍN (SIEMPRE AL FINAL) ---
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

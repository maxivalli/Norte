const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require('dotenv').config();

const app = express();

// --- 1. MIDDLEWARES Y CORS ---
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); 
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// --- 2. CONEXIÓN A POSTGRES ---
const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// --- 3. AUTO-MIGRACIÓN ---
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

// --- 4. FUNCIÓN SLUG (Igual al Frontend) ---
const crearSlug = (nombre) => {
  if (!nombre) return "";
  return nombre.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
};

// --- 5. RUTAS DE LA API ---
app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

// (Aquí puedes mantener tus rutas POST, PUT, DELETE de antes)

// --- 6. ARCHIVOS ESTÁTICOS (Vite usa 'dist') ---
app.use(express.static(path.join(__dirname, "dist")));

// --- 7. RUTA SEO PARA WHATSAPP (EL CORAZÓN DEL PROBLEMA) ---
app.get("/auto/:slug", async (req, res) => {
  let { slug } = req.params;
  
  // Limpieza por si el slug viene con texto o espacios pegados
  slug = slug.split(" ")[0].split("%20")[0].toLowerCase();

  const indexPath = path.join(__dirname, "dist", "index.html");

  try {
    const result = await pool.query("SELECT * FROM autos");
    // Buscamos ignorando mayúsculas/minúsculas
    const auto = result.rows.find((a) => crearSlug(a.nombre) === slug);

    if (!auto || !fs.existsSync(indexPath)) {
      console.log(`Auto no encontrado o index.html inexistente para: ${slug}`);
      return res.sendFile(indexPath);
    }

    let html = fs.readFileSync(indexPath, "utf8");

    const titulo = `${auto.nombre} | Norte Automotores`;
    const precioTxt = `${auto.moneda} ${Number(auto.precio).toLocaleString("es-AR")}`;
    const desc = `${precioTxt} - Año ${auto.anio} - ${Number(auto.kilometraje).toLocaleString("es-AR")} km.`;
    
    // Forzamos JPG y calidad para WhatsApp
    const imagen = auto.imagenes && auto.imagenes[0] 
      ? auto.imagenes[0].replace("/upload/", "/upload/f_jpg,q_auto:good,w_800/") 
      : "";

    // Construimos el bloque Meta
    const metaTags = `
      <title>${titulo}</title>
      <meta name="description" content="${desc}">
      <meta property="og:title" content="${titulo}">
      <meta property="og:description" content="${desc}">
      <meta property="og:image" content="${imagen}">
      <meta property="og:image:secure_url" content="${imagen}">
      <meta property="og:image:type" content="image/jpeg">
      <meta property="og:url" content="https://norteautomotores.up.railway.app/auto/${slug}">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
    `;

    // Inyectamos antes del cierre del </head> para asegurar que sobreescriba todo
    html = html.replace("</head>", `${metaTags}</head>`);

    res.send(html);
  } catch (err) {
    console.error("Error SEO:", err);
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(500).send("Error interno");
  }
});

// --- 8. RUTA COMODÍN PARA REACT ---
app.get(/.*/, (req, res) => {
  const indexPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend no encontrado. Asegúrate de correr npm run build.");
  }
});

// --- 9. INICIO ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
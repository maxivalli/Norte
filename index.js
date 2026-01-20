const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const xlsx = require("xlsx");
require("dotenv").config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 1. CONFIGURACIÓN Y MIDDLEWARES
// ==========================================
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "dist")));

const isProduction = process.env.NODE_ENV === "production";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

// ==========================================
// 2. BASE DE DATOS (INICIALIZACIÓN)
// ==========================================
const inicializarTabla = async () => {
  try {
    // Tabla principal de inventario de autos
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
        etiqueta VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Base de datos lista");
  } catch (err) {
    console.error("❌ Error en inicialización de DB:", err.message);
  }
};
inicializarTabla();

// ==========================================
// 3. UTILIDADES / HELPERS
// ==========================================
const crearSlug = (nombre) => {
  if (!nombre) return "";
  return nombre
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// ==========================================
// 4. API: INVENTARIO DE AUTOS
// ==========================================

// Obtener todos los autos
app.get("/api/autos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM autos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

// Incrementar contador de visitas
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

// Crear nuevo auto
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
      etiqueta,
    ];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al guardar" });
  }
});

// Editar auto existente
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

// Eliminar auto
app.delete("/api/autos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM autos WHERE id = $1", [id]);
    res.json({ message: "Eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

// ==========================================
// 5. API: GESTIÓN DE BANNERS
// ==========================================

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

app.post("/api/banners", async (req, res) => {
  try {
    const { imagen_url, titulo, orden } = req.body;
    const query = `INSERT INTO banners (imagen_url, titulo, orden) VALUES ($1, $2, $3) RETURNING *`;
    const result = await pool.query(query, [imagen_url, titulo, orden || 0]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al guardar banner" });
  }
});

app.delete("/api/banners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM banners WHERE id = $1", [id]);
    res.json({ message: "Banner eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar banner" });
  }
});

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

// ==========================================
// 6. REDIRECCIÓN PARA COMPARTIR (META TAGS)
// ==========================================

app.get("/share/auto/:slug", async (req, res) => {
  const { slug } = req.params;
  const FRONTEND_BASE_URL = "https://norteautomotores.up.railway.app";

  try {
    const result = await pool.query("SELECT * FROM autos");
    const auto = result.rows.find((a) => crearSlug(a.nombre) === slug);

    if (!auto) return res.redirect(FRONTEND_BASE_URL);

    const titulo = `${auto.nombre} | Norte Automotores`;
    const precioFormat =
      Number(auto.precio) === 0
        ? "Consultar"
        : `${auto.moneda} ${Math.round(auto.precio).toLocaleString("es-AR")}`;

    const descripcion = `Precio: ${precioFormat} - Año: ${auto.anio}. Motor ${auto.motor}. Ver más detalles en Norte Automotores.`;
    const imagen = auto.imagenes?.[0]?.replace("http://", "https://") || "";

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
      <body style="background:#1a1a1a;color:white;font-family:sans-serif;text-align:center;padding-top:100px;">
        <img src="${imagen}" style="width:200px;border-radius:10px;margin-bottom:20px;"/>
        <h2>Norte Automotores</h2>
        <p>Cargando información de: <strong>${auto.nombre}</strong>...</p>
        <script>
          setTimeout(() => { window.location.href = "${FRONTEND_BASE_URL}/auto/${slug}"; }, 1000);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    res.redirect(FRONTEND_BASE_URL);
  }
});

// ==========================================
// 7. GUÍA DE PRECIOS (CARGA Y CONSULTA)
// ==========================================

// Importar Excel de Guía de Precios
app.post(
  "/api/admin/upload-guia",
  upload.single("archivo"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "No se subió ningún archivo" });

    try {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });

      const marcasReferencia = [
        "BYD",
        "CHANGAN",
        "CHERY",
        "CHEVROLET",
        "CHRYSLER",
        "CITROEN",
        "FIAT",
        "FORD",
        "FOTON",
        "GEELY",
        "GREAT WALL",
        "HAVAL",
        "HONDA",
        "HYUNDAI",
        "ISUZU",
        "JAC",
        "JEEP",
        "JETOUR",
        "KIA",
        "LIFAN",
        "MITSUBISHI",
        "NISSAN",
        "PEUGEOT",
        "RENAULT",
        "SMART",
        "SUZUKI",
        "TOYOTA",
        "VOLKSWAGEN",
        "VOLVO",
        "ZANELLA",
      ];

      const diccModelos = [
        "PALIO",
        "SIENA",
        "CRONOS",
        "STRADA",
        "TORO",
        "MOBI",
        "ARGO",
        "UNO",
        "COROLLA",
        "HILUX",
        "GOL",
        "AMAROK",
        "RANGER",
      ];

      let marcaActual = "";
      let modeloActual = "";
      const vehiculos = [];

      const headerRowIndex = rows.findIndex(
        (r) => r.filter((cell) => /202\d/.test(String(cell))).length > 5,
      );
      const headerRow = rows[headerRowIndex].map((h) => String(h || "").trim());

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;

        const textoFila = String(row[0]).trim();
        if (
          textoFila.length < 2 ||
          textoFila.includes("Página") ||
          textoFila.includes("Sitio")
        )
          continue;

        const textoMayus = textoFila.toUpperCase();

        // 1. Detectar Marca
        const marcaEncontrada = marcasReferencia.find(
          (m) => textoMayus === m || textoMayus.startsWith(m + " "),
        );
        if (marcaEncontrada) {
          marcaActual = marcaEncontrada;
          modeloActual = "";
          continue;
        }

        // 2. Detectar Precios
        const valoresPrecio = row
          .slice(1)
          .filter(
            (c) =>
              c !== null &&
              String(c).trim() !== "" &&
              !isNaN(String(c).replace(/[^\d.]/g, "")),
          );
        const tienePrecios = valoresPrecio.length > 0;

        // 3. Detectar Modelo
        const esModeloDicc = diccModelos.some(
          (m) => textoMayus === m || textoMayus.startsWith(m + " ("),
        );
        if (!tienePrecios || esModeloDicc) {
          modeloActual = textoFila;
          if (!tienePrecios) continue;
        }

        // 4. Procesar Versión
        if (tienePrecios && marcaActual) {
          let mFinal = modeloActual || textoFila.split(" ")[0].toUpperCase();
          const precios = {};
          headerRow.forEach((val, idx) => {
            const valorCelda = row[idx];
            const anioNumerico = parseInt(val.replace(/[^\d]/g, ""));
            if (/^\d{4}$/.test(val) && anioNumerico <= 2025 && valorCelda) {
              let precioNum = parseFloat(
                String(valorCelda).replace(/[^\d.]/g, ""),
              );
              if (!isNaN(precioNum)) precios[val] = precioNum;
            }
          });

          if (Object.keys(precios).length > 0) {
            vehiculos.push({
              marca: marcaActual,
              modelo: mFinal,
              version: textoFila,
              moneda: "$",
              precios_json: JSON.stringify(precios),
            });
          }
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("TRUNCATE TABLE guia_precios RESTART IDENTITY");
        const chunkSize = 1000;
        for (let i = 0; i < vehiculos.length; i += chunkSize) {
          const chunk = vehiculos.slice(i, i + chunkSize);
          const values = [];
          const placeholders = chunk
            .map((v, index) => {
              const offset = index * 5;
              values.push(
                v.marca,
                v.modelo,
                v.version,
                v.moneda,
                v.precios_json,
              );
              return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
            })
            .join(",");
          await client.query(
            `INSERT INTO guia_precios (marca, modelo, version, moneda, precios_json) VALUES ${placeholders}`,
            values,
          );
        }
        await client.query("COMMIT");
        res.json({ success: true, count: vehiculos.length });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Consulta de Guía de Precios
app.get("/api/guia/consulta", async (req, res) => {
  const { marca, modelo } = req.query;
  const client = await pool.connect();
  try {
    if (!marca) {
      const result = await client.query(
        "SELECT DISTINCT marca FROM guia_precios ORDER BY marca ASC",
      );
      return res.json(result.rows.map((r) => r.marca));
    }
    if (marca && !modelo) {
      const result = await client.query(
        "SELECT DISTINCT modelo FROM guia_precios WHERE marca = $1 ORDER BY modelo ASC",
        [marca],
      );
      return res.json(result.rows.map((r) => r.modelo));
    }
    if (marca && modelo) {
      const result = await client.query(
        "SELECT version, moneda, precios_json FROM guia_precios WHERE marca = $1 AND modelo = $2",
        [marca, modelo],
      );
      return res.json(result.rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ==========================================
// 8. MANEJO DE RUTAS REACT (COMODÍN)
// ==========================================
// Esta ruta debe ir siempre al final para que React maneje el ruteo interno
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ==========================================
// 9. LANZAMIENTO
// ==========================================
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

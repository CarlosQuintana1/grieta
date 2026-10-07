import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Base en memoria: cada corrida de pruebas empieza limpia y no toca database.sqlite.
process.env.SQLITE = ":memory:";
const { app } = await import("../src/app.js");
const { sequelize } = await import("../src/modelos.js");
const { sembrar } = await import("../src/semilla.js");

let usuario;
let registro;

before(async () => {
  await sequelize.sync();
  await sembrar();
});

describe("Lugares", () => {
  test("GET /api/lugares trae los 16 del catalogo", async () => {
    const res = await request(app).get("/api/lugares").expect(200);
    assert.equal(res.body.length, 16);
  });

  test("POST, PUT y DELETE /api/lugares", async () => {
    const nuevo = await request(app).post("/api/lugares")
      .send({ clave: "prueba", nombre: "Lugar de prueba", lat: 20.6, lon: -100.4 }).expect(201);
    const cambiado = await request(app).put(`/api/lugares/${nuevo.body.id}`)
      .send({ nombre: "Lugar renombrado" }).expect(200);
    assert.equal(cambiado.body.nombre, "Lugar renombrado");
    await request(app).delete(`/api/lugares/${nuevo.body.id}`).expect(204);
    await request(app).get(`/api/lugares/${nuevo.body.id}`).expect(404);
  });

  test("POST /api/lugares rechaza una latitud imposible", async () => {
    await request(app).post("/api/lugares").send({ clave: "mal", nombre: "Mal", lat: 200, lon: 0 }).expect(400);
  });
});

describe("Rutas", () => {
  test("GET /api/rutas trae las 32 con su origen y destino", async () => {
    const res = await request(app).get("/api/rutas").expect(200);
    assert.equal(res.body.length, 32);
    assert.ok(res.body[0].origen.nombre && res.body[0].destino.nombre);
  });

  test("GET /api/rutas/:id", async () => {
    const res = await request(app).get("/api/rutas/1").expect(200);
    assert.equal(res.body.id, 1);
  });
});

describe("Usuarios", () => {
  test("POST /api/usuarios", async () => {
    const res = await request(app).post("/api/usuarios")
      .send({ nombre: "Capturista de prueba", correo: "prueba@ejemplo.com", rol: "capturista" }).expect(201);
    usuario = res.body;
  });

  test("POST /api/usuarios rechaza un correo repetido", async () => {
    await request(app).post("/api/usuarios").send({ nombre: "Otro", correo: "prueba@ejemplo.com" }).expect(409);
  });
});

describe("Registros y cotizaciones", () => {
  test("POST /api/registros guarda el registro con sus tres precios", async () => {
    const res = await request(app).post("/api/registros").send({
      ruta_id: 1, usuario_id: usuario.id, temperatura_c: 22.5, lluvia_mm: 0,
      cotizaciones: [{ app: "uber", precio: 89.9 }, { app: "didi", precio: 76 }, { app: "indrive", precio: 80 }],
    }).expect(201);
    assert.equal(res.body.cotizaciones.length, 3);
    registro = res.body;
  });

  test("POST /api/registros rechaza un registro con una sola app", async () => {
    const res = await request(app).post("/api/registros")
      .send({ ruta_id: 1, usuario_id: usuario.id, cotizaciones: [{ app: "uber", precio: 90 }] }).expect(400);
    assert.match(res.body.error, /al menos 2 apps/);
  });

  test("POST /api/registros rechaza una ruta que no existe", async () => {
    await request(app).post("/api/registros").send({
      ruta_id: 999, usuario_id: usuario.id,
      cotizaciones: [{ app: "uber", precio: 90 }, { app: "didi", precio: 80 }],
    }).expect(400);
  });

  test("GET /api/registros y GET /api/registros/:id", async () => {
    const lista = await request(app).get("/api/registros").expect(200);
    assert.equal(lista.body.length, 1);
    const uno = await request(app).get(`/api/registros/${registro.id}`).expect(200);
    assert.equal(uno.body.ruta.origen.clave, "fi-uaq");
  });

  test("GET /api/registros/:id/cotizaciones las ordena de la mas barata a la mas cara", async () => {
    const res = await request(app).get(`/api/registros/${registro.id}/cotizaciones`).expect(200);
    assert.deepEqual(res.body.map((c) => c.app), ["didi", "indrive", "uber"]);
  });
});

describe("Consultas al agente", () => {
  test("POST /api/consultas recomienda la app mas barata del ultimo registro", async () => {
    const ruta = (await request(app).get("/api/rutas/1")).body;
    const res = await request(app).post("/api/consultas")
      .send({ origen_id: ruta.origen_id, destino_id: ruta.destino_id, precio_visto: 95 }).expect(201);
    assert.equal(res.body.consulta.recomendacion, "didi");
  });

  test("GET /api/consultas", async () => {
    const res = await request(app).get("/api/consultas").expect(200);
    assert.equal(res.body.length, 1);
  });
});

describe("Borrado y errores", () => {
  test("DELETE /api/lugares/:id no borra un lugar que tiene rutas", async () => {
    await request(app).delete("/api/lugares/1").expect(409);
    await request(app).get("/api/lugares/1").expect(200);
  });

  test("DELETE /api/usuarios/:id no borra a quien tiene registros", async () => {
    await request(app).delete(`/api/usuarios/${usuario.id}`).expect(409);
  });

  test("DELETE /api/registros/:id borra tambien sus cotizaciones", async () => {
    await request(app).delete(`/api/registros/${registro.id}`).expect(204);
    await request(app).get(`/api/registros/${registro.id}/cotizaciones`).expect(404);
  });

  test("GET /api/salud y una ruta inexistente", async () => {
    await request(app).get("/api/salud").expect(200);
    await request(app).get("/api/no-existe").expect(404);
  });
});

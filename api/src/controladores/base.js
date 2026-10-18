// Las cinco operaciones de un CRUD para cualquier modelo; cada tabla las usa o las reemplaza.
export const noExiste = (res) => res.status(404).json({ error: "No existe" });

export function crud(Modelo, { incluir = [], orden = [["id", "ASC"]], campos } = {}) {
  const datos = (body) => (campos ? Object.fromEntries(campos.filter((c) => c in body).map((c) => [c, body[c]])) : body);
  return {
    listar: async (_req, res) => res.json(await Modelo.findAll({ include: incluir, order: orden })),
    ver: async (req, res) => {
      const fila = await Modelo.findByPk(req.params.id, { include: incluir });
      return fila ? res.json(fila) : noExiste(res);
    },
    crear: async (req, res) => res.status(201).json(await Modelo.create(datos(req.body))),
    modificar: async (req, res) => {
      const fila = await Modelo.findByPk(req.params.id);
      return fila ? res.json(await fila.update(datos(req.body))) : noExiste(res);
    },
    borrar: async (req, res) => {
      const borradas = await Modelo.destroy({ where: { id: req.params.id } });
      return borradas ? res.status(204).end() : noExiste(res);
    },
  };
}

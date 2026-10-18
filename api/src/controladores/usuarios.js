import { Usuario } from "../modelos.js";
import { crud } from "./base.js";

export const usuarios = crud(Usuario);

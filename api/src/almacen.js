import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const TAMANO_MAXIMO = 5 * 1024 * 1024;

// Con S3_BUCKET las fotos van a S3 con el SDK; sin el, a la carpeta local uploads/ para probar.
const s3 = process.env.S3_BUCKET ? new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" }) : null;
export const CARPETA_LOCAL = path.resolve(process.env.UPLOADS ?? "uploads");

export const tipoValido = (tipo) => Boolean(TIPOS[tipo]);

export async function guardarFoto(nombre, datos, tipo) {
  const archivo = `${nombre}.${TIPOS[tipo]}`;
  if (s3) {
    const clave = `reportes/${archivo}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: clave, Body: datos, ContentType: tipo }));
    return process.env.S3_URL_PUBLICA
      ? `${process.env.S3_URL_PUBLICA}/${clave}`
      : `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${clave}`;
  }
  await mkdir(CARPETA_LOCAL, { recursive: true });
  await writeFile(path.join(CARPETA_LOCAL, archivo), datos);
  return `/fotos/${archivo}`;
}

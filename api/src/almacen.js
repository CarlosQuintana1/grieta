import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const TAMANO_MAXIMO = 5 * 1024 * 1024;
export const CARPETA_LOCAL = path.resolve(process.env.UPLOADS ?? "uploads");

// Las fotos van a Azure Blob Storage o a S3 con el SDK de cada nube; sin ninguno, a uploads/ para probar en local.
const azure = process.env.AZURE_STORAGE_CONNECTION_STRING
  ? BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING).getContainerClient(process.env.AZURE_CONTAINER ?? "fotos")
  : null;
const s3 = process.env.S3_BUCKET ? new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" }) : null;

export const tipoValido = (tipo) => Boolean(TIPOS[tipo]);
export const almacenEnUso = azure ? "Azure Blob Storage" : s3 ? "Amazon S3" : "disco local";

export async function guardarFoto(nombre, datos, tipo) {
  const archivo = `${nombre}.${TIPOS[tipo]}`;
  if (azure) {
    const blob = azure.getBlockBlobClient(`reportes/${archivo}`);
    await blob.uploadData(datos, { blobHTTPHeaders: { blobContentType: tipo } });
    return blob.url;
  }
  if (s3) {
    const clave = `reportes/${archivo}`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: clave, Body: datos, ContentType: tipo }));
    return `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${clave}`;
  }
  await mkdir(CARPETA_LOCAL, { recursive: true });
  await writeFile(path.join(CARPETA_LOCAL, archivo), datos);
  return `/fotos/${archivo}`;
}

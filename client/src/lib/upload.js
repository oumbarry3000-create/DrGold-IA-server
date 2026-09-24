// src/lib/upload.js
// Envoi d'une piece jointe : le serveur signe, le fichier part directement
// du navigateur vers Cloudinary.
import { api } from "./api";

export const MAX_UPLOAD_MB = 10;
export const ACCEPT = "image/*,application/pdf";

export async function uploadFile(file) {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`Fichier trop lourd (max ${MAX_UPLOAD_MB} Mo)`);
  const isImage = file.type.startsWith("image/");
  if (!isImage && file.type !== "application/pdf") throw new Error("Seules les images et les PDF sont acceptés");

  const sig  = await api.uploadSignature();
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", sig.timestamp);
  form.append("folder", sig.folder);
  form.append("signature", sig.signature);

  const res  = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data.secure_url) throw new Error(data?.error?.message || "Envoi du fichier impossible");
  return { url: data.secure_url, name: file.name, type: isImage ? "image" : "file" };
}

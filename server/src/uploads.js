// server/src/uploads.js
// Pieces jointes via Cloudinary en upload signe : le serveur signe, le
// navigateur envoie le fichier directement a Cloudinary (rien ne transite par
// Render). Le secret API ne quitte jamais le serveur.
const crypto = require("crypto");

const CLOUD  = process.env.CLOUDINARY_CLOUD_NAME || "";
const KEY    = process.env.CLOUDINARY_API_KEY || "";
const SECRET = process.env.CLOUDINARY_API_SECRET || "";
const FOLDER = "drgold-ia/messages";

const uploadsEnabled = () => !!(CLOUD && KEY && SECRET);

function signUpload(uid) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params    = { folder: `${FOLDER}/${uid}`, timestamp };
  const toSign    = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const signature = crypto.createHash("sha1").update(toSign + SECRET).digest("hex");
  return { cloudName: CLOUD, apiKey: KEY, timestamp, folder: params.folder, signature };
}

// N'accepte que des fichiers heberges sur NOTRE compte Cloudinary
function cleanAttachment(att) {
  if (!att || !att.url) return null;
  const url = String(att.url);
  if (!uploadsEnabled() || !url.startsWith(`https://res.cloudinary.com/${CLOUD}/`)) return null;
  return {
    url,
    name: String(att.name || "fichier").slice(0, 120),
    type: att.type === "image" ? "image" : "file",
  };
}

module.exports = { signUpload, cleanAttachment, uploadsEnabled };

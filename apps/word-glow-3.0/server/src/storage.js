import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";

function parseStoragePathFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/o\/([^?]+)/);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function getGcsClient() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON.");
  const creds = JSON.parse(json);

  return new Storage({
    projectId: process.env.FIREBASE_PROJECT_ID || creds.project_id,
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key
    }
  });
}

export async function uploadBufferAndGetDownloadUrl({ bucketName, objectPath, buffer, contentType }) {
  const storage = getGcsClient();
  const bucket = storage.bucket(bucketName);

  // Token enables Firebase "download URL" format
  const token = uuidv4();
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

export async function deleteFileIfExists({ bucketName, objectPath }) {
  const storage = getGcsClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (exists) await file.delete();
}

export function getObjectPathFromDownloadUrl({ url, bucketName }) {
  const path = parseStoragePathFromUrl(url);
  if (!path) return null;
  if (bucketName && !url.includes(bucketName)) return null;
  return path;
}

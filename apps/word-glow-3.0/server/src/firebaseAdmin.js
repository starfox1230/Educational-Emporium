import admin from "firebase-admin";

let _app = null;

export function getAdminApp() {
  if (_app) return _app;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON env var.");

  const serviceAccount = JSON.parse(json);

  _app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });

  return _app;
}

export function getFirestore() {
  getAdminApp();
  return admin.firestore();
}

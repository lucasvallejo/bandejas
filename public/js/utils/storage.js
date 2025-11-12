import { getStorageClient } from '../firebase.js';
import { serverTimestamp } from './firebase-utils.js';

export async function uploadAttachment(entity, entityId, file) {
  const client = getStorageClient();
  const extension = file.name.split('.').pop();
  const path = `${entity}/${entityId}/${Date.now()}_${file.name}`;
  const metadata = await client.upload(path, file);
  return {
    type: extension,
    path: `storage://${path}`,
    metadata,
    uploadedAt: serverTimestamp(),
    nombre: file.name,
    size: file.size,
    contentType: file.type
  };
}

export async function getDownloadURL(path) {
  const client = getStorageClient();
  const normalized = path.replace('storage://', '');
  return client.getDownloadURL(normalized);
}

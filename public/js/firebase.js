import { FirebaseRealtimeClient, FirebaseStorageClient } from './utils/firebase-clients.js';
import { getConfig } from './utils/config.js';

let realtimeClient;
let storageClient;

export function initFirebase() {
  if (realtimeClient && storageClient) {
    return { realtimeClient, storageClient };
  }

  const config = getConfig();
  realtimeClient = new FirebaseRealtimeClient(config.databaseURL, config.authTokenProvider);
  storageClient = new FirebaseStorageClient(config.storageBucket, config.authTokenProvider);
  return { realtimeClient, storageClient };
}

export function getRealtimeClient() {
  if (!realtimeClient) {
    initFirebase();
  }
  return realtimeClient;
}

export function getStorageClient() {
  if (!storageClient) {
    initFirebase();
  }
  return storageClient;
}

import { appendAuditEvent } from './firebase-utils.js';

export class FirebaseRealtimeClient {
  constructor(databaseURL, authTokenProvider) {
    this.databaseURL = databaseURL.replace(/\/$/, '');
    this.authTokenProvider = authTokenProvider;
  }

  async _request(path, method = 'GET', body) {
    if (!this.databaseURL) {
      throw new Error('databaseURL no configurada');
    }
    const token = await this.authTokenProvider?.();
    const url = new URL(`${this.databaseURL}/${path}.json`);
    if (token) {
      url.searchParams.set('auth', token);
    }
    const response = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firebase error ${response.status}: ${text}`);
    }
    return response.json();
  }

  async list(path, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, value);
      }
    });
    const queryString = query.toString();
    const fullPath = queryString ? `${path}?${queryString}` : path;
    const data = await this._request(fullPath);
    return data ? Object.entries(data).map(([id, payload]) => ({ id, ...payload })) : [];
  }

  async get(path) {
    const data = await this._request(path);
    return data ? { ...data, id: data.id ?? path.split('/').pop() } : null;
  }

  async create(path, payload) {
    const result = await this._request(path, 'POST', payload);
    return result;
  }

  async update(path, payload) {
    return this._request(path, 'PATCH', payload);
  }

  async put(path, payload) {
    return this._request(path, 'PUT', payload);
  }

  async appendAudit(entidad, id, event) {
    const eventPath = `auditoria/${entidad}/${id}`;
    return this.create(eventPath, appendAuditEvent(event));
  }
}

export class FirebaseStorageClient {
  constructor(storageBucket, authTokenProvider) {
    this.storageBucket = storageBucket.replace(/\/$/, '');
    this.authTokenProvider = authTokenProvider;
  }

  async upload(path, file) {
    if (!this.storageBucket) {
      throw new Error('storageBucket no configurado');
    }
    const token = await this.authTokenProvider?.();
    const url = new URL(`${this.storageBucket}/${path}`);
    if (token) {
      url.searchParams.set('auth', token);
    }
    const response = await fetch(url.toString(), {
      method: 'POST',
      body: file
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Storage error ${response.status}: ${text}`);
    }
    return response.json();
  }

  async getDownloadURL(path) {
    const token = await this.authTokenProvider?.();
    const url = new URL(`${this.storageBucket}/${path}`);
    if (token) {
      url.searchParams.set('auth', token);
    }
    return url.toString();
  }
}

class MMKV {
  constructor() { this._store = {}; }
  set(key, value) { this._store[key] = value; }
  getString(key) { return this._store[key] ?? undefined; }
  getBoolean(key) { return this._store[key] ?? undefined; }
  getNumber(key) { return this._store[key] ?? undefined; }
  delete(key) { delete this._store[key]; }
  contains(key) { return key in this._store; }
}
module.exports = { MMKV };

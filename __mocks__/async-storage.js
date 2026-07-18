const store = {};
module.exports = {
  setItem: jest.fn(async (key, value) => { store[key] = value; }),
  getItem: jest.fn(async (key) => store[key] ?? null),
  removeItem: jest.fn(async (key) => { delete store[key]; }),
  clear: jest.fn(async () => { Object.keys(store).forEach(k => delete store[k]); }),
  getAllKeys: jest.fn(async () => Object.keys(store)),
};

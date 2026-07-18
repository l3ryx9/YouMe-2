const store = {};
module.exports = {
  setItemAsync: jest.fn(async (key, value) => { store[key] = value; }),
  getItemAsync: jest.fn(async (key) => store[key] ?? null),
  deleteItemAsync: jest.fn(async (key) => { delete store[key]; }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
};

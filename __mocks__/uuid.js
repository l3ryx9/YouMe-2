let counter = 0;
module.exports = { v4: jest.fn(() => 'mock-uuid-' + (++counter)) };

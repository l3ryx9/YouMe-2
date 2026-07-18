module.exports = {
  InferenceSession: {
    create: jest.fn().mockResolvedValue({
      run: jest.fn().mockResolvedValue({}),
    }),
  },
  Tensor: jest.fn(),
};

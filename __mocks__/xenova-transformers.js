const env = { allowRemoteModels: false, allowLocalModels: true };
const AutoTokenizer = { from_pretrained: jest.fn().mockResolvedValue({
  encode: jest.fn().mockReturnValue({ input_ids: [101, 102], attention_mask: [1, 1], token_type_ids: [0, 0] }),
  decode: jest.fn().mockReturnValue('mock text'),
  model_max_length: 512,
}) };
const AutoModelForSequenceClassification = { from_pretrained: jest.fn() };
const pipeline = jest.fn();
module.exports = { env, AutoTokenizer, AutoModelForSequenceClassification, pipeline };

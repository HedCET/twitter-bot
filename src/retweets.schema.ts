import * as mongoose from 'mongoose';

export const retweetsSchema = new mongoose.Schema({
  _id: {
    required: true,
    type: String,
  },
});

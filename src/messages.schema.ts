import * as mongoose from 'mongoose';

export const messagesSchema = new mongoose.Schema({
  _id: {
    required: true,
    type: String,
  },
});

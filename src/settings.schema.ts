import { Schema } from 'mongoose';

export const settingsSchema = new Schema({
  _id: {
    required: true,
    type: String,
  },

  since_id: {
    type: String,
  },
});

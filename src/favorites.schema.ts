import * as mongoose from 'mongoose';

export const favoritesSchema = new mongoose.Schema({
  _id: {
    required: true,
    type: String,
  },
});

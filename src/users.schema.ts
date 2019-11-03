import * as mongoose from 'mongoose';

export const usersSchema = new mongoose.Schema({
  _id: {
    required: true,
    type: String,
  },
  favourites_count: {
    required: true,
    type: Number,
  },
  friends: Boolean,
  friends_count: {
    required: true,
    type: Number,
  },
});

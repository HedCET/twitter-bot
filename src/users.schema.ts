import * as moment from 'moment';
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
  friends: {
    default: false,
    type: Boolean,
  },
  friends_count: {
    required: true,
    type: Number,
  },
  time: {
    default: moment().toDate(),
    required: true,
    type: Date,
  }
});

import * as moment from 'moment';
import * as mongoose from 'mongoose';

export const usersSchema = new mongoose.Schema({
  _id: {
    required: true,
    type: String,
  },
  blocked: {
    default: false,
    type: Boolean,
  },
  favourites_count: {
    required: true,
    type: Number,
  },
  followers: {
    default: false,
    type: Boolean,
  },
  friends: {
    default: false,
    type: Boolean,
  },
  time: {
    default: moment().toDate(),
    required: true,
    type: Date,
  }
});

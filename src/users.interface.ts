import { Document } from 'mongoose';

export interface usersInterface extends Document {
  _id: String,
  blocked: Boolean,
  favourites_count: Number,
  followers: Boolean,
  friends: Boolean,
  time: Date,
}

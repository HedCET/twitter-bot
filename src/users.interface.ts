import { Document } from 'mongoose';

export interface usersInterface extends Document {
  _id: String,
  favourites_count: Number,
  friends: Boolean,
  friends_count: Number,
}

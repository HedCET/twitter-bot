import { Document, Schema } from 'mongoose';
import isJSON from 'validator/lib/isJSON';

// import { name as usersRef } from './users.table';

// table model
export interface model extends Document {
  _id: String;
  json: String;
  startedAt: Date;
  tweeters: String[];
}

// table name
export const name = 'cachedWordArts';

// table schema
export const schema = new Schema(
  {
    _id: String,
    json: { required: true, type: String, validate: isJSON },
    startedAt: { required: true, type: Date },
    tweeters: [{ required: true, type: String }],
  },
  {
    collection: name,
    // toJSON: { virtuals: true },
    // toObject: { virtuals: true },
    versionKey: false,
  },
);

// schema.virtual('users', {
//   ref: usersRef,
//   localField: 'tweeters',
//   foreignField: 'name',
// });

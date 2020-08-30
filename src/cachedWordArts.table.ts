import { Document, Schema } from 'mongoose';

// import { name as usersRef } from './users.table';

// table model
export interface model extends Document {
  _id: String;
  startedAt: Date;
  stringifiedJSON: String;
  tweeters: String[];
}

// table name
export const name = 'cachedWordArts';

// table schema
export const schema = new Schema(
  {
    _id: String,
    startedAt: { required: true, type: Date },
    stringifiedJSON: { required: true, type: String },
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

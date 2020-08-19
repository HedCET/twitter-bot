import { Document, Schema } from 'mongoose';

// table model
export interface model extends Document {
  _id: String;
  consumerKey: String;
  consumerSecret: String;
  deleted?: Boolean;
  tag?: String;
}

// table name
export const name = 'twitterApps';

// table schema
export const schema = new Schema(
  {
    _id: { required: true, type: String },
    consumerKey: { required: true, type: String },
    consumerSecret: { required: true, type: String },
    deleted: Boolean,
    tag: String,
  },
  { versionKey: false },
);

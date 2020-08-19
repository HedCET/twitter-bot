import { Document, Schema } from 'mongoose';

// table model
export interface model extends Document {
  _id: String;
}

// table name
export const name = 'tweets';

// table schema
export const schema = new Schema(
  {
    _id: { required: true, type: String },
  },
  { collection: name, versionKey: false },
);

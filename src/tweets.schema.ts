import { Schema } from 'mongoose';

export const tweetsSchema = new Schema(
  {
    _id: { required: true, type: String },
  },
  { versionKey: false },
);

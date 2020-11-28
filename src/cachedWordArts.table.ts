import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { isJSON } from 'validator';

@Schema({ versionKey: false })
export class CachedWordArt {
  @Prop({ required: true })
  _id: String;

  @Prop({ validate: isJSON })
  json: String;

  @Prop({ required: true })
  startedAt: Date;

  @Prop([String])
  tweeters: String[];
}

export type CachedWordArtDocument = CachedWordArt & Document;
export const CachedWordArtSchema = SchemaFactory.createForClass(CachedWordArt);

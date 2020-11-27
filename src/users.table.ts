import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

import { TwitterApp } from './twitterApps.table';

export const PrivateProps = [
  'accessRevoked',
  'accessTokenKey',
  'accessTokenSecret',
  'blockedTimeout',
  'roles',
  'tags',
  'twitterApp',
];

@Schema({ versionKey: false })
export class User {
  @Prop()
  _id: String;

  @Prop()
  accessRevoked?: Boolean;

  @Prop()
  accessTokenKey?: String;

  @Prop()
  accessTokenSecret?: String;

  @Prop()
  averageFollowers?: Number;

  @Prop()
  averageFriends?: Number;

  @Prop()
  averageLikes?: Number;

  @Prop()
  averageLists?: Number;

  @Prop()
  blockedTimeout?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  followers?: Number;

  @Prop()
  friends?: Number;

  @Prop()
  likes?: Number;

  @Prop()
  lists?: Number;

  @Prop({ index: true, required: true })
  name: String;

  @Prop([String])
  roles?: String[];

  @Prop([String])
  tags?: String[];

  @Prop()
  tweetedAt?: Date;

  @Prop({ index: true })
  tweetFrequency?: Number;

  @Prop()
  tweets?: Number;

  @Prop({ ref: TwitterApp.name })
  twitterApp?: String;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);

import { Document } from 'mongoose';

export interface usersModel extends Document {
  _id: String;
  accessRevoked?: Boolean;
  accessTokenKey?: String;
  accessTokenSecret?: String;
  accessTokenValidatedAt?: Date;
  averageFollowers?: Number;
  averageFriends?: Number;
  averageLikes?: Number;
  averageLists?: Number;
  createdAt?: Date;
  followers?: Number;
  friends?: Number;
  likes?: Number;
  lists?: Number;
  name: String;
  roles?: String[];
  tweetedAt?: Date;
  tweetFrequency?: Number;
  tweets?: Number;
}

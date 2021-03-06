import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
// import Twitter from 'twitter-lite';

import { env } from './env.validations';
import {
  model as twitterAppsModel,
  name as twitterAppsToken,
} from './twitterApps.table';
import { model as usersModel, name as usersToken } from './users.table';

const Twitter = require('twitter-lite');

@Injectable()
export class TwitterAuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(twitterAppsToken)
    private readonly twitterAppsTable: Model<twitterAppsModel>,
    @InjectModel(usersToken) private readonly usersTable: Model<usersModel>,
  ) {}

  async getTwitterToken(_id: string = '') {
    const {
      consumerKey: consumer_key,
      consumerSecret: consumer_secret,
    } = await this.twitterAppsTable.findOne({ _id, deleted: { $ne: true } });

    if (consumer_key && consumer_secret)
      return await new Twitter({
        consumer_key,
        consumer_secret,
      }).getRequestToken(env.TWITTER_CALLBACK_URL);
    else throw new NotFoundException();
  }

  async postTwitterToken(
    twitterApp: string = '',
    { oauth_token, oauth_verifier },
  ) {
    if (oauth_token && oauth_verifier) {
      const {
        consumerKey: consumer_key,
        consumerSecret: consumer_secret,
      } = await this.twitterAppsTable.findOne({
        _id: twitterApp,
        deleted: { $ne: true },
      });

      if (consumer_key && consumer_secret) {
        const {
          oauth_token: accessTokenKey,
          oauth_token_secret: accessTokenSecret,
          screen_name: name,
          user_id: _id,
        } = await new Twitter({
          consumer_key,
          consumer_secret,
        }).getAccessToken({ oauth_token, oauth_verifier });

        await this.usersTable.updateOne(
          { _id },
          {
            $addToSet: { roles: 'user' },
            $set: { accessTokenKey, accessTokenSecret, name, twitterApp },
            $unset: { accessRevoked: true },
          },
          { upsert: true },
        );

        return { bearerToken: this.jwtService.sign({ _id }) };
      } else throw new NotFoundException();
    } else throw new BadRequestException();
  }
}

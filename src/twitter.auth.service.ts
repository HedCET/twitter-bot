import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
// import Twitter from 'twitter-lite';

import { modelTokens } from './db.models';
import { env } from './env.validations';
import { usersModel } from './users.model';

const Twitter = require('twitter-lite');

@Injectable()
export class TwitterAuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {}

  async twitterRequestToken() {
    const client = new Twitter({
      consumer_key: env.TWITTER_CONSUMER_KEY,
      consumer_secret: env.TWITTER_CONSUMER_SECRET,
    });

    return await client.getRequestToken(env.TWITTER_CALLBACK_URL);
  }

  async twitterAccessToken(oauth_token, oauth_verifier) {
    if (oauth_token && oauth_verifier) {
      const client = new Twitter({
        consumer_key: env.TWITTER_CONSUMER_KEY,
        consumer_secret: env.TWITTER_CONSUMER_SECRET,
      });

      const {
        oauth_token: accessTokenKey,
        oauth_token_secret: accessTokenSecret,
        screen_name: name,
        user_id: _id,
      } = await client.getAccessToken({
        oauth_token,
        oauth_verifier,
      });

      await this.usersModel.updateOne(
        { _id },
        {
          $addToSet: { roles: 'user' },
          $set: { accessTokenKey, accessTokenSecret, name },
          $unset: { accessRevoked: true },
        },
        { upsert: true },
      );

      return { bearerToken: this.jwtService.sign({ _id }) };
    } else throw new BadRequestException();
  }
}

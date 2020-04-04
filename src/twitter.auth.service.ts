import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import moment = require('moment');
import { Model } from 'mongoose';

import { modelTokens } from './db.models';
import { usersModel } from './users.model';

@Injectable()
export class TwitterAuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('TWITTER_AUTH') private readonly twitterAuth,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {}

  async twitterRequestToken() {
    return new Promise((resolve, reject) => {
      this.twitterAuth.getOAuthRequestToken(
        (
          error,
          requestToken,
          requestTokenSecret,
          r: { oauth_callback_confirmed: string },
        ) => {
          if (error) reject(error);
          else resolve({ requestToken, requestTokenSecret, r });
        },
      );
    });
  }

  async twitterAccessToken(requestToken, requestTokenSecret, verifier) {
    if (requestToken && requestTokenSecret && verifier) {
      return new Promise((resolve, reject) => {
        this.twitterAuth.getOAuthAccessToken(
          requestToken,
          requestTokenSecret,
          verifier,
          async (
            error,
            accessToken,
            accessTokenSecret,
            r: {
              screen_name: string;
              user_id: string;
            },
          ) => {
            if (error) reject(error);
            else {
              await this.usersModel.updateOne(
                { _id: r.screen_name },
                {
                  $addToSet: {
                    roles: 'user',
                  },
                  $set: {
                    access_token: accessToken,
                    access_token_secret: accessTokenSecret,
                  },
                  $unset: { blocked: true },
                },
                { upsert: true },
              );

              resolve({
                accessToken: this.jwtService.sign({ _id: r.screen_name }),
              });
            }
          },
        );
      });
    } else throw new BadRequestException();
  }
}

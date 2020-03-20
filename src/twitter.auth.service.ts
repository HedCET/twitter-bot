import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { db } from './firebase';

@Injectable()
export class TwitterAuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('TWITTER_AUTH') private readonly twitterAuth,
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
            acessToken,
            acessTokenSecret,
            r: {
              screen_name: string;
              user_id: string;
            },
          ) => {
            if (error) reject(error);
            else {
              const account = {
                acess_token: acessToken,
                acess_token_secret: acessTokenSecret,
                blocked: null,
                roles: ['user'],
              };

              const accountRef = db.ref(`accounts/${r.screen_name}`);
              const accountRefVal = (await accountRef.once('value')).val();

              if (accountRefVal) {
                account.blocked = accountRefVal.blocked;
                account.roles = accountRefVal.roles;

                accountRef.update(account);
              } else accountRef.set(account);

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

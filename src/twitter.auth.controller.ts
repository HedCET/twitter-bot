import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { TwitterAuthService } from './twitter.auth.service';

@Controller()
export class TwitterAuthController {
  constructor(private readonly twitterAuthService: TwitterAuthService) {}

  @Get('twitter_token')
  async getTwitterToken(@Query('app') app: string = 'kandamkori') {
    return this.twitterAuthService.getTwitterToken(app);
  }

  // to test twitter callback
  @Get('twitter_callback')
  async twitterCallback(
    @Query('oauth_token') oauth_token: string,
    @Query('oauth_verifier') oauth_verifier: string,
  ) {
    return { oauth_token, oauth_verifier };
  }

  @Post('twitter_token')
  async postTwitterToken(
    @Query('app') app: string = 'kandamkori', //queryParam
    @Body('oauth_token') oauth_token: string,
    @Body('oauth_verifier') oauth_verifier: string,
  ) {
    return this.twitterAuthService.postTwitterToken(app, {
      oauth_token,
      oauth_verifier,
    });
  }
}

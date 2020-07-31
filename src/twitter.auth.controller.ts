import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { TwitterAuthService } from './twitter.auth.service';

@Controller()
export class TwitterAuthController {
  constructor(private readonly twitterAuthService: TwitterAuthService) {}

  @Get('twitter_request_token')
  async twitterRequestToken() {
    return this.twitterAuthService.twitterRequestToken();
  }

  // to test twitter callback
  @Get('twitter_callback')
  async twitterCallback(
    @Query('oauth_token') oauth_token: string,
    @Query('oauth_verifier') oauth_verifier: string,
  ) {
    return { oauth_token, oauth_verifier };
  }

  @Post('twitter_access_token')
  async twitterAccessToken(
    @Body('oauth_token') oauth_token: string,
    @Body('oauth_verifier') oauth_verifier: string,
  ) {
    return this.twitterAuthService.twitterAccessToken(
      oauth_token,
      oauth_verifier,
    );
  }
}

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
    @Query('oauth_token') authToken: string,
    @Query('oauth_verifier') authVerifier: string,
  ) {
    return { authToken, authVerifier };
  }

  @Post('twitter_access_token')
  async twitterAccessToken(
    @Body('request_token') requestToken: string,
    @Body('request_token_secret') requestTokenSecret: string,
    @Body('verifier') verifier: string,
  ) {
    return this.twitterAuthService.twitterAccessToken(
      requestToken,
      requestTokenSecret,
      verifier,
    );
  }
}

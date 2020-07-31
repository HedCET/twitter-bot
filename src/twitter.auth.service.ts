import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
// import Twitter from 'twitter-lite';

import { env } from './env.validations';
import { Neo4jService } from './neo4j.service';

const Twitter = require('twitter-lite');

@Injectable()
export class TwitterAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly neo4jService: Neo4jService,
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
        // user_id,
      } = await client.getAccessToken({
        oauth_token,
        oauth_verifier,
      });

      await this.neo4jService.write(
        `MERGE (p:nPerson {name: $name})
        REMOVE p.accessRevoked
        SET p.accessTokenKey = $accessTokenKey
        SET p.accessTokenSecret = $accessTokenSecret
        FOREACH(v IN CASE WHEN 'user' IN COALESCE(p.roles, []) THEN [] ELSE [1] END|SET p.roles = COALESCE(p.roles, []) + 'user')
        RETURN p.name`,
        { accessTokenKey, accessTokenSecret, name },
      );

      return { bearerToken: this.jwtService.sign({ name }) };
    } else throw new BadRequestException();
  }
}

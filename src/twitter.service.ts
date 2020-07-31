import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { sortBy } from 'lodash';
import * as moment from 'moment';
// import Twitter from 'twitter-lite';

import { env } from './env.validations';
import { Neo4jService } from './neo4j.service';
import { RoughRecordMessageService } from './rough.record.message.service';
import { ScriptMessageService } from './script.message.service';
import { searchRequest, searchResponse } from './twitter.interface';

const Twitter = require('twitter-lite');

@Injectable()
export class TwitterService {
  constructor(
    private readonly logger: Logger,
    private readonly neo4jService: Neo4jService,
    private readonly roughRecordMessageService: RoughRecordMessageService,
    private readonly scriptMessageService: ScriptMessageService,
  ) {}

  // collect lang:ml tweets
  // @Cron('0 0,10,20,30,40,50 * * * *')
  private async scheduler() {
    const {
      records: [nPerson],
    } = await this.neo4jService.read(`MATCH (p:nPerson)
      WHERE ((NOT EXISTS (p.accessRevoked)) OR p.accessRevoked <> true)
        AND EXISTS (p.accessTokenKey)
        AND EXISTS (p.accessTokenSecret)
      RETURN p
      ORDER BY p.accessTokenValidatedAt
      LIMIT 1`);

    if (nPerson) {
      const { properties: executor } = nPerson.get('p');

      // update accessTokenValidatedAt
      await this.neo4jService.write(
        `MATCH (p:nPerson {name: $name})
        SET p.accessTokenValidatedAt = $accessTokenValidatedAt
        RETURN p.name`,
        {
          name: executor.name,
          accessTokenValidatedAt: moment().toISOString(),
        },
      );

      const client = new Twitter({
        access_token_key: executor.accessTokenKey,
        access_token_secret: executor.accessTokenSecret,
        consumer_key: env.TWITTER_CONSUMER_KEY,
        consumer_secret: env.TWITTER_CONSUMER_SECRET,
      });

      // verify credentials
      try {
        await client.get('account/verify_credentials');
      } catch (e) {
        console.log(e);
        this.logger.error(
          e,
          `account/verify_credentials/${executor.name}`,
          'TwitterService/scheduler',
        );

        await this.neo4jService.write(
          `MATCH (p:nPerson {name: $name})
          SET p.accessRevoked = true
          RETURN p.name`,
          {
            name: executor.name,
          },
        );

        // recursive
        return this.scheduler();
      }

      for (let i = 0, maxId; i < 30; i++) {
        const request: searchRequest = {
          count: 100,
          lang: 'ml',
          q: '%2A',
          result_type: 'recent',
          tweet_mode: 'extended',
        };

        // limit 100 & skip till maxId
        if (maxId) request.max_id = maxId;

        const response: searchResponse = await client.get(
          'search/tweets',
          request,
        );

        // break if empty array
        if (!response.statuses.length) break;

        // ascending sort
        const statuses = sortBy(response.statuses, [
          item =>
            `${moment(item.created_at, [
              'ddd MMM D HH:mm:ss ZZ YYYY',
            ]).toISOString()}|${item.id_str}`,
        ]);

        // set maxId for next iteration
        maxId = BigInt(statuses[0].id_str)
          .subtract(1)
          .toString();

        // new tweets counter
        let newTweets = 0;

        for await (const status of statuses) {
          const name = status.user.screen_name; // primary key

          // existing user in DB
          let user: { [key: string]: any } = {};

          const {
            records: [nPerson],
          } = await this.neo4jService.write(
            `MERGE (p:nPerson {name: $name})
              ON CREATE SET p.createdAt = $createdAt
            RETURN p`,
            {
              createdAt: moment(status.user.created_at, [
                'ddd MMM D HH:mm:ss ZZ YYYY',
              ]).toISOString(),
              name,
            },
          );

          if (nPerson) {
            const { properties } = nPerson.get('p');
            user = properties || {};
          }

          // tweetedAt
          const tweetedAt = moment(status.created_at, [
            'ddd MMM D HH:mm:ss ZZ YYYY',
          ]);

          let tweetFrequency; // per day
          if (user.tweetedAt && tweetedAt.isAfter(user.tweetedAt))
            tweetFrequency = moment
              .duration(tweetedAt.diff(user.tweetedAt))
              .asDays();

          await this.neo4jService.write(
            `MATCH (p:nPerson {name: $name})
            SET p += $extend
            RETURN p.name`,
            {
              extend: {
                tweetedAt: tweetedAt.toISOString(),
                tweetFrequency,
              },
              name,
            },
          );

          // tweets
          if (status.user.statuses_count)
            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              SET p.tweets = toInteger($tweets)
              RETURN p.name`,
              {
                name,
                tweets: status.user.statuses_count,
              },
            );
          else
            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              REMOVE p.tweets
              RETURN p.name`,
              {
                name,
              },
            );

          // likes
          if (status.user.favourites_count) {
            let averageLikes; // per day
            if (tweetFrequency)
              averageLikes =
                (status.user.favourites_count - (user.likes || 0)) /
                tweetFrequency;

            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              SET p += $extend
              SET p.likes = toInteger($likes)
              RETURN p.name`,
              {
                extend: {
                  averageLikes,
                },
                likes: status.user.favourites_count,
                name,
              },
            );
          } else
            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              REMOVE p.likes
              RETURN p.name`,
              {
                name,
              },
            );

          // followers
          if (status.user.followers_count) {
            let averageFollowers; // per day
            if (tweetFrequency)
              averageFollowers =
                (status.user.followers_count - (user.followers || 0)) /
                tweetFrequency;

            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              SET p += $extend
              SET p.followers = toInteger($followers)
              RETURN p.name`,
              {
                extend: {
                  averageFollowers,
                },
                followers: status.user.followers_count,
                name,
              },
            );
          } else
            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              REMOVE p.followers
              RETURN p.name`,
              {
                name,
              },
            );

          // friends
          if (status.user.friends_count) {
            let averageFriends; // per day
            if (tweetFrequency)
              averageFriends =
                (status.user.friends_count - (user.friends || 0)) /
                tweetFrequency;

            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              SET p += $extend
              SET p.friends = toInteger($friends)
              RETURN p.name`,
              {
                extend: {
                  averageFriends,
                },
                friends: status.user.friends_count,
                name,
              },
            );
          } else
            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              REMOVE p.friends
              RETURN p.name`,
              {
                name,
              },
            );

          // lists
          if (status.user.listed_count) {
            let averageLists; // per day
            if (tweetFrequency)
              averageLists =
                (status.user.listed_count - (user.lists || 0)) / tweetFrequency;

            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              SET p += $extend
              SET p.lists = toInteger($lists)
              RETURN p.name`,
              {
                extend: {
                  averageLists,
                },
                lists: status.user.listed_count,
                name,
              },
            );
          } else
            await this.neo4jService.write(
              `MATCH (p:nPerson {name: $name})
              REMOVE p.lists
              RETURN p.name`,
              {
                name,
              },
            );

          // filter new tweets
          const {
            records: [nTweet],
          } = await this.neo4jService.read(
            `MATCH (t:nTweet {id: $id})
            RETURN t`,
            {
              id: status.id_str,
            },
          );

          if (!nTweet) {
            await this.neo4jService.write(
              `MERGE (t:nTweet {id: $id})
              RETURN t`,
              {
                id: status.id_str,
              },
            );

            newTweets++;

            // publish to RxJS message stream
            this.roughRecordMessageService.addMessage(status);
            this.scriptMessageService.addMessage(status);
          }
        }

        // no newTweets break
        if (!newTweets) break;

        // wait before next iteration
        await new Promise(r => setTimeout(r, 1000 * 10));
      }
    }

    await this.neo4jService.write(
      `MATCH (t:nTweet)
      WITH t
      ORDER BY t.id DESC 
      SKIP 100000
      DETACH DELETE t`,
    );

    return true;
  }
}

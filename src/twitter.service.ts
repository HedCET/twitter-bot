import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { find, omit, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
// import Twitter from 'twitter-lite';

import { modelTokens } from './db.models';
import { env } from './env.validations';
import { ScriptMessageService } from './script.message.service';
import { tweetsModel } from './tweets.model';
import { searchRequest, tweetInterface } from './twitter.interface';
import { usersModel } from './users.model';

const Twitter = require('twitter-lite');

@Injectable()
export class TwitterService {
  // private readonly appProps = [
  //   'accessRevoked',
  //   'accessTokenKey',
  //   'accessTokenSecret',
  //   'roles',
  // ];

  constructor(
    private readonly logger: Logger,
    private readonly scriptMessageService: ScriptMessageService,
    @InjectModel(modelTokens.tweets)
    private readonly tweetsModel: Model<tweetsModel>,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {}

  // scheduled search
  @Cron('0 */5 * * * *')
  private async search(searchInput?: searchRequest) {
    const {
      _id,
      accessTokenKey: access_token_key,
      accessTokenSecret: access_token_secret,
      name,
    } = await this.usersModel.findOne(
      {
        accessRevoked: { $ne: true },
        accessTokenKey: { $exists: true },
        accessTokenSecret: { $exists: true },
      },
      { _id: 1, accessTokenKey: 1, accessTokenSecret: 1, name: 1 },
      { sort: { accessTokenValidatedAt: 'asc' } },
    );

    if (_id) {
      // update accessTokenValidatedAt
      await this.usersModel.updateOne(
        { _id },
        { $set: { accessTokenValidatedAt: moment().toDate() } },
      );

      const client = new Twitter({
        access_token_key,
        access_token_secret,
        consumer_key: env.TWITTER_CONSUMER_KEY,
        consumer_secret: env.TWITTER_CONSUMER_SECRET,
      });

      // verify credentials
      try {
        await client.get('account/verify_credentials');
      } catch (e) {
        this.logger.error(
          e,
          `account/verify_credentials/${name}`,
          'TwitterService/search',
        );

        // accessRevoked
        await this.usersModel.updateOne(
          { _id },
          { $set: { accessRevoked: true } },
        );

        // recursive
        return this.search();
      }

      for (let i = 0, maxId; i < 60; i++) {
        const request: searchRequest = {
          count: 100,
          lang: 'ml',
          q: '%2A', // '*',
          result_type: 'recent',
          tweet_mode: 'extended',
          ...(searchInput || {}),
        };

        // limit 100 & skip till maxId
        if (maxId) request.max_id = maxId;

        const response: {
          _headers: { [key: string]: any };
          statuses: tweetInterface[];
        } = await client.get('search/tweets', request);

        // statistics
        this.logger.log(
          {
            remainingMinutes: moment
              .duration(
                moment(response._headers.get('x-rate-limit-reset'), ['X']).diff(
                  moment(),
                ),
              )
              .asMinutes(),
            remainingRequests: response._headers.get('x-rate-limit-remaining'),
          },
          'TwitterService/search',
        );

        // break if empty array
        if (!response.statuses.length) break;

        // ascending sort
        const statuses = sortBy(response.statuses, [
          status =>
            `${moment(status.created_at, [
              'ddd MMM D HH:mm:ss ZZ YYYY',
            ]).toISOString()}|${status.id_str}`,
        ]);

        // set maxId for next iteration
        maxId = BigInt(statuses[0].id_str)
          .subtract(1)
          .toString();

        // new tweets counter
        let newTweets = 0;

        for await (const status of statuses) {
          const tweetedAt = moment(status.created_at, [
            'ddd MMM D HH:mm:ss ZZ YYYY',
          ]);

          const $set: { [key: string]: any } = {
            createdAt: moment(status.user.created_at, [
              'ddd MMM D HH:mm:ss ZZ YYYY',
            ]).toDate(),
            name: status.user.screen_name,
            tweetedAt,
          };
          const $unset: { [key: string]: any } = {};

          // followers
          if (status.user.followers_count)
            $set.followers = status.user.followers_count;
          else $unset.followers = true;

          // friends
          if (status.user.friends_count)
            $set.friends = status.user.friends_count;
          else $unset.friends = true;

          // likes
          if (status.user.favourites_count)
            $set.likes = status.user.favourites_count;
          else $unset.likes = true;

          // lists
          if (status.user.listed_count) $set.lists = status.user.listed_count;
          else $unset.lists = true;

          // tweets
          if (status.user.statuses_count)
            $set.tweets = status.user.statuses_count;
          else $unset.tweets = true;

          // existing users
          const users = await this.usersModel.find(
            {
              _id: { $in: [status.user.id_str, status.user.screen_name] },
            },
            null,
            // this.appProps.reduce(
            //   (memory, value) => ({ ...memory, [value]: 0 }),
            //   {},
            // ),
            { sort: { tweetedAt: 'asc' } },
          );

          if (users.length) {
            const user = users
              .map(v => v.toObject())
              .reduce((memory, value) => ({ ...memory, ...value }), {});

            // migrate _id from screen_name to id_str
            if (
              1 < users.length ||
              find(users, { _id: status.user.screen_name })
            ) {
              await this.usersModel.deleteOne({ _id: status.user.screen_name });
              await this.usersModel.updateOne(
                { _id: status.user.id_str },
                { $set: omit(user, ['_id']) },
                { upsert: true },
              );
            }

            if (tweetedAt.isAfter(user.tweetedAt)) {
              // tweet frequency per day
              $set.tweetFrequency = moment
                .duration(tweetedAt.diff(user.tweetedAt))
                .asDays();

              // average followers per day
              if (
                user.followers &&
                status.user.followers_count !== user.followers
              )
                $set.averageFollowers =
                  (status.user.followers_count - user.followers) /
                  $set.tweetFrequency;

              // average friends per day
              if (user.friends && status.user.friends_count !== user.friends)
                $set.averageFriends =
                  (status.user.friends_count - user.friends) /
                  $set.tweetFrequency;

              // average likes per day
              if (user.likes && status.user.favourites_count !== user.likes)
                $set.averageLikes =
                  (status.user.favourites_count - user.likes) /
                  $set.tweetFrequency;

              // average lists per day
              if (user.lists && status.user.listed_count !== user.lists)
                $set.averageLists =
                  (status.user.listed_count - user.lists) / $set.tweetFrequency;
            }
          }

          // upsert
          await this.usersModel.updateOne(
            { _id: status.user.id_str },
            { $set, $unset },
            { upsert: true },
          );

          // new tweet finder
          const tweet = await this.tweetsModel.findOne({
            _id: status.id_str,
          });

          if (!tweet) {
            newTweets++;
            await new this.tweetsModel({ _id: status.id_str }).save();
            this.scriptMessageService.addMessage(status); // publish to RxJS message stream
          }
        }

        // no newTweets break
        if (!newTweets) break;

        // wait before next iteration
        await new Promise(r => setTimeout(r, 1000 * 10));
      }
    }

    const thresholdTweet = await this.tweetsModel.findOne({}, null, {
      skip: 100000,
      sort: { _id: 'desc' },
    });

    if (thresholdTweet)
      await this.tweetsModel.deleteMany({ _id: { $lte: thresholdTweet._id } });

    const usersModelStats = await this.usersModel.collection.stats();

    if (384 * 1024 * 1024 < usersModelStats.storageSize)
      await this.usersModel.deleteMany({
        tweeted_at: {
          $lt: moment()
            .subtract(1, 'years')
            .toDate(),
        },
      });

    return true;
  }
}

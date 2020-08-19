import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { fromPairs, has, map, omit, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
// import Twitter from 'twitter-lite';

import { scripts } from './scripts';
import { model as tweetsModel, name as tweetsToken } from './tweets.table';
import { searchQuery, tweetInterface } from './twitter.interface';
import { model as usersModel, name as usersToken } from './users.table';

const Twitter = require('twitter-lite');

@Injectable()
export class TwitterService {
  private readonly appProps = [
    'accessRevoked',
    'accessTokenKey',
    'accessTokenSecret',
    'roles',
    'twitterApp',
    'twitterApps',
  ];

  constructor(
    private readonly logger: Logger,
    @InjectModel(tweetsToken) private readonly tweetsTable: Model<tweetsModel>,
    @InjectModel(usersToken) private readonly usersTable: Model<usersModel>,
  ) {
    this.search();
  }

  // scheduled search
  @Cron('0 */5 * * * *')
  private async search(query?: searchQuery) {
    // get executors
    (
      await this.usersTable.aggregate([
        {
          $match: {
            accessRevoked: { $ne: true },
            accessTokenKey: { $exists: true },
            accessTokenSecret: { $exists: true },
            twitterApp: { $exists: true },
          },
        },
        {
          $lookup: {
            from: 'twitterApps',
            let: { app: '$twitterApp' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $ne: ['$deleted', true] },
                      { $eq: ['$$app', '$_id'] },
                    ],
                  },
                },
              },
              // { $project: { tag: 0 } },
            ],
            as: 'twitterApps',
          },
        },
        {
          $match: { twitterApps: { $elemMatch: { deleted: { $ne: true } } } },
        },
        { $project: { twitterApp: 0 } },
      ])
    )
      .filter(executor => scripts[executor.name])
      .forEach(async executor => {
        // destructuring
        const {
          _id,
          accessTokenKey: access_token_key,
          accessTokenSecret: access_token_secret,
          twitterApps: [
            {
              _id: twitterApp,
              consumerKey: consumer_key,
              consumerSecret: consumer_secret,
              tag,
            },
          ],
          name,
        } = executor;

        // twitter-lite instance
        const client = new Twitter({
          access_token_key,
          access_token_secret,
          consumer_key,
          consumer_secret,
        });

        // verify credentials
        try {
          await client.get('account/verify_credentials');
        } catch (e) {
          this.logger.error(
            e,
            'account/verify_credentials',
            `TwitterService/search/${name}`,
          );

          // accessRevoked
          await this.usersTable.updateOne(
            { _id },
            { $set: { accessRevoked: true } },
          );

          // continue
          return;
        }

        // executor namespace
        const ns = scripts[name];

        // maximum 10 times
        for (let i = 0, maxId; i < 10; i++) {
          const requestQuery: searchQuery = {
            ...(query || ns.searchQuery),
          };

          // limit 100 & skip till maxId
          if (maxId) requestQuery.max_id = maxId;

          const response: {
            _headers: { [key: string]: any };
            statuses: tweetInterface[];
          } = await client.get('search/tweets', requestQuery);

          // statistics
          this.logger.log(
            `remaining ${response._headers.get(
              'x-rate-limit-remaining',
            )}/${response._headers.get(
              'x-rate-limit-limit',
            )} requests ${moment
              .duration(
                moment(response._headers.get('x-rate-limit-reset'), ['X']).diff(
                  moment(),
                ),
              )
              .humanize(true)}`,
            `TwitterService/search/${name}`,
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

            const $addToSet: { [key: string]: any } = {
              tags: tag || twitterApp,
            };
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

            // existing tweeter
            const tweeter = await this.usersTable.findOne(
              { _id: status.user.id_str },
              fromPairs(map(this.appProps, i => [i, 0])),
            );

            if (tweeter && tweetedAt.isAfter(tweeter.tweetedAt)) {
              // tweet frequency per day
              $set.tweetFrequency = moment
                .duration(tweetedAt.diff(tweeter.tweetedAt))
                .asDays();

              // average followers per day
              if (
                tweeter.followers &&
                status.user.followers_count !== tweeter.followers
              )
                $set.averageFollowers =
                  (status.user.followers_count - tweeter.followers) /
                  $set.tweetFrequency;

              // average friends per day
              if (
                tweeter.friends &&
                status.user.friends_count !== tweeter.friends
              )
                $set.averageFriends =
                  (status.user.friends_count - tweeter.friends) /
                  $set.tweetFrequency;

              // average likes per day
              if (
                tweeter.likes &&
                status.user.favourites_count !== tweeter.likes
              )
                $set.averageLikes =
                  (status.user.favourites_count - tweeter.likes) /
                  $set.tweetFrequency;

              // average lists per day
              if (tweeter.lists && status.user.listed_count !== tweeter.lists)
                $set.averageLists =
                  (status.user.listed_count - tweeter.lists) /
                  $set.tweetFrequency;
            }

            // upsert
            await this.usersTable.updateOne(
              { _id: status.user.id_str },
              { $addToSet, $set, $unset },
              { upsert: true },
            );

            // new tweet identification logic
            const tweet = await this.tweetsTable.findOne({
              _id: `${status.id_str}|${_id}`,
            });

            if (!tweet) {
              newTweets++;

              // persistent store
              await new this.tweetsTable({
                _id: `${status.id_str}|${_id}`,
              }).save();

              if (
                moment.isMoment(ns.reset) &&
                moment(ns.reset).isAfter(moment())
              )
                this.logger.error(
                  `skipping, reset ${moment
                    .duration(ns.reset.diff(moment()))
                    .humanize(true)}`,
                  `${status.user.screen_name}/${status.id_str}`,
                  `TwitterService/search/${name}`,
                );
              else {
                this.logger.log(
                  `${status.user.screen_name}/${status.id_str}`,
                  `TwitterService/search/${name}`,
                );

                try {
                  // execute script
                  const res = await ns.execute({
                    client,
                    executor: omit(executor, this.appProps),
                    tweeter:
                      tweeter ||
                      (await this.usersTable.findOne(
                        { _id: status.user.id_str },
                        fromPairs(map(this.appProps, i => [i, 0])),
                      )),
                    status,
                  });
                } catch (e) {
                  this.logger.error(
                    e,
                    `${status.user.screen_name}/${status.id_str}`,
                    `TwitterService/search/${name}`,
                  );

                  // 3 minutes skipping
                  if (has(e, 'errors') && -1 < [185].indexOf(e.errors[0].code))
                    ns.reset = moment().add(3, 'minutes');
                }
              }
            }
          }

          // no newTweets break
          if (!newTweets) break;
        }
      });

    const thresholdTweet = await this.tweetsTable.findOne({}, null, {
      skip: 300000,
      sort: { _id: 'desc' },
    });

    if (thresholdTweet)
      await this.tweetsTable.deleteMany({ _id: { $lte: thresholdTweet._id } });

    // clear inactive users
    if (
      15 * 1024 * 1024 * 1024 <
      (await this.usersTable.collection.stats()).storageSize
    )
      await this.usersTable.deleteMany({
        roles: { $size: 0 },
        tweeted_at: {
          $lt: moment()
            .subtract(6, 'months')
            .toDate(),
        },
      });

    return true;
  }
}

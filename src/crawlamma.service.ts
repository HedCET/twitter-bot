import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { groupBy, random, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
// import Twitter from 'twitter-lite';

import { model as recentModel, name as recentToken } from './recent.table';
import { searchQuery, tweetInterface } from './twitter.interface';
import { model as usersModel, name as usersToken } from './users.table';

const Twitter = require('twitter-lite');

@Injectable()
export class CrawlammaService {
  private cache: { [key: string]: any } = {};

  constructor(
    private readonly logger: Logger,
    @InjectModel(recentToken)
    private readonly recentTable: Model<recentModel>,
    @InjectModel(usersToken) private readonly usersTable: Model<usersModel>,
  ) {}

  @Cron('*/15 * * * * *')
  private async scheduler(twitterApp = 'crawlamma') {
    // get executors
    (
      await this.usersTable
        .find({
          accessRevoked: { $ne: true },
          accessTokenKey: { $exists: true },
          accessTokenSecret: { $exists: true },
          twitterApp: { $exists: true },
        })
        .populate({
          path: 'twitterApp',
          match: { _id: twitterApp, deleted: { $ne: true } },
        })
    )
      .filter((executor) => executor.twitterApp)
      .forEach(async (executor) => {
        const {
          _id,
          accessTokenKey: access_token_key,
          accessTokenSecret: access_token_secret,
          twitterApp: {
            _id: twitterApp,
            consumerKey: consumer_key,
            consumerSecret: consumer_secret,
            tag,
          },
          name,
        } = executor;

        // https://www.npmjs.com/package/twitter-lite#usage
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
            `CrawlammaService/${name}`,
          );

          // accessRevoked
          // await this.usersTable.updateOne(
          //   { _id },
          //   { $set: { accessRevoked: true } },
          // );

          return;
        }

        const cacheKey = `${twitterApp}|${_id}`;
        if (!this.cache[cacheKey]) this.cache[cacheKey] = {};
        const cache = this.cache[cacheKey];

        const [avg] = await this.usersTable.aggregate([
          { $match: { tags: tag ?? twitterApp } },
          { $group: { _id: '', avg: { $avg: '$tweetFrequency' } } },
        ]);

        // average tweet frequency
        cache.tweetFrequency = avg?.avg ?? 7;

        const requestQuery: searchQuery = {
          count: 100,
          lang: 'ml',
          q: '%2A', // '*',
          result_type: 'recent',
          tweet_mode: 'extended',
        };

        for (let i = 0; i < 3; i++) {
          // search/tweets => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/search/api-reference/get-search-tweets
          const response: {
            _headers: { [key: string]: any };
            statuses: tweetInterface[];
          } = await client.get('search/tweets', requestQuery);

          this.logger.log(
            `remaining ${response._headers.get(
              'x-rate-limit-remaining',
            )}/${response._headers.get(
              'x-rate-limit-limit',
            )} requests, +${moment
              .duration(
                moment(response._headers.get('x-rate-limit-reset'), ['X']).diff(
                  moment(),
                ),
              )
              .asMilliseconds()}ms to reset`,
            `CrawlammaService/${name}`,
          );

          if (!response.statuses.length) break;

          // ascending sort
          const statuses = sortBy(response.statuses, ['id_str']);

          // set max_id for next iteration
          requestQuery.max_id = BigInt(statuses[0].id_str)
            .subtract(1)
            .toString();

          // new tweets counter
          let newTweets = 0;

          for await (const status of statuses) {
            const tweetedAt = moment(status.created_at, [
              'ddd MMM D HH:mm:ss ZZ YYYY',
            ]);

            const $addToSet: { [key: string]: any } = {
              tags: tag ?? twitterApp,
            };
            const $set: { [key: string]: any } = {
              createdAt: moment(status.user.created_at, [
                'ddd MMM D HH:mm:ss ZZ YYYY',
              ]).toDate(),
              name: status.user.screen_name,
              tweetedAt,
            };
            const $unset: { [key: string]: any } = {};

            if (status.user.followers_count)
              $set.followers = status.user.followers_count;
            else $unset.followers = true;

            if (status.user.friends_count)
              $set.friends = status.user.friends_count;
            else $unset.friends = true;

            if (status.user.favourites_count)
              $set.likes = status.user.favourites_count;
            else $unset.likes = true;

            if (status.user.listed_count) $set.lists = status.user.listed_count;
            else $unset.lists = true;

            if (status.user.statuses_count)
              $set.tweets = status.user.statuses_count;
            else $unset.tweets = true;

            let tweeter = await this.usersTable.findOne({
              _id: status.user.id_str,
            });

            if (tweeter && tweetedAt.isAfter(tweeter.tweetedAt)) {
              // tweet frequency per day
              $set.tweetFrequency = moment
                .duration(tweetedAt.diff(tweeter.tweetedAt))
                .asDays();

              if (
                tweeter.followers &&
                status.user.followers_count !== tweeter.followers
              )
                $set.averageFollowers =
                  (status.user.followers_count - tweeter.followers) /
                  $set.tweetFrequency;

              if (
                tweeter.friends &&
                status.user.friends_count !== tweeter.friends
              )
                $set.averageFriends =
                  (status.user.friends_count - tweeter.friends) /
                  $set.tweetFrequency;

              if (
                tweeter.likes &&
                status.user.favourites_count !== tweeter.likes
              )
                $set.averageLikes =
                  (status.user.favourites_count - tweeter.likes) /
                  $set.tweetFrequency;

              if (tweeter.lists && status.user.listed_count !== tweeter.lists)
                $set.averageLists =
                  (status.user.listed_count - tweeter.lists) /
                  $set.tweetFrequency;
            }

            tweeter = await this.usersTable.findOneAndUpdate(
              { _id: status.user.id_str },
              { $addToSet, $set, $unset },
              { returnOriginal: false, upsert: true },
            );

            if (
              _id !== tweeter._id &&
              !(await this.recentTable.findOneAndUpdate(
                { _id: `${_id}|${status.id_str}` },
                { $set: {} },
                { upsert: true },
              ))
            ) {
              this.logger.log(
                `${status.user.screen_name}/${status.id_str}`,
                `CrawlammaService/${name}`,
              );

              newTweets++;

              if (moment(tweeter.blockedTimeout ?? 0).isBefore(moment()))
                if (moment(cache.reset ?? 0).isAfter(moment())) {
                  if (
                    5 < status.full_text.replace(/[^\u0d00-\u0d7f]/g, '').length
                  )
                    cache.remainingTweets = [
                      ...(cache.remainingTweets ?? []),
                      {
                        tweeterId: status.user.id_str,
                        tweetFrequency: tweeter.tweetFrequency,
                        tweetId: status.id_str,
                      },
                    ];
                } else {
                  // sampler
                  if (moment(cache.samplingTimeout ?? 0).isBefore(moment())) {
                    cache.samplingTimeout = moment().add(3, 'minutes');

                    if (
                      (cache.retweeted ?? 5) < 5 &&
                      30 < (cache.remainingTweets ?? []).length
                    ) {
                      const remainingTweets = [];

                      // prettier-ignore
                      for (const group of Object.values(groupBy(cache.remainingTweets, 'tweeterId')))
                        remainingTweets.push(sortBy(group, ['tweetFrequency']).pop());

                      for (
                        i = 5 - cache.retweeted;
                        0 < i && 30 < remainingTweets.length;
                        i--
                      ) {
                        // prettier-ignore
                        const [remainingTweet] = remainingTweets.splice(random(remainingTweets.length - 1), 1);

                        try {
                          // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
                          await client.post('statuses/retweet', {
                            id: remainingTweet.tweetId,
                          });
                        } catch (e) {
                          this.logger.error(
                            e,
                            `*/${remainingTweet.tweetId}`,
                            `TwitterService/${name}`,
                          );

                          if ('errors' in e)
                            switch (e.errors[0].code) {
                              case 136:
                                await this.usersTable.updateOne(
                                  { _id: remainingTweet.tweeterId },
                                  {
                                    $set: {
                                      blockedTimeout: moment()
                                        .add(90, 'days')
                                        .toDate(),
                                    },
                                  },
                                );
                                break;

                              case 185:
                                cache.reset = moment().add(15, 'minutes');
                                break;
                            }
                        }
                      }

                      if (moment(cache.reset ?? 0).isBefore(moment()))
                        cache.remainingTweets = [];
                    }

                    cache.retweeted =
                      5 < (cache.retweeted ?? 0) ? cache.retweeted - 5 : 0;
                  }

                  // retweeter
                  if (
                    status.full_text.match(/[\u0d00-\u0d7f]{3,}/) &&
                    !status.retweeted &&
                    !status.full_text.startsWith(
                      `RT @${status.retweeted_status?.user?.screen_name}: ${(
                        status.retweeted_status?.full_text ?? ''
                      ).substr(0, 110)}`,
                    )
                  )
                    if (
                      !tweeter.tweetFrequency ||
                      cache.tweetFrequency < tweeter.tweetFrequency
                    ) {
                      cache.retweeted += 1;

                      try {
                        // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
                        await client.post('statuses/retweet', {
                          id: status.id_str,
                        });
                      } catch (e) {
                        this.logger.error(
                          e,
                          `${status.user.screen_name}/${status.id_str}`,
                          `CrawlammaService/${name}`,
                        );

                        if ('errors' in e)
                          switch (e.errors[0].code) {
                            case 136:
                              await this.usersTable.updateOne(
                                { _id: status.user.id_str },
                                {
                                  $set: {
                                    blockedTimeout: moment()
                                      .add(90, 'days')
                                      .toDate(),
                                  },
                                },
                              );
                              break;

                            case 185:
                              cache.remainingTweets = [
                                ...(cache.remainingTweets ?? []),
                                {
                                  tweeterId: status.user.id_str,
                                  tweetFrequency: tweeter.tweetFrequency,
                                  tweetId: status.id_str,
                                },
                              ];

                              cache.reset = moment().add(15, 'minutes');
                              break;
                          }
                      }
                    } else if (
                      5 <
                        status.full_text.replace(/[^\u0d00-\u0d7f]/g, '')
                          .length &&
                      !(status.entities?.urls ?? []).filter(
                        (entity) =>
                          !entity.expanded_url.match(
                            /^https?:\/\/(t\.co|twitter\.com)\//,
                          ),
                      ).length
                    )
                      cache.remainingTweets = [
                        ...(cache.remainingTweets ?? []),
                        {
                          tweeterId: status.user.id_str,
                          tweetFrequency: tweeter.tweetFrequency,
                          tweetId: status.id_str,
                        },
                      ];

                  // update profile details
                  if (
                    moment(cache.profileUpdatedAt ?? 0).isBefore(moment()) &&
                    (status.user.name.match(/[\u0d00-\u0d7f]{3,}/) ||
                      status.user.description.match(/[\u0d00-\u0d7f]{3,}/)) &&
                    !(cache.promotedUsers ?? []).includes(status.user.id_str)
                  ) {
                    cache.profileUpdatedAt = moment().add(1, 'minute');

                    const description = `${status.user.name} (@${status.user.screen_name}) ${status.user.description}`
                      .replace(/\s+/g, ' ')
                      .trim();

                    try {
                      // account/update_profile => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile
                      await client.post('account/update_profile', {
                        description:
                          160 < description.length
                            ? description.substr(0, 160)
                            : description,
                        skip_status: true,
                      });
                    } catch (e) {
                      this.logger.error(
                        e,
                        description,
                        `CrawlammaService/${name}`,
                      );
                    }

                    if (
                      cache.tweetFrequency * 24 * 60 <
                      (cache.promotedUsers ?? []).length
                    )
                      cache.promotedUsers = [];
                    else
                      cache.promotedUsers = [
                        ...(cache.promotedUsers ?? []),
                        status.user.id_str,
                      ];
                  }
                }
            }
          }

          if (!newTweets) break;
        }

        const limit = await this.recentTable.findOne(
          { _id: new RegExp(`^${_id}\\|`) },
          null,
          { skip: 60000, sort: { _id: 'desc' } },
        );

        if (limit)
          await this.recentTable.deleteMany({
            $and: [
              { _id: new RegExp(`^${_id}\\|`) },
              { _id: { $lte: limit._id } },
            ],
          });
      });

    if (
      384 * 1024 * 1024 <
      (await this.usersTable.collection.stats()).storageSize
    )
      await this.usersTable.deleteMany({
        roles: { $size: 0 },
        tweeted_at: {
          $lt: moment().subtract(90, 'days').toDate(),
        },
      });

    return true;
  }
}

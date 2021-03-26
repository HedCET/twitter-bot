import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import BigInt from 'big-integer';
import { groupBy, random, sample, sortBy } from 'lodash';
import moment from 'moment';
import { Model } from 'mongoose';
import Twitter from 'twitter-lite';

import { model as recentModel, name as recentToken } from './recent.table';
import {
  friendsQuery,
  searchQuery,
  tweetInterface,
  tweeterInterface,
} from './twitter.interface';
import { model as usersModel, name as usersToken } from './users.table';

// const Twitter = require('twitter-lite');

@Injectable()
export class CrawlammaService {
  private cache: { [key: string]: any } = {};

  constructor(
    private readonly logger: Logger,
    @InjectModel(recentToken)
    private readonly recentTable: Model<recentModel>,
    @InjectModel(usersToken) private readonly usersTable: Model<usersModel>,
  ) { }

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

        this.logger.log(`account/verify_credentials`, name);

        // verify credentials
        try {
          await client.get('account/verify_credentials');
        } catch (e) {
          this.logger.error(e, 'account/verify_credentials', name);

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
            )} search/tweets requests, +${moment
              .duration(
                moment(response._headers.get('x-rate-limit-reset'), ['X']).diff(
                  moment(),
                ),
              )
              .asMilliseconds()}ms to reset`,
            name,
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

              // update friends list
              if (
                !status.user.following &&
                moment
                  .duration(moment().diff(moment($set.createdAt)))
                  .asMonths() <= 1 &&
                0.25 < $set.tweetFrequency
              ) {
                this.logger.log(
                  `friendships/create?follow=true&screen_name=${status.user.screen_name}`,
                  name,
                );

                try {
                  // friendships/create => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/post-friendships-create
                  await client.post('friendships/create', {
                    follow: true,
                    user_id: status.user.id_str,
                  });
                } catch (e) {
                  this.logger.error(e, `friendships/create`, name);
                }
              }

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
                { $set: { text: status.full_text } },
                { upsert: true },
              ))
            ) {
              this.logger.log(
                `${status.user.screen_name}/${status.id_str}`,
                name,
              );

              newTweets++;

              if (moment(tweeter.blockedTimeout ?? 0).isBefore(moment()))
                if (moment(cache.reset ?? 0).isAfter(moment())) {
                  if (
                    5 < status.full_text.replace(/[^\u0d00-\u0d7f]/g, '').length
                  )
                    cache.remainingTweets = [
                      ...(cache.remainingTweets ?? []),
                      { tweeterId: status.user.id_str, tweetId: status.id_str },
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
                        remainingTweets.push(sample(group));

                      for (
                        i = 5 - cache.retweeted;
                        0 < i && 30 < remainingTweets.length;
                        i--
                      ) {
                        // prettier-ignore
                        const [remainingTweet] = remainingTweets.splice(random(remainingTweets.length - 1), 1);

                        this.logger.log(
                          `statuses/retweet?id=${remainingTweet.tweetId}`,
                          name,
                        );

                        try {
                          // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
                          await client.post('statuses/retweet', {
                            id: remainingTweet.tweetId,
                          });
                        } catch (e) {
                          this.logger.error(
                            e,
                            `statuses/retweet - */${remainingTweet.tweetId}`,
                            name,
                          );

                          if ('errors' in e)
                            switch (e.errors[0].code) {
                              case 136:
                                await this.usersTable.updateOne(
                                  { _id: remainingTweet.tweeterId },
                                  {
                                    $set: {
                                      blockedTimeout: moment()
                                        .add(30, 'days')
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

                      this.logger.log(
                        `statuses/retweet?id=${status.id_str}`,
                        name,
                      );

                      try {
                        // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
                        await client.post('statuses/retweet', {
                          id: status.id_str,
                        });
                      } catch (e) {
                        this.logger.error(
                          e,
                          `statuses/retweet - ${status.user.screen_name}/${status.id_str}`,
                          name,
                        );

                        if ('errors' in e)
                          switch (e.errors[0].code) {
                            case 136:
                              await this.usersTable.updateOne(
                                { _id: status.user.id_str },
                                {
                                  $set: {
                                    blockedTimeout: moment()
                                      .add(30, 'days')
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
                      .replace(/https?:\/\//gi, '')
                      .trim();

                    this.logger.log(
                      `account/update_profile?skip_status=true&description=${160 < description.length
                        ? `${description.substr(0, 159)}~`
                        : description
                      }`,
                      name,
                    );

                    try {
                      // account/update_profile => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile
                      await client.post('account/update_profile', {
                        description:
                          160 < description.length
                            ? `${description.substr(0, 159)}~`
                            : description,
                        skip_status: true,
                      });
                    } catch (e) {
                      this.logger.error(e, `account/update_profile`, name);
                    }

                    if (1440 * 7 < (cache.promotedUsers ?? []).length)
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

        // update friends list
        if (moment(cache.friendsUpdatedAt ?? 0).isBefore(moment())) {
          cache.friendsUpdatedAt = moment().add(15, 'minute');

          const requestQuery: friendsQuery = {
            count: 200,
            cursor: '-1',
            skip_status: true,
          };

          for (let i = 0; i < 15; i++) {
            // friends/list => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/get-friends-list
            const response: {
              _headers: { [key: string]: any };
              next_cursor_str: string;
              users: tweeterInterface[];
            } = await client.get('friends/list', requestQuery);

            this.logger.log(
              `remaining ${response._headers.get(
                'x-rate-limit-remaining',
              )}/${response._headers.get(
                'x-rate-limit-limit',
              )} friends/list requests, +${moment
                .duration(
                  moment(response._headers.get('x-rate-limit-reset'), [
                    'X',
                  ]).diff(moment()),
                )
                .asMilliseconds()}ms to reset`,
              name,
            );

            // set cursor for next iteration
            requestQuery.cursor = response.next_cursor_str;

            for await (const friend of response.users)
              if (
                1 <
                moment
                  .duration(
                    moment().diff(
                      moment(friend.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']),
                    ),
                  )
                  .asMonths()
              ) {
                this.logger.log(
                  `friendships/destroy?screen_name=${friend.screen_name}`,
                  name,
                );

                try {
                  // friendships/destroy => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/follow-search-get-users/api-reference/post-friendships-destroy
                  await client.post('friendships/destroy', {
                    user_id: friend.id_str,
                  });
                } catch (e) {
                  this.logger.error(e, `friendships/destroy`, name);
                }
              }

            if (
              !response.users.length ||
              response.users.length < requestQuery.count
            )
              break;
          }
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
          $lt: moment().subtract(30, 'days').toDate(),
        },
      });

    return true;
  }
}

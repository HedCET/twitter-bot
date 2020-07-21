import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { throttleTime } from 'rxjs/operators';
import * as twit from 'twit';

import { modelTokens } from './db.models';
import { env } from './env.validations';
import { MessageService } from './message.service';
import { scripts } from './scripts';
import { usersModel } from './users.model';

@Injectable()
export class ScriptService {
  constructor(
    private readonly logger: Logger,
    private readonly messageService: MessageService,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {
    this.logger.log(Object.keys(scripts), 'ScriptService/scripts');

    // script executer
    this.messageService.messages
      .pipe(throttleTime(1000 * 60))
      .subscribe(async statuses => {
        if (statuses.length) {
          for (const status of statuses)
            await this.messageService.removeMessage(status);

          // get users
          const users = await this.usersModel.find(
            {
              _id: { $in: Object.keys(scripts) },
              access_token: { $exists: true },
              access_token_secret: { $exists: true },
              blocked: { $ne: true },
            },
            null,
            { sort: { access_token_validated_at: 'desc' } },
          );

          for (const user of users) {
            // twitter instance
            const twitter = new twit({
              access_token: user.access_token,
              access_token_secret: user.access_token_secret,
              consumer_key: env.TWITTER_CONSUMER_KEY,
              consumer_secret: env.TWITTER_CONSUMER_SECRET,
              strictSSL: true,
              timeout_ms: 60 * 1000,
            });

            try {
              await twitter.get('account/verify_credentials', {
                skip_status: true,
              });
            } catch (error) {
              this.logger.error(
                error.message || error,
                'account/verify_credentials',
                `ScriptService/${user._id}`,
              );
              await this.usersModel.updateOne(
                { _id: user._id },
                { $set: { blocked: true } },
              );
              continue;
            }

            for (const status of statuses) {
              // get tweeter
              const tweeter = await this.usersModel.findOne(
                {
                  _id: status.user.screen_name,
                },
                {
                  _id: 1,
                  created_at: 1,
                  favourites: 1,
                  followers: 1,
                  friends: 1,
                  last_favourites_average: 1,
                  last_followers_average: 1,
                  last_friends_average: 1,
                  last_lists_average: 1,
                  last_tweeted_at_frequency: 1,
                  lists: 1,
                  tweeted_at: 1,
                  tweets: 1,
                },
              );

              try {
                // execute user script
                await scripts[user._id]({ tweeter, status, twitter, user });
              } catch (error) {
                this.logger.error(
                  error.message || error,
                  `${status.user.screen_name}/${status.id_str}`,
                  `scripts/${user._id}`,
                );
              }
            }
          }
        }
      });
  }
}

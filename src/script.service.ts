import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { omit } from 'lodash';
import { Model } from 'mongoose';
import { throttleTime } from 'rxjs/operators';
// import Twitter from 'twitter-lite';

import { modelTokens } from './db.models';
import { env } from './env.validations';
import { ScriptMessageService } from './script.message.service';
import { scripts } from './scripts';
import { usersModel } from './users.model';

const Twitter = require('twitter-lite');

@Injectable()
export class ScriptService {
  private readonly appProps = [
    'accessRevoked',
    'accessTokenKey',
    'accessTokenSecret',
    'roles',
  ];

  constructor(
    private readonly logger: Logger,
    private readonly scriptMessageService: ScriptMessageService,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {
    this.logger.log(Object.keys(scripts), 'ScriptService/scripts');

    // script executor
    this.scriptMessageService.messages
      .pipe(throttleTime(1000 * 60))
      .subscribe(async statuses => {
        if (statuses.length) {
          // clear stream
          for await (const status of statuses)
            await this.scriptMessageService.removeMessage(status);

          // get executors
          const executors = await this.usersModel.find(
            {
              accessRevoked: { $ne: true },
              accessTokenKey: { $exists: true },
              accessTokenSecret: { $exists: true },
              name: { $in: Object.keys(scripts) },
            },
            null,
            { sort: { accessTokenValidatedAt: 'desc' } },
          );

          for await (const executor of executors) {
            // twitter instance
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
              this.logger.error(
                e,
                'account/verify_credentials',
                `ScriptService/${executor.name}`,
              );

              // accessRevoked
              await this.usersModel.updateOne(
                { _id: executor._id },
                { $set: { accessRevoked: true } },
              );

              // skip
              continue;
            }

            for await (const status of statuses) {
              this.logger.log(
                `${status.user.screen_name}/${status.id_str}`,
                `ScriptService/${executor.name}`,
              );

              // get tweeter
              const tweeter = await this.usersModel.findOne(
                {
                  _id: status.user.id_str,
                },
                this.appProps.reduce(
                  (memory, value) => ({ ...memory, [value]: 0 }),
                  {},
                ),
              );

              try {
                // execute user script
                await scripts[executor.name]({
                  client,
                  executor: omit(executor, this.appProps),
                  tweeter: tweeter,
                  status,
                });
              } catch (e) {
                this.logger.error(
                  e,
                  `${status.user.screen_name}/${status.id_str}`,
                  `ScriptService/${executor.name}`,
                );
              }
            }
          }
        }
      });
  }
}

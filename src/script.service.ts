import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import { Model } from 'mongoose';
import * as path from 'path';
import { throttleTime } from 'rxjs/operators';
import * as twit from 'twit';

import { modelTokens } from './db.models';
import { env } from './env.validations';
import { MessageService } from './message.service';
import { usersModel } from './users.model';

@Injectable()
export class ScriptService {
  private scripts: { [key: string]: any } = {};

  constructor(
    private readonly logger: Logger,
    private readonly messageService: MessageService,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {
    this.config();
  }

  private async config() {
    const folder = path.resolve('./src/scripts');

    if (fs.existsSync(folder))
      for (const file of fs.readdirSync(folder))
        this.scripts[file.replace(/\.?[^\.]*$/, '')] = await import(
          path.resolve(folder, file)
        );

    this.messageService.messages
      .pipe(throttleTime(1000 * 60))
      .subscribe(async statuses => {
        if (statuses.length) {
          for (const status of statuses)
            await this.messageService.removeMessage(status);

          const users = await this.usersModel.find(
            {
              _id: { $in: Object.keys(this.scripts) },
              access_token: { $exists: true },
              access_token_secret: { $exists: true },
              blocked: { $ne: true },
            },
            null,
            { sort: { access_token_validated_at: 'desc' } },
          );

          for (const user of users) {
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
                error,
                'account/verify_credentials',
                `TwitterService/${user._id}`,
              );
              await this.usersModel.updateOne(
                { _id: user._id },
                { $set: { blocked: true } },
              );
              continue;
            }

            for (const status of statuses) {
              const tweeter = await this.usersModel.findOne({
                _id: status.user.screen_name,
              });

              try {
                await this.scripts[user._id]({
                  tweeter,
                  status,
                  twitter,
                  user,
                });
              } catch (error) {
                this.logger.error(
                  error,
                  `${status.user.screen_name}/${status.id_str}`,
                  `TwitterService/${user._id}`,
                );
              }
            }
          }
        }
      });
  }
}

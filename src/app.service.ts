import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { modelTokens } from './db.models';
import { usersModel } from './users.model';

@Injectable()
export class AppService {
  constructor(
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {}

  // search route handler
  async search(query: string = '') {
    const name = new RegExp(query, 'i');

    const hits = await this.usersModel.find(
      { name },
      { name: 1 },
      { limit: 10, sort: { tweetedAt: 'desc' } },
    );

    return {
      hits: hits.map(hit => hit.name),
      total:
        hits.length < 10
          ? hits.length
          : await this.usersModel.countDocuments({ name }),
    };
  }
}

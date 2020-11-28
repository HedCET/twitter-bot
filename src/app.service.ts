import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { PrivateProps, User, UserDocument } from './users.table';

@Injectable()
export class AppService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // search route handler
  async search(query: string = '', tags: string = '') {
    const name = new RegExp(query, 'i');

    const hits = await this.userModel.find(
      { name, ...(tags && { tags: { $in: tags.split('|') } }) },
      (PrivateProps ?? []).reduce((m, i) => ({ ...m, [i]: 0 }), {}),
      { limit: 10, sort: { tweetedAt: 'desc' } },
    );

    const total =
      hits.length < 10
        ? hits.length
        : await this.userModel.countDocuments({
            name,
            ...(tags && { tags: { $in: tags.split('|') } }),
          });

    return { hits, total };
  }
}

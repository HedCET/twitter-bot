import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { modelTokens } from './db.models';
import { env } from './env.validations';
import { jwtPayload } from './jwt.payload.interface';
import { usersModel } from './users.model';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.SECRET,
    });
  }

  async validate(payload: jwtPayload) {
    const user = await this.usersModel.findOne(
      { _id: payload._id, blocked: { $ne: true } },
      { _id: 1, roles: 1 },
    );

    if (user) return user;
    throw new UnauthorizedException();
  }
}
